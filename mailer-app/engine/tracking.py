"""Open tracking. Every email carries a tiny invisible picture that has a random code. When the person opens the
email their mail program asks the tracker for the picture and the tracker remembers the time. The app asks the
tracker about its own codes and shows the opens.

Honest limits: some mail programs load pictures before the person looks (Apple Mail privacy, security scanners),
and some people block pictures. So opens are a guide. Replies, bounces and opt-outs are read from the mailbox
itself and are exact.
"""
import requests

from . import config, db

PREFETCH_SECONDS = 20     # a "open" within this time of sending is a scanner, not a person


def record_open(token, ts, ua=""):
    m = db.one("SELECT lead_id, ts FROM messages WHERE token=? AND direction='out'", (token,))
    if not m:
        return False
    if ts and m["ts"] and ts - m["ts"] < PREFETCH_SECONDS:
        return False
    kind = "open_repeat" if db.one("SELECT 1 FROM events WHERE token=? AND type='open'", (token,)) else "open"
    if db.one("SELECT 1 FROM events WHERE token=? AND ts=?", (token, ts)):
        return False
    db.run("INSERT INTO events(token,lead_id,type,ts,detail) VALUES(?,?,?,?,?)", (token, m["lead_id"], kind, ts or db.now(), (ua or "")[:200]))
    return kind == "open"


def pull_opens():
    """Ask the tracker about the codes of recent emails. Returns how many emails were opened for the first time."""
    if not db.get_setting("track_opens", True):
        return 0
    base = db.get_setting("tracker_url", config.DEFAULT_TRACKER).rstrip("/")
    since = db.now() - 45 * 86400
    rows = db.q("SELECT token FROM messages WHERE direction='out' AND token IS NOT NULL AND ts>? ORDER BY ts DESC LIMIT 400", (since,))
    tokens = [r["token"] for r in rows]
    if not tokens:
        return 0
    n = 0
    for i in range(0, len(tokens), 100):
        r = requests.post(base + "/api/opens", json={"tokens": tokens[i:i + 100]}, timeout=30)
        r.raise_for_status()
        db.set_setting("tracker_configured", bool(r.json().get("configured", True)))
        for tok, evs in (r.json().get("opens") or {}).items():
            for ev in evs:
                if record_open(tok, float(ev.get("ts", 0)), ev.get("ua", "")):
                    n += 1
    return n
