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
