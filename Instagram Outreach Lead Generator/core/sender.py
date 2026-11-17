"""Sends the waiting messages one at a time, slowly, inside a daily limit, and checks the inbox for replies.

Why so slow: Instagram limits accounts that send many first messages quickly, and a limited account cannot message anyone
for hours or days. So the default is a few messages an hour at random gaps, inside the hours you choose, and the app stops
by itself the moment Instagram pushes back.
"""
import random
import threading
import time

from . import outbox

DEFAULTS = {"daily_cap": 12, "gap_min": 240, "gap_max": 420, "from_hour": 9, "to_hour": 20, "reply_check_minutes": 10}
HARD_CAP = 25


class Sender:
    def __init__(self, engine, get_settings, log):
        self.engine, self.get, self.log = engine, get_settings, log
        self.running = False
        self.message = "Stopped"
        self.next_at = 0.0
        self.last_check = 0.0
        self.fail_streak = 0
        self.paused_reason = ""
        self.busy = False
        self._t = None
        self._stop = threading.Event()

    # ---------- settings ----------
    def cfg(self):
        c = dict(DEFAULTS)
        c.update({k: v for k, v in (self.get() or {}).items() if k in DEFAULTS})
        c["daily_cap"] = max(1, min(HARD_CAP, int(c["daily_cap"])))
        c["gap_min"] = max(60, int(c["gap_min"]))
        c["gap_max"] = max(c["gap_min"], int(c["gap_max"]))
        return c

    def in_window(self, hour=None):
        c = self.cfg()
        hour = time.localtime().tm_hour if hour is None else hour
        return c["from_hour"] <= hour < c["to_hour"]

    def sent_today(self):
        return outbox.sent_since(outbox.midnight(0))

    # ---------- control ----------
    def boot(self):
        if self._t and self._t.is_alive():
            return
        self._stop.clear()
        self._t = threading.Thread(target=self._loop, daemon=True)
        self._t.start()

    def start(self):
        if not self.engine.status().get("logged_in"):
            raise RuntimeError("Log in to Instagram first")
        self.boot()
        self.paused_reason = ""
        self.fail_streak = 0
        self.running = True
        self.next_at = 0.0
        self.message = "Starting"

    def stop(self, why="Stopped"):
        self.running = False
        self.message = why

    def status(self):
        c = self.cfg()
        return {"running": self.running, "message": self.message, "paused_reason": self.paused_reason, "sent_today": self.sent_today(),
                "cap": c["daily_cap"], "in_window": self.in_window(), "from_hour": c["from_hour"], "to_hour": c["to_hour"],
                "next_in": max(0, int(self.next_at - time.time())) if self.running else 0, "waiting": outbox.one("SELECT COUNT(*) n FROM leads WHERE status='new' AND TRIM(message)<>''")["n"]}

    # ---------- the loop ----------
    def _loop(self):
        while not self._stop.is_set():
            try:
                self.tick()
            except Exception as e:  # noqa
                self.log(f"Sender problem: {e}")
                self.message = f"Problem: {e}"
            time.sleep(1)

    def tick(self, now=None):
        now = now or time.time()
        c = self.cfg()
        # replies are checked even when sending is off, as long as the browser is open and logged in
        if now - self.last_check > c["reply_check_minutes"] * 60 and not self.busy:
            self.last_check = now
            if outbox.one("SELECT 1 FROM leads WHERE status='sent' LIMIT 1") and self.engine.status().get("logged_in"):
                self.check_replies()
        if not self.running or self.busy:
            return
        if not self.in_window():
            self.message = f"Waiting for your sending hours ({c['from_hour']}:00 to {c['to_hour']}:00)"
            return
        if self.sent_today() >= c["daily_cap"]:
            self.message = f"Daily limit reached ({c['daily_cap']}). Continues tomorrow."
            return
        if now < self.next_at:
            self.message = f"Next message in {int(self.next_at - now)} s"
            return
        lead = outbox.next_to_send()
        if not lead:
            self.message = "No messages waiting. Find more leads or add messages."
            return
        self.send_one(lead)

    def send_one(self, lead):
        c = self.cfg()
        self.busy = True
        try:
            self.message = f"Sending to @{lead['handle']}"
            self.log(f"Sending a message to @{lead['handle']}")
            res = self.engine.send_dm(lead["handle"], lead["message"])
            if res.get("ok"):
                outbox.mark_sent(lead["handle"], res.get("thread", ""))
                self.fail_streak = 0
                self.next_at = time.time() + random.uniform(c["gap_min"], c["gap_max"])
                self.log(f"Sent to @{lead['handle']}")
                return "sent"
            why = res.get("error") or "Unknown problem"
            outbox.mark_failed(lead["handle"], why, final=("does not exist" in why or "No Message button" in why))
            self.fail_streak += 1
            self.log(f"Could not message @{lead['handle']}: {why}")
            if res.get("blocked") or self.fail_streak >= 3:
                self.paused_reason = why if res.get("blocked") else "Three messages in a row failed. Check the Instagram window, then start again."
                self.stop("Stopped by itself: " + self.paused_reason)
            else:
                self.next_at = time.time() + random.uniform(60, 120)
            return "failed"
        finally:
            self.busy = False

    def check_replies(self):
        from . import dm
        self.busy = True
        try:
            inbox = self.engine.inbox()
            leads = outbox.q("SELECT handle,name,thread FROM leads WHERE status='sent'")
            n = 0
            for handle, snippet in dm.replies_in(inbox, leads):
                if outbox.mark_replied(handle, snippet):
                    n += 1
                    self.log(f"@{handle} replied")
            return n
        except Exception as e:  # noqa
            self.log(f"Could not read the inbox: {e}")
            return 0
        finally:
            self.busy = False
