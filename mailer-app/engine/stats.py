"""Every number shown in the app. All of it is counted from the local database, which is filled by the mailbox
itself (sent, replies, bounces, opt-outs) and by the open tracker (opens)."""
import datetime

from . import db


def _midnight(days_ago=0):
    d = datetime.date.today() - datetime.timedelta(days=days_ago)
    return datetime.datetime.combine(d, datetime.time.min).timestamp()


def _count(sql, args=()):
    return db.one(sql, args)["n"]


def totals(since=0, account_id=None, source=None):
    """The headline numbers for a time window. since=0 means all time."""
    aw = " AND m.account_id=%d" % int(account_id) if account_id else ""
    sw = " AND l.source=?" if source else ""
    sa = (source,) if source else ()
    sent = _count(f"SELECT COUNT(*) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE m.direction='out' AND m.ts>=?{aw}{sw}", (since,) + sa)
    people = _count(f"SELECT COUNT(DISTINCT m.lead_id) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE m.direction='out' AND m.ts>=?{aw}{sw}", (since,) + sa)
    replies = _count(f"SELECT COUNT(DISTINCT m.lead_id) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE m.direction='in' AND m.kind IN ('reply','unsub') AND m.ts>=?{aw}{sw}", (since,) + sa)
    optouts = _count(f"SELECT COUNT(DISTINCT m.lead_id) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE m.direction='in' AND m.kind='unsub' AND m.ts>=?{aw}{sw}", (since,) + sa)
    bounces = _count(f"SELECT COUNT(DISTINCT m.lead_id) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE m.direction='in' AND m.kind='bounce_hard' AND m.ts>=?{aw}{sw}", (since,) + sa)
    opened = _count(f"""SELECT COUNT(DISTINCT m.lead_id) n FROM events e JOIN messages m ON m.token=e.token JOIN leads l ON l.id=m.lead_id
                        WHERE e.type='open' AND e.ts>=?{aw}{sw}""", (since,) + sa)
    delivered = max(0, people - bounces)

    def pct(a, b):
        return round(100.0 * a / b, 1) if b else 0.0
    return {"sent": sent, "people": people, "delivered": delivered, "opened": opened, "replies": replies, "optouts": optouts,
            "bounces": bounces, "open_rate": pct(opened, delivered), "reply_rate": pct(replies, delivered),
            "bounce_rate": pct(bounces, people)}


def series(days=14):
    out = []
    for i in range(days - 1, -1, -1):
        t0, t1 = _midnight(i), _midnight(i) + 86400
        out.append({
            "date": datetime.date.fromtimestamp(t0).isoformat(),
            "sent": _count("SELECT COUNT(*) n FROM messages WHERE direction='out' AND ts>=? AND ts<?", (t0, t1)),
            "opens": _count("SELECT COUNT(DISTINCT token) n FROM events WHERE type='open' AND ts>=? AND ts<?", (t0, t1)),
            "replies": _count("SELECT COUNT(DISTINCT lead_id) n FROM messages WHERE direction='in' AND kind IN ('reply','unsub') AND ts>=? AND ts<?", (t0, t1)),
        })
    return out


def by_list():
    rows = db.q("SELECT source, COUNT(*) leads FROM leads GROUP BY source ORDER BY MAX(created) DESC")
    for r in rows:
        r["name"] = r["source"] or "Added by hand"
        r.update(totals(0, None, r["source"]))
    return rows


def activity(limit=40):
    """The latest things that happened, newest first."""
    out = []
    for r in db.q("""SELECT m.ts, m.kind, m.direction, m.subject, l.email lead, l.biz, m.from_addr FROM messages m
                     LEFT JOIN leads l ON l.id=m.lead_id ORDER BY m.ts DESC LIMIT ?""", (limit,)):
        if r["direction"] == "out":
            what = "Follow-up sent" if r["kind"] == "follow" else "Email sent"
        else:
            what = {"reply": "Replied", "unsub": "Asked to stop", "bounce_hard": "Bounced (address does not exist)",
                    "bounce_soft": "Delayed (mailbox full or busy)"}.get(r["kind"], r["kind"])
        out.append({"ts": r["ts"], "what": what, "who": r["lead"] or r["from_addr"] or "", "biz": r["biz"] or "", "subject": r["subject"] or ""})
    for r in db.q("""SELECT e.ts, l.email lead, l.biz FROM events e LEFT JOIN leads l ON l.id=e.lead_id
                     WHERE e.type='open' ORDER BY e.ts DESC LIMIT ?""", (limit,)):
        out.append({"ts": r["ts"], "what": "Opened the email", "who": r["lead"] or "", "biz": r["biz"] or "", "subject": ""})
    out.sort(key=lambda x: -x["ts"])
    return out[:limit]


def lead_counts():
    return {r["status"]: r["n"] for r in db.q("SELECT status, COUNT(*) n FROM leads GROUP BY status")}
