"""Writing the email. Plain merge fields and {a|b|c} wording variants. No AI.

Fields: {{first}} {{biz}} {{city}} {{website}} {{email}} and any other column in the CSV (use the column name in lower case).
{{first_or_there}} is the first name, or "there" when there is none. {{sender_name}} is the name set in Settings.
{good|great|nice} picks one wording per lead and keeps it the same for that lead's follow-up.
"""
import hashlib
import re

DEFAULTS = {
    "first_subject": "{quick question|a quick idea|question} for {{biz}}",
    "first_body": ("Hi {{first_or_there}},\n\n"
                   "{I came across|I found|I noticed} {{biz}} and I would like to help you get more customers.\n\n"
                   "{Would you be open to a short call this week?|Are you free for a quick chat this week?}\n\n"
                   "{{sender_name}}"),
    "follow_subject": "Re: {{orig_subject}}",
    "follow_body": ("Hi {{first_or_there}},\n\n"
                    "Just following up on my last email about {{biz}}. Is this something you would like to look at?\n\n"
                    "{{sender_name}}"),
}

_VAR = re.compile(r"\{\{(\w+)\}\}")
_SPIN = re.compile(r"\{([^{}|]+(?:\|[^{}]+)+)\}")


def _pick(options, seed):
    return options[int(hashlib.sha256(seed.encode()).hexdigest(), 16) % len(options)]


def spin(text, seed):
    return _SPIN.sub(lambda m: _pick(m.group(1).split("|"), seed + m.group(1)), text)


def fill(text, ctx):
    return _VAR.sub(lambda m: str(ctx.get(m.group(1).lower(), "")), text)


def context(lead, settings, orig_subject=""):
    import json
    ctx = {}
    try:
        extra = json.loads(lead.get("data") or "{}")
        if isinstance(extra, dict):
            ctx.update({str(k).lower(): str(v) for k, v in extra.items()})
    except Exception:
        pass
    first = (lead.get("first") or "").strip()
    ctx.update({"email": lead.get("email", ""), "first": first, "first_or_there": first or "there",
                "biz": lead.get("biz") or "your business", "city": lead.get("city", ""),
                "website": lead.get("website", ""), "sender_name": settings.get("sender_name", ""),
                "orig_subject": orig_subject})
    for k in ("biz", "first", "first_or_there", "city", "orig_subject", "website"):
        ctx[k] = re.sub(r"[{}|]", "", str(ctx.get(k, "")))
    return ctx


def footer(settings):
    line = "If you would rather not hear from me, reply \"stop\" and I will not email you again."
    addr = (settings.get("postal_address") or "").strip()
    return "\n\n--\n" + line + (("\n" + addr) if addr else "")


def render(kind, lead, settings, orig_subject=""):
    """kind is 'first' or 'follow'. Returns (subject, body)."""
    t = dict(DEFAULTS)
    t.update({k: v for k, v in (settings.get("templates") or {}).items() if v and str(v).strip()})
    ctx = context(lead, settings, orig_subject)
    seed = lead.get("email", "")
    subj = spin(fill(t[f"{kind}_subject"], ctx), seed + "s")
    body = spin(fill(t[f"{kind}_body"], ctx), seed + "b")
    return " ".join(subj.split()), body.strip() + footer(settings)


BUILTIN = {"email", "first", "first_or_there", "biz", "city", "website", "sender_name", "orig_subject"}


def known_fields():
    import json
    from . import db
    names = set(BUILTIN)
    for r in db.q("SELECT data FROM leads WHERE data<>'' LIMIT 2000"):
        try:
            names.update(str(k).lower() for k in json.loads(r["data"]))
        except Exception:
            pass
    return names


def unknown_fields(settings):
    """Field names used in the message that no lead has. Returns a sorted list."""
    t = dict(DEFAULTS)
    t.update({k: v for k, v in (settings.get("templates") or {}).items() if v and str(v).strip()})
    used = set()
    for v in t.values():
        used.update(m.lower() for m in _VAR.findall(v))
    return sorted(used - known_fields())


def problems(settings):
    """Things to fix before sending. Empty list means ready."""
    out = []
    bad = unknown_fields(settings)
    if bad:
        out.append("The message uses {{%s}} but your leads have no such column." % "}}, {{".join(bad))
    if not (settings.get("sender_name") or "").strip():
        out.append("Add your name in Settings, it signs the email.")
    t = settings.get("templates") or {}
    for k in ("first_subject", "first_body"):
        if not (t.get(k) or DEFAULTS[k]).strip():
            out.append("The first email needs a subject and a message.")
            break
    return out
