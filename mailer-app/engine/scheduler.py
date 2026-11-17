"""Decides what each mailbox sends next, how fast, and when to stop. Plain rules, no AI."""
import datetime
import random
import re
import threading
import time

from . import config, db, mailer, templates, tracking


def daily_target(acct, today=None):
    """Random but stable-per-day target between daily_min and daily_cap (e.g. 80 to 100)."""
    today = today or db.now()
    hi = int(acct.get("daily_cap") or config.DEFAULT_DAILY_CAP)
    lo = min(int(acct.get("daily_min") or 0) or hi, hi)
    day = datetime.date.fromtimestamp(today).isoformat()
    return random.Random(f"{acct.get('email')}{day}").randint(lo, hi)


def allowed_today(acct, today=None):
    """Today's quota. New mailboxes warm up (10/day, +5 every 2 days) unless skip_warmup is set for an aged account."""
    target = daily_target(acct, today)
    if acct.get("skip_warmup"):
        return target
    start = acct.get("warmup_start") or db.now()
    today = today or db.now()
    days = max(0, int((today - start) // 86400))
    ramp = config.RAMP_START + config.RAMP_STEP * (days // config.RAMP_EVERY_DAYS)
    return min(target, ramp)


def sent_today(acct_id):
    midnight = datetime.datetime.combine(datetime.date.today(), datetime.time.min).timestamp()
    r = db.one("SELECT COUNT(*) n FROM messages WHERE account_id=? AND direction='out' AND ts>=?", (acct_id, midnight))
    return r["n"]


def in_window(hour=None):
    lo, hi = db.get_setting("send_window", list(config.SEND_WINDOW))
    hour = datetime.datetime.now().hour if hour is None else hour
    return lo <= hour < hi


def gap_seconds(acct, now_dt=None):
    """Spread what is left of today's quota over what is left of the window, with random jitter.
    If the laptop comes on late the gaps shrink so the day's target is still reached."""
    lo, hi = db.get_setting("send_window", list(config.SEND_WINDOW))
    now_dt = now_dt or datetime.datetime.now()
    end = now_dt.replace(hour=hi % 24, minute=0, second=0, microsecond=0)
    remaining_s = max(60.0, (end - now_dt).total_seconds())
    left = max(1, allowed_today(acct) - sent_today(acct["id"]))
    base = max(20.0, remaining_s / left)
    return random.uniform(0.5 * base, 1.5 * base)


def next_job(acct):
    """Follow-ups due first, then fresh leads. Returns (kind, lead, orig_message) or None."""
    days = db.get_setting("followup_after_days", config.FOLLOWUP_AFTER_DAYS)
    maxf = db.get_setting("max_followups", config.MAX_FOLLOWUPS)
    cutoff = db.now() - days * 86400
    due = db.q("""SELECT l.*, (SELECT COUNT(*) FROM messages m WHERE m.lead_id=l.id AND m.direction='out' AND m.kind='follow') nf,
                         (SELECT MAX(ts) FROM messages m WHERE m.lead_id=l.id AND m.direction='out') last_ts
                  FROM leads l WHERE l.status='sent'
                  AND l.email NOT IN (SELECT email FROM suppression)
                  AND EXISTS (SELECT 1 FROM messages m WHERE m.lead_id=l.id AND m.direction='out' AND m.account_id=?)
                  ORDER BY l.id""", (acct["id"],))
    for l in due:
        if l["nf"] < maxf and l["last_ts"] and l["last_ts"] <= cutoff:
            orig = db.one("SELECT * FROM messages WHERE lead_id=? AND direction='out' AND kind='first' ORDER BY ts LIMIT 1", (l["id"],))
            if orig:
                return "follow", l, orig
    # leads set aside for this mailbox first, then leads nobody has claimed, in the order of their numbers
    lead = db.one("""SELECT * FROM leads WHERE status='new' AND email NOT IN (SELECT email FROM suppression)
                     AND email NOT IN (SELECT email FROM sent_log)
                     AND email LIKE '%@%' AND (account_id IS NULL OR account_id=?)
                     ORDER BY (account_id IS NULL), COALESCE(num, id) LIMIT 1""", (acct["id"],))
    if lead:
        return "first", lead, None
    return None


def pause(acct, seconds, reason):
    db.run("UPDATE accounts SET paused_until=?, paused_reason=? WHERE id=?", (db.now() + seconds, reason, acct["id"]))


def bounce_guard(acct, window=40, limit=0.06):
    """Auto-pause a mailbox whose recent hard-bounce rate is too high: protects the sender reputation."""
    rows = db.q("""SELECT l.status FROM messages m JOIN leads l ON l.id=m.lead_id
                   WHERE m.account_id=? AND m.direction='out' AND m.kind='first' ORDER BY m.ts DESC LIMIT ?""", (acct["id"], window))
    if len(rows) >= window and sum(1 for r in rows if r["status"] == "bounced") / len(rows) > limit:
        pause(acct, 24 * 3600, f"bounce rate above {int(limit * 100)}% over the last {window} sends. Clean the lead list, then resume.")
        return True
    return False


def auto_push(acct):
    """Slowly raise a healthy mailbox's daily cap (it still stays random inside min..cap). Returns True if raised."""
    if not acct.get("auto_push") or (acct.get("paused_until") or 0) > db.now():
        return False
    if db.now() - (acct.get("last_push_ts") or acct.get("warmup_start") or 0) < config.AUTO_PUSH_EVERY_DAYS * 86400:
        return False
    cap = int(acct.get("daily_cap") or 0)
    if cap >= config.AUTO_PUSH_MAX:
        return False
    rows = db.q("""SELECT l.status FROM messages m JOIN leads l ON l.id=m.lead_id
                   WHERE m.account_id=? AND m.direction='out' AND m.kind='first' ORDER BY m.ts DESC LIMIT 60""", (acct["id"],))
    if len(rows) < 40 or sum(1 for r in rows if r["status"] == "bounced") / len(rows) > config.AUTO_PUSH_MAX_BOUNCE:
        return False
    new_cap = min(config.AUTO_PUSH_MAX, cap + config.AUTO_PUSH_STEP)
    db.run("UPDATE accounts SET daily_cap=?, daily_min=?, last_push_ts=? WHERE id=?",
           (new_cap, max(config.DEFAULT_DAILY_CAP, new_cap - 20), db.now(), acct["id"]))
    return True


def settings_blob():
    return {
        "sender_name": db.get_setting("sender_name", ""),
        "postal_address": db.get_setting("postal_address", ""),
        "templates": db.get_setting("templates", {}),
    }


def send_one(acct, sender=None):
    """Send exactly one email from this account if allowed. Returns a status string."""
    sender = sender or mailer.smtp_send
    if not acct.get("enabled"):
        return "disabled"
    if (acct.get("paused_until") or 0) > db.now():
        return "paused"
    if sent_today(acct["id"]) >= allowed_today(acct):
        return "cap_reached"
    job = next_job(acct)
    if not job:
        return "nothing_to_send"
    kind, lead, orig = job
    s = settings_blob()
    try:
        subj, body = templates.render("first" if kind == "first" else "follow", lead, s,
                                      orig_subject=(orig or {}).get("subject", ""))
    except ValueError as e:
        return f"template_error:{e}"
    token = mailer.new_token()
    track = db.get_setting("track_opens", True)
    track_base = db.get_setting("tracker_url", config.DEFAULT_TRACKER) if track else None
    msg = mailer.build_message(acct, lead["email"], subj, body,
                               in_reply_to=(orig or {}).get("message_id"),
                               references=(orig or {}).get("message_id"),
                               track_base=track_base, token=token)
    # Lock the lead first so a crash can never double-send it.
    db.run("UPDATE leads SET status='sending' WHERE id=?", (lead["id"],))
    try:
        sender(acct, msg)
    except Exception as e:
        db.run("UPDATE leads SET status=? WHERE id=?", ("new" if kind == "first" else "sent", lead["id"]))
        if re.search(r"(rate limit|quota|limit exceeded|suspend|disabled|blocked|authentication|535|550 5\.4|spam)", str(e), re.I):
            pause(acct, 6 * 3600, f"provider refused sending: {str(e)[:120]}")
        return f"send_error:{e}"
    db.run("""INSERT INTO messages(account_id,lead_id,direction,kind,message_id,in_reply_to,subject,body,to_addr,from_addr,ts,token)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
           (acct["id"], lead["id"], "out", kind, msg["Message-ID"], msg.get("In-Reply-To") or "", subj, body,
            lead["email"], acct["email"], db.now(), token))
    db.run("UPDATE leads SET status='sent' WHERE id=?", (lead["id"],))
    db.run("INSERT OR IGNORE INTO sent_log(email, first_ts, account) VALUES(?,?,?)", (lead["email"], db.now(), acct["email"]))
    db.run("UPDATE accounts SET last_send_ts=? WHERE id=?", (db.now(), acct["id"]))
    return "sent"


class Engine:
    """Background loop. One tick per second per mailbox; each mailbox sends on its own random gap."""

    def __init__(self, sender=None, sync=True):
        self.running = False
        self.alive = False
        self.thread = None
        self.sender = sender
        self.sync = sync
        self.next_at = {}
        self.last_sync = {}
        self.log = []

    def note(self, s):
        self.log.append(f"{datetime.datetime.now():%H:%M:%S} {s}")
        self.log = self.log[-200:]

    def boot(self):
        """Start the background loop. It always syncs replies and opens; it only sends while `running` is True."""
        if self.thread and self.thread.is_alive():
            return
        self.alive = True
        self.thread = threading.Thread(target=self.loop, daemon=True)
        self.thread.start()

    def start(self):
        self.boot()
        self.running = True

    def stop(self):
        self.running = False

    def tick(self):
        if time.time() - getattr(self, "last_pull", 0) > 60:
            self.last_pull = time.time()
            try:
                n = tracking.pull_opens()
                if n:
                    self.note(f"{n} new open(s) recorded")
            except Exception as e:
                self.note(f"open tracker not reachable: {str(e)[:80]}")
        for acct in db.q("SELECT * FROM accounts WHERE enabled=1"):
            if self.sync and time.time() - self.last_sync.get(acct["id"], 0) > 120:
                self.last_sync[acct["id"]] = time.time()
                try:
                    c = mailer.sync_account(acct)
                    if c["new"]:
                        self.note(f"{acct['email']} synced {c}")
                except Exception as e:
                    self.note(f"{acct['email']} sync error: {e}")
            if auto_push(acct):
                self.note(f"{acct['email']} healthy: daily cap raised")
            if not self.running or not in_window():
                continue
            if time.time() < self.next_at.get(acct["id"], 0):
                continue
            res = send_one(acct, self.sender)
            if res == "sent" and bounce_guard(acct):
                self.note(f"{acct['email']} auto-paused: high bounce rate")
            if res == "sent":
                self.next_at[acct["id"]] = time.time() + gap_seconds(acct)
                self.note(f"{acct['email']} sent")
            elif res.startswith("send_error"):
                self.next_at[acct["id"]] = time.time() + 600
                self.note(f"{acct['email']} {res}")
            else:
                self.next_at[acct["id"]] = time.time() + 60
                if res not in ("nothing_to_send", "cap_reached"):
                    self.note(f"{acct['email']} {res}")

    def loop(self):
        while self.alive:
            try:
                self.tick()
            except Exception as e:
                self.note(f"loop error: {e}")
            time.sleep(1)
