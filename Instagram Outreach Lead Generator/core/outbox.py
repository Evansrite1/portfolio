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
          thread TEXT DEFAULT '', error TEXT DEFAULT '', attempts INTEGER DEFAULT 0, data TEXT DEFAULT '', account TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, handle TEXT, type TEXT, detail TEXT DEFAULT '');
        CREATE INDEX IF NOT EXISTS ix_ev ON events(type, ts);
        """)
        for tbl, col in (('leads', 'account'), ('events', 'account')):
            if col not in {r[1] for r in c.execute('PRAGMA table_info(%s)' % tbl)}:
                c.execute("ALTER TABLE %s ADD COLUMN %s TEXT DEFAULT ''" % (tbl, col))
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


def event(handle, kind, detail="", account=""):
    run("INSERT INTO events(ts,handle,type,detail,account) VALUES(?,?,?,?,?)", (time.time(), handle, kind, str(detail)[:300], account or ""))


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


def mark_sent(handle, thread="", account=""):
    run("UPDATE leads SET status='sent', sent_at=?, thread=?, error='', account=? WHERE handle=?", (time.time(), thread, account, handle))
    event(handle, "sent", "", account)


def mark_failed(handle, why, final=False, account=""):
    run("UPDATE leads SET attempts=attempts+1, error=?, status=CASE WHEN ?=1 OR attempts+1>=3 THEN 'failed' ELSE status END WHERE handle=?",
        (why[:200], 1 if final else 0, handle))
    event(handle, "failed", why, account)


def mark_replied(handle, snippet=""):
    r = one("SELECT status FROM leads WHERE handle=?", (handle,))
    if not r or r["status"] == "replied":
        return False
    run("UPDATE leads SET status='replied', replied_at=? WHERE handle=?", (time.time(), handle))
    acc = (one("SELECT account FROM leads WHERE handle=?", (handle,)) or {}).get("account", "")
    event(handle, "reply", snippet, acc)
    return True


def set_message(handle, text):
    run("UPDATE leads SET message=? WHERE handle=? AND status IN ('new','failed')", (str(text)[:2000], handle))


def set_status(handle, status):
    if status in ("new", "skipped"):
        run("UPDATE leads SET status=?, error='', attempts=0 WHERE handle=? AND status IN ('new','failed','skipped')", (status, handle))


def delete(handle):
    run("DELETE FROM leads WHERE handle=? AND status IN ('new','failed','skipped')", (handle,))


def sent_since(ts, account=None):
    if account:
        return one("SELECT COUNT(*) n FROM events WHERE type='sent' AND ts>=? AND account=?", (ts, account))["n"]
    return one("SELECT COUNT(*) n FROM events WHERE type='sent' AND ts>=?", (ts,))["n"]


def midnight(days_ago=0):
    d = datetime.date.today() - datetime.timedelta(days=days_ago)
    return datetime.datetime.combine(d, datetime.time.min).timestamp()


def stats(days=14, account=None):
    """Numbers for the whole outreach (account=None) or for one Instagram account."""
    acc_sql = " AND account=?" if account else ""
    acc_args = (account,) if account else ()

    def n(kind, since=0):
        return one("SELECT COUNT(*) n FROM events WHERE type=? AND ts>=?" + acc_sql, (kind, since) + acc_args)["n"]
    lead_acc = " WHERE account=?" if account else ""
    by_status = {r["status"]: r["n"] for r in q("SELECT status, COUNT(*) n FROM leads" + lead_acc + " GROUP BY status", acc_args)}
    if account:                                   # leads still waiting have no account yet, so show the shared waiting list
        by_status["new"] = one("SELECT COUNT(*) n FROM leads WHERE status='new'")["n"]
    sent_all, replies_all = n("sent"), n("reply")
    series = []
    for k in range(days - 1, -1, -1):
        t0, t1 = midnight(k), midnight(k) + 86400
        series.append({"date": datetime.date.fromtimestamp(t0).isoformat(),
                       "sent": one("SELECT COUNT(*) n FROM events WHERE type='sent' AND ts>=? AND ts<?" + acc_sql, (t0, t1) + acc_args)["n"],
                       "replies": one("SELECT COUNT(*) n FROM events WHERE type='reply' AND ts>=? AND ts<?" + acc_sql, (t0, t1) + acc_args)["n"]})
    by_service = q("""SELECT service, COUNT(*) leads, SUM(status IN ('sent','replied')) sent, SUM(status='replied') replies
                      FROM leads""" + lead_acc + """ GROUP BY service ORDER BY leads DESC""", acc_args)
    by_country = q("""SELECT country, COUNT(*) leads, SUM(status IN ('sent','replied')) sent, SUM(status='replied') replies
                      FROM leads WHERE country<>''""" + (" AND account=?" if account else "") + " GROUP BY country ORDER BY sent DESC LIMIT 8", acc_args)
    contacted = (by_status.get("sent", 0) + by_status.get("replied", 0)) or 0
    return {
        "account": account or "", "found": sum(by_status.values()), "by_status": by_status, "contacted": contacted,
        "sent_all": sent_all, "sent_today": n("sent", midnight(0)), "sent_week": n("sent", midnight(6)),
        "replies_all": replies_all, "replies_week": n("reply", midnight(6)),
        "reply_rate": round(100.0 * by_status.get("replied", 0) / contacted, 1) if contacted else 0.0,
        "failed": by_status.get("failed", 0), "series": series, "by_service": by_service, "by_country": by_country,
        "recent": q("SELECT e.ts, e.type, e.handle, e.detail, e.account FROM events e WHERE e.type<>'found'" + (" AND e.account=?" if account else "") + " ORDER BY e.ts DESC LIMIT 30", acc_args),
    }


def per_account(labels):
    """One row of numbers for each Instagram account: sent today, this week, in total, replies, reply rate, failed."""
    rows = []
    for aid, label in labels.items():
        st = stats(14, aid)
        rows.append({"id": aid, "label": label, "sent_today": st["sent_today"], "sent_week": st["sent_week"], "sent_all": st["sent_all"],
                     "replies": st["replies_all"], "reply_rate": st["reply_rate"], "failed": one("SELECT COUNT(*) n FROM events WHERE type='failed' AND account=?", (aid,))["n"]})
    return rows
