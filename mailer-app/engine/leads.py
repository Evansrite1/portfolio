"""Lead lists. A lead is an email address plus any extra columns you want to use in the message."""
import csv
import io
import json
import re

from . import db

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
JUNK = ("example.com", "sentry", "wixpress", "domain.com", "yourdomain", ".png", ".jpg", ".gif", ".webp")
KNOWN = {"email", "e-mail", "mail", "first", "first name", "firstname", "name", "biz", "business", "company", "city", "website", "site"}


def clean_email(e):
    e = (e or "").strip().lower().strip(".,;:<>()[]\"'")
    if not EMAIL_RE.fullmatch(e) or any(j in e for j in JUNK):
        return None
    return e


def add_lead(email, first="", biz="", city="", website="", source="", data=None):
    e = clean_email(email)
    if not e:
        return "invalid"
    if db.one("SELECT 1 FROM suppression WHERE email=?", (e,)):
        return "suppressed"
    if db.one("SELECT 1 FROM leads WHERE email=?", (e,)):
        return "duplicate"
    db.run("INSERT INTO leads(email,first,biz,city,website,site_status,source,status,created,data) VALUES(?,?,?,?,?,?,?,?,?,?)",
           (e, first.strip(), biz.strip(), city.strip(), website.strip(), "UNKNOWN", source, "new", db.now(),
            json.dumps(data, ensure_ascii=False) if data else ""))
    return "added"


def import_csv(text, source="csv"):
    """Columns in any order and any case: email (required), first, business, city, website. Other columns become
    fields you can use in the message, for example a column called niche is {{niche}}."""
    out = {"added": 0, "duplicate": 0, "invalid": 0, "suppressed": 0}
    text = text.lstrip("\ufeff")
    try:
        dialect = csv.Sniffer().sniff(text[:4000], delimiters=",;\t")
    except Exception:
        dialect = csv.excel
    rd = csv.DictReader(io.StringIO(text), dialect=dialect)
    for row in rd:
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items() if k}
        em = r.get("email") or r.get("e-mail") or r.get("mail") or ""
        biz = r.get("biz") or r.get("business") or r.get("company") or ""
        first = r.get("first") or r.get("first name") or r.get("firstname") or r.get("name", "").split(" ")[0]
        extra = {k.replace(" ", "_"): v for k, v in r.items() if k not in KNOWN and v}
        res = add_lead(em, first, biz, r.get("city", ""), r.get("website") or r.get("site") or "", source, extra or None)
        out[res] += 1
    return out


# ---------------------------------------------------------------- column mapping and fixing, for the import screen
DOMAIN_TYPOS = {"gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gmail.con": "gmail.com", "gmail.co": "gmail.com",
                "gmail.cmo": "gmail.com", "gnail.com": "gmail.com", "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.con": "yahoo.com",
                "hotmial.com": "hotmail.com", "hotmail.con": "hotmail.com", "outlok.com": "outlook.com", "outlook.con": "outlook.com"}
TLD_TYPOS = {".con": ".com", ".cmo": ".com", ".vom": ".com", ".ocm": ".com", ".coom": ".com", ".comm": ".com"}
FIRST_H = ("first", "first name", "firstname", "given name", "name", "contact", "contact name", "owner", "full name", "fullname")
BIZ_H = ("biz", "business", "business name", "company", "company name", "organization", "organisation", "shop", "brand", "store")
CITY_H = ("city", "town", "location")
SITE_H = ("website", "site", "url", "web", "domain", "link")
EMAIL_H = ("email", "e-mail", "mail", "email address", "e-mail address", "contact email")


def extract_email(cell):
    """The first email address inside a cell, cleaned. A cell like Contact: MAILTO:Sam@X.com; gives sam@x.com."""
    t = str(cell or "").replace("mailto:", " ").replace("MAILTO:", " ")
    t = re.sub(r"\s*\(\s*at\s*\)\s*|\s+\[at\]\s+", "@", t, flags=re.I)
    m = EMAIL_RE.search(t)
    return clean_email(m.group(0)) if m else None


def suggest_fix(value):
    """A likely correction for an address that does not work, or None. Only common slips: a misspelt mail provider,
    a misspelt ending such as .con, a comma instead of a dot, spaces, or a doubled @."""
    v = str(value or "").strip().lower().replace(" ", "").strip(".,;:<>()[]\"'")
    v = v.replace("mailto:", "")
    v = re.sub(r"@+", "@", v)
    if v.count("@") != 1:
        return None
    local, domain = v.split("@")
    domain = domain.replace(",", ".")
    domain = DOMAIN_TYPOS.get(domain, domain)
    for bad, good in TLD_TYPOS.items():
        if domain.endswith(bad):
            domain = domain[: -len(bad)] + good
    fixed = local + "@" + domain
    if EMAIL_RE.fullmatch(fixed) and fixed != str(value or "").strip().lower() and clean_email(fixed):
        return fixed
    return None


