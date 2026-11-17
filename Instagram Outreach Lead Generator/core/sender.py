"""Sends the waiting messages one at a time, slowly, from up to 10 Instagram accounts, each inside its own daily limit, and checks
every account's inbox for replies.

Why so slow: Instagram limits accounts that send many first messages quickly, and a limited account cannot message anyone for
hours or days. So the default is 20 a day per account at random gaps inside the hours you choose, the accounts take turns, and an
account stops by itself the moment Instagram pushes back.
"""
import random
import threading
import time

from . import outbox

DEFAULTS = {"gap_min": 240, "gap_max": 420, "from_hour": 9, "to_hour": 21, "reply_check_minutes": 10}


class Sender:
    def __init__(self, manager, get_settings, log):
        self.mgr, self.get, self.log = manager, get_settings, log
        self.running = False
        self.message = "Stopped"
        self.next_at = {}          # per account
        self.fail_streak = {}
        self.paused = {}           # per account: why it stopped itself
        self.last_check = 0.0
        self.turn = 0
        self.busy = False
        self._t = None
        self._stop = threading.Event()

    # ---------- settings ----------
    def cfg(self):
        c = dict(DEFAULTS)
        c.update({k: v for k, v in (self.get() or {}).items() if k in DEFAULTS})
        c["gap_min"] = max(60, int(c["gap_min"]))
        c["gap_max"] = max(c["gap_min"], int(c["gap_max"]))
        return c

    def in_window(self, hour=None):
        c = self.cfg()
        hour = time.localtime().tm_hour if hour is None else hour
        return c["from_hour"] <= hour < c["to_hour"]

    def sent_today(self, account=None):
        return outbox.sent_since(outbox.midnight(0), account)

    # ---------- control ----------
    def boot(self):
        if self._t and self._t.is_alive():
            return
        self._stop.clear()
        self._t = threading.Thread(target=self._loop, daemon=True)
        self._t.start()

    def start(self):
        usable = [a for a in self.mgr.items if a.get("enabled")]
        if not usable:
            raise RuntimeError("Turn on at least one Instagram account")
        self.boot()
        self.paused = {}
        self.fail_streak = {}
        self.running = True
        self.next_at = {}
        self.message = "Starting"

    def stop(self, why="Stopped"):
        self.running = False
        self.message = why

    def status(self):
        c = self.cfg()
        now = time.time()
        accts = []
        for a in self.mgr.status():
            accts.append({**a, "sent_today": self.sent_today(a["id"]), "next_in": max(0, int(self.next_at.get(a["id"], 0) - now)) if self.running else 0,
                          "paused_reason": self.paused.get(a["id"], "")})
        return {"running": self.running, "message": self.message, "sent_today": self.sent_today(), "in_window": self.in_window(),
                "from_hour": c["from_hour"], "to_hour": c["to_hour"], "accounts": accts,
                "cap": sum(a["daily"] for a in self.mgr.items if a.get("enabled")),
                "waiting": outbox.one("SELECT COUNT(*) n FROM leads WHERE status='new' AND TRIM(message)<>''")["n"]}

    # ---------- the loop ----------
    def _loop(self):
        while not self._stop.is_set():
            try:
                self.tick()
            except Exception as e:  # noqa
                self.log(f"Sender problem: {e}")
                self.message = f"Problem: {e}"
            time.sleep(1)

    def _ready(self, a, now):
        """Is this account allowed to send right now? Returns (ok, why)."""
        aid = a["id"]
        if not a.get("enabled"):
            return False, "off"
        if aid in self.paused:
            return False, "stopped by itself"
        if self.sent_today(aid) >= a["daily"]:
            return False, "daily limit reached"
        if now < self.next_at.get(aid, 0):
            return False, "waiting"
        return True, ""

    def tick(self, now=None):
        now = now or time.time()
        c = self.cfg()
        if now - self.last_check > c["reply_check_minutes"] * 60 and not self.busy:
            self.last_check = now
            if outbox.one("SELECT 1 FROM leads WHERE status='sent' LIMIT 1"):
                self.check_replies()
        if not self.running or self.busy:
            return
        if not self.in_window():
            self.message = f"Waiting for your sending hours ({c['from_hour']}:00 to {c['to_hour']}:00)"
            return
        items = self.mgr.items
        picked = None
        waits = []
        for k in range(len(items)):
            a = items[(self.turn + k) % len(items)]
            ok, why = self._ready(a, now)
            if ok:
                picked = a
                self.turn = (self.turn + k + 1) % len(items)
                break
            waits.append(why)
        if picked is None:
            if all(w in ("off", "stopped by itself", "daily limit reached") for w in waits):
                self.message = "Every account is off, stopped or at its daily limit. Sending continues tomorrow."
            else:
                self.message = "Waiting for the next gap between messages"
            return
        lead = outbox.next_to_send()
        if not lead:
            self.message = "No messages waiting. Add leads, or write the messages."
            return
        self.send_one(picked, lead)

    def _engine(self, a):
        e = self.mgr.engine(a["id"])
        if not e.status().get("browser_open"):
            e.open_browser()
        return e

    def send_one(self, a, lead):
        c = self.cfg()
        aid = a["id"]
        self.busy = True
        try:
            e = self._engine(a)
            if not e.status().get("logged_in"):
                self.paused[aid] = "Not logged in to Instagram. Log in, then start again."
                self.log(f"{a['label']}: not logged in, skipped")
                return "not_logged_in"
            self.message = f"{a['label']}: sending to @{lead['handle']}"
            self.log(f"{a['label']}: sending a message to @{lead['handle']}")
            res = e.send_dm(lead["handle"], lead["message"])
            if res.get("ok"):
                outbox.mark_sent(lead["handle"], res.get("thread", ""), aid)
                self.fail_streak[aid] = 0
                self.next_at[aid] = time.time() + random.uniform(c["gap_min"], c["gap_max"])
                self.log(f"{a['label']}: sent to @{lead['handle']}")
                return "sent"
            why = res.get("error") or "Unknown problem"
            outbox.mark_failed(lead["handle"], why, final=("does not exist" in why or "No Message button" in why), account=aid)
            self.fail_streak[aid] = self.fail_streak.get(aid, 0) + 1
            self.log(f"{a['label']}: could not message @{lead['handle']}: {why}")
            if res.get("blocked") or self.fail_streak[aid] >= 3:
                self.paused[aid] = why if res.get("blocked") else "Three messages in a row failed. Check its Instagram window, then start again."
                self.log(f"{a['label']} stopped by itself: {self.paused[aid]}")
            else:
                self.next_at[aid] = time.time() + random.uniform(60, 120)
            return "failed"
        except Exception as ex:  # noqa
            self.paused[aid] = f"Problem: {ex}"
            return "error"
        finally:
            self.busy = False

    def check_replies(self):
        from . import dm
        self.busy = True
        n = 0
        try:
            for a in self.mgr.items:
                if a["id"] not in self.mgr.engines:
                    continue
                e = self.mgr.engines[a["id"]]
                if not e.status().get("logged_in"):
                    continue
                try:
                    inbox = e.inbox()
                except Exception as ex:  # noqa
                    self.log(f"{a['label']}: could not read the inbox: {ex}")
                    continue
                leads = outbox.q("SELECT handle,name,thread FROM leads WHERE status='sent' AND (account=? OR account IS NULL OR account='')", (a["id"],))
                for handle, snippet in dm.replies_in(inbox, leads):
                    if outbox.mark_replied(handle, snippet):
                        n += 1
                        self.log(f"@{handle} replied (to {a['label']})")
            return n
        finally:
            self.busy = False
