"""Checks on an email address before it is handed over as a lead: the shape is right, the domain can receive mail (it has a mail
server record, looked up over DNS-over-HTTPS), and the address is not a throwaway or a made-up one. A mailbox can only be proven by
sending to it, so this lowers bounces a lot but cannot remove them."""
import re
import threading

import requests

EMAIL = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$")
DISPOSABLE = {"mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com", "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com"}
GENERIC = {"info", "contact", "hello", "admin", "sales", "support", "office", "enquiries", "inquiries", "mail", "service", "booking", "reservations", "team", "hi", "help"}
FREE = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "live.com", "proton.me", "protonmail.com"}
_cache = {}
_lock = threading.Lock()


def has_mx(domain, timeout=6):
    """True when the domain publishes a mail server. Falls back to an address record, as mail rules allow. None if the lookup failed."""
    domain = domain.lower()
    with _lock:
        if domain in _cache:
            return _cache[domain]
    res = None
    try:
        for kind in ("MX", "A"):
            r = requests.get("https://cloudflare-dns.com/dns-query", params={"name": domain, "type": kind}, headers={"accept": "application/dns-json"}, timeout=timeout)
            j = r.json()
            if j.get("Status") == 3:
                res = False                                  # the domain does not exist
                break
            if j.get("Answer"):
                res = True
                break
            res = False
    except Exception:
        res = None
    with _lock:
        _cache[domain] = res
    return res


def check(email):
    """Returns dict(ok, reason, kind, free). ok False means leave it out."""
    e = str(email or "").strip().lower()
    if not EMAIL.match(e):
        return {"ok": False, "reason": "not a valid address", "kind": "", "free": False}
    local, _, dom = e.partition("@")
    if dom in DISPOSABLE:
        return {"ok": False, "reason": "throwaway mail service", "kind": "", "free": False}
    if len(local) > 40 or re.search(r"\d{9,}", local):
        return {"ok": False, "reason": "looks made up", "kind": "", "free": False}
    mx = has_mx(dom)
    if mx is False:
        return {"ok": False, "reason": "the domain cannot receive mail", "kind": "", "free": False}
    kind = "generic" if local.split(".")[0].split("_")[0] in GENERIC else "personal"
    return {"ok": True, "reason": "domain accepts mail" if mx else "domain could not be checked", "kind": kind, "free": dom in FREE, "checked": mx is True}


def first_name(email, business=""):
    """A first name guess from a personal address (ann.lee@x.com gives Ann). Empty for info@ style addresses."""
    local = email.split("@")[0].lower()
    if local.split(".")[0].split("_")[0] in GENERIC:
        return ""
    part = re.split(r"[._+-]", local)[0]
    return part.capitalize() if part.isalpha() and 2 < len(part) < 14 else ""