def parse_table(text):
    """Returns (headers, rows). With no header row (the first row already holds an email) the columns are named Column 1, 2..."""
    text = str(text or "").lstrip("﻿")
    try:
        dialect = csv.Sniffer().sniff(text[:4000], delimiters=",;\t|")
    except Exception:
        dialect = csv.excel
    rows = [r for r in csv.reader(io.StringIO(text), dialect=dialect) if any(c.strip() for c in r)]
    if not rows:
        return [], []
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    if any(EMAIL_RE.search(c) for c in rows[0]):
        return ["Column %d" % (i + 1) for i in range(width)], rows
    return [h.strip() or "Column %d" % (i + 1) for i, h in enumerate(rows[0])], rows[1:]


def guess_columns(headers, rows):
    """Which column holds what. Emails are found by looking at the values, so a column called anything works."""
    low = [h.lower() for h in headers]
    sample = rows[:60]

    def share(i, fn):
        vals = [r[i] for r in sample if r[i].strip()]
        return (sum(1 for v in vals if fn(v)) / len(vals)) if vals else 0

    out = {"email": None, "first": None, "biz": None, "city": None, "website": None}
    best = 0
    for i in range(len(headers)):
        s = share(i, lambda v: bool(extract_email(v)))
        if low[i] in EMAIL_H:
            s += 0.5
        if s > best and s >= 0.3:
            best, out["email"] = s, i
    used = {out["email"]}

    def by_header(names):
        for n in names:
            for i, h in enumerate(low):
                if h == n and i not in used:
                    return i
        return None
    for key, names in (("biz", BIZ_H), ("first", FIRST_H), ("city", CITY_H), ("website", SITE_H)):
        i = by_header(names)
        if i is not None:
            out[key] = i
            used.add(i)
    if out["website"] is None:
        for i in range(len(headers)):
            if i not in used and share(i, lambda v: bool(re.match(r"^(https?://)?[\w-]+(\.[\w-]+)+(/.*)?$", v.strip())) and "@" not in v) >= 0.6:
                out["website"] = i
                used.add(i)
                break
    return out


def analyze(text):
    headers, rows = parse_table(text)
    guess = guess_columns(headers, rows) if rows else {}
    return {"headers": headers, "total": len(rows), "guess": guess, "sample": rows[:8]}


def check_rows(text, email_col):
    """Rows whose address does not work, with a suggested fix. Shown before importing so they can be corrected."""
    headers, rows = parse_table(text)
    out = []
    if email_col is None:
        return out
    for i, r in enumerate(rows):
        raw = r[email_col] if email_col < len(r) else ""
        if not raw.strip():
            out.append({"row": i, "value": "", "suggestion": None, "why": "empty"})
            continue
        found = extract_email(raw)
        if found:
            fix = suggest_fix(found)
            if fix:                                   # a valid shape but a known slip, such as gmial.com
                out.append({"row": i, "value": found, "suggestion": fix, "why": "looks misspelt"})
            continue
        out.append({"row": i, "value": raw, "suggestion": suggest_fix(raw), "why": "not a valid address"})
    return out


def import_mapped(text, mapping, source="csv", fixes=None, skip=None):
    """Import with the columns the person confirmed. fixes: {row: {email, first, biz, city, website}} typed on the screen."""
    headers, rows = parse_table(text)
    fixes, skip = fixes or {}, set(skip or [])
    out = {"added": 0, "duplicate": 0, "invalid": 0, "suppressed": 0, "skipped": 0}
    used = {v for v in mapping.values() if isinstance(v, int)}
    extras = [i for i in range(len(headers)) if i not in used]

    def cell(r, k):
        i = mapping.get(k)
        return r[i].strip() if isinstance(i, int) and i < len(r) else ""
    for n, r in enumerate(rows):
        if n in skip:
            out["skipped"] += 1
            continue
        fx = fixes.get(str(n)) or fixes.get(n) or {}
        em = fx.get("email") or extract_email(cell(r, "email"))
        if not em and mapping.get("email") is None:
            em = next((extract_email(c) for c in r if extract_email(c)), None)
        first = fx.get("first", cell(r, "first"))
        fi = mapping.get("first")
        if isinstance(fi, int) and re.search(r"\s", first or "") and "first" not in headers[fi].lower() and not fx.get("first"):
            first = first.split()[0]
        extra = {headers[i].lower().replace(" ", "_"): r[i].strip() for i in extras if i < len(r) and r[i].strip()}
        res = add_lead(em or "", first, fx.get("biz", cell(r, "biz")), fx.get("city", cell(r, "city")), fx.get("website", cell(r, "website")), source, extra or None)
        out[res] += 1
    return out


def update_lead(lead_id, fields):
    """Fix a lead that has not been emailed yet. The next email uses the new values."""
    row = db.one("SELECT * FROM leads WHERE id=?", (int(lead_id),))
    if not row:
        return "missing"
    if row["status"] != "new":
        return "locked"
    sets, args = [], []
    if "email" in fields:
        e = clean_email(fields["email"])
        if not e:
            return "invalid"
        if e != row["email"] and db.one("SELECT 1 FROM leads WHERE email=?", (e,)):
            return "duplicate"
        sets.append("email=?")
        args.append(e)
    for k in ("first", "biz", "city", "website"):
        if k in fields:
            sets.append(k + "=?")
            args.append(str(fields[k]).strip()[:200])
    if not sets:
        return "ok"
    db.run("UPDATE leads SET " + ", ".join(sets) + " WHERE id=?", tuple(args) + (row["id"],))
    return "ok"
