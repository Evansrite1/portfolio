"""The outreach list: every lead the app found, the message for it, and what happened next (sent, replied, failed).
Kept in a small database on this computer. Everything on the Stats screen is counted from here."""
import datetime
import json
import sqlite3
import threading
import time

_lock = threading.RLock()
_db = {"conn": None, "path": None}

STATUSES = ("new", "sent", "replied", "failed", "skipped")


def open_db(path):
    with _lock:
        c = sqlite3.connect(str(path), check_same_thread=False, timeout=30)
        c.row_factory = sqlite3.Row
        c.executescript("""
        CREATE TABLE IF NOT EXISTS leads(
          handle TEXT PRIMARY KEY, link TEXT, name TEXT, country TEXT, what TEXT, service TEXT,
          message TEXT, status TEXT DEFAULT 'new', created REAL, sent_at REAL, replied_at REAL,
          thread TEXT DEFAULT '', error TEXT DEFAULT '', attempts INTEGER DEFAULT 0, data TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, handle TEXT, type TEXT, detail TEXT DEFAULT '');
        CREATE INDEX IF NOT EXISTS ix_ev ON events(type, ts);
        """)
        c.commit()
        _db["conn"], _db["path"] = c, str(path)
    return c


def _c():
    if _db["conn"] is None:
        raise RuntimeError("The outreach list is not open")
    return _db["conn"]


def q(sql, args=()):
    with _lock:
        return [dict(r) for r in _c().execute(sql, args).fetchall()]


def one(sql, args=()):
    with _lock:
        r = _c().execute(sql, args).fetchone()
        return dict(r) if r else None


def run(sql, args=()):
    with _lock:
        cur = _c().execute(sql, args)
        _c().commit()
        return cur.lastrowid


def event(handle, kind, detail=""):
    run("INSERT INTO events(ts,handle,type,detail) VALUES(?,?,?,?)", (time.time(), handle, kind, str(detail)[:300]))


def add_row(row):
    """A lead row from a search run. Returns True when it is new."""
    h = (row.get("handle") or "").lower().lstrip("@")
    if not h or one("SELECT 1 FROM leads WHERE handle=?", (h,)):
        return False
    run("""INSERT INTO leads(handle,link,name,country,what,service,message,status,created,data) VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (h, row.get("instagram_link") or f"https://www.instagram.com/{h}/", row.get("name", ""), row.get("country", ""),
         row.get("what_they_do", ""), row.get("service", ""), row.get("message", ""), "new", time.time(),
         json.dumps({k: row.get(k) for k in ("niche", "city", "followers", "website", "category")}, ensure_ascii=False)))
    event(h, "found")
    return True


def add_handles(handles, message=""):
    n = 0
    for h in handles:
        h = h.lower().lstrip("@").strip()
        if not h or one("SELECT 1 FROM leads WHERE handle=?", (h,)):
            continue
        run("INSERT INTO leads(handle,link,message,status,created) VALUES(?,?,?,?,?)", (h, f"https://www.instagram.com/{h}/", message, "new", time.time()))
        event(h, "found")
        n += 1
    return n


def list_leads(status=None, text=None, limit=500):
    where, args = [], []
    if status:
        where.append("status=?"); args.append(status)
    if text:
        where.append("(handle LIKE ? OR name LIKE ? OR what LIKE ?)"); args += [f"%{text}%"] * 3
    w = ("WHERE " + " AND ".join(where)) if where else ""
    return q(f"SELECT handle,link,name,country,what,message,status,sent_at,replied_at,error,attempts FROM leads {w} ORDER BY created DESC LIMIT ?", tuple(args) + (limit,))


def next_to_send():
    return one("SELECT * FROM leads WHERE status='new' AND TRIM(message)<>'' ORDER BY created LIMIT 1")


def mark_sent(handle, thread=""):
    run("UPDATE leads SET status='sent', sent_at=?, thread=?, error='' WHERE handle=?", (time.time(), thread, handle))
    event(handle, "sent")


def mark_failed(handle, why, final=False):
    run("UPDATE leads SET attempts=attempts+1, error=?, status=CASE WHEN ?=1 OR attempts+1>=3 THEN 'failed' ELSE status END WHERE handle=?",
        (why[:200], 1 if final else 0, handle))
    event(handle, "failed", why)


def mark_replied(handle, snippet=""):
    r = one("SELECT status FROM leads WHERE handle=?", (handle,))
    if not r or r["status"] == "replied":
        return False
    run("UPDATE leads SET status='replied', replied_at=? WHERE handle=?", (time.time(), handle))
    event(handle, "reply", snippet)
    return True


def set_message(handle, text):
    run("UPDATE leads SET message=? WHERE handle=? AND status IN ('new','failed')", (str(text)[:2000], handle))


def set_status(handle, status):
    if status in ("new", "skipped"):
        run("UPDATE leads SET status=?, error='', attempts=0 WHERE handle=? AND status IN ('new','failed','skipped')", (status, handle))


def delete(handle):
    run("DELETE FROM leads WHERE handle=? AND status IN ('new','failed','skipped')", (handle,))


def sent_since(ts):
    return one("SELECT COUNT(*) n FROM events WHERE type='sent' AND ts>=?", (ts,))["n"]


def midnight(days_ago=0):
    d = datetime.date.today() - datetime.timedelta(days=days_ago)
    return datetime.datetime.combine(d, datetime.time.min).timestamp()


def stats(days=14):
    def n(kind, since=0):
        return one("SELECT COUNT(*) n FROM events WHERE type=? AND ts>=?", (kind, since))["n"]
    sent_all, replies_all = n("sent"), n("reply")
    series = []
    for i in range(days - 1, -1, -1):
        t0, t1 = midnight(i), midnight(i) + 86400
        series.append({"date": datetime.date.fromtimestamp(t0).isoformat(),
                       "sent": one("SELECT COUNT(*) n FROM events WHERE type='sent' AND ts>=? AND ts<?", (t0, t1))["n"],
                       "replies": one("SELECT COUNT(*) n FROM events WHERE type='reply' AND ts>=? AND ts<?", (t0, t1))["n"]})
    by_status = {r["status"]: r["n"] for r in q("SELECT status, COUNT(*) n FROM leads GROUP BY status")}
    by_service = q("""SELECT service, COUNT(*) leads, SUM(status IN ('sent','replied')) sent, SUM(status='replied') replies
                      FROM leads GROUP BY service ORDER BY leads DESC""")
    by_country = q("""SELECT country, COUNT(*) leads, SUM(status IN ('sent','replied')) sent, SUM(status='replied') replies
                      FROM leads WHERE country<>'' GROUP BY country ORDER BY sent DESC LIMIT 8""")
    contacted = (by_status.get("sent", 0) + by_status.get("replied", 0)) or 0
    return {
        "found": sum(by_status.values()), "by_status": by_status, "contacted": contacted,
        "sent_all": sent_all, "sent_today": n("sent", midnight(0)), "sent_week": n("sent", midnight(6)),
        "replies_all": replies_all, "replies_week": n("reply", midnight(6)),
        "reply_rate": round(100.0 * by_status.get("replied", 0) / contacted, 1) if contacted else 0.0,
        "failed": by_status.get("failed", 0), "series": series, "by_service": by_service, "by_country": by_country,
        "recent": q("SELECT e.ts, e.type, e.handle, e.detail FROM events e WHERE e.type<>'found' ORDER BY e.ts DESC LIMIT 30"),
    }
