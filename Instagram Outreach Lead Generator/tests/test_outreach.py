"""Checks for sending, reply detection and statistics. No Instagram login needed: the browser is replaced by a stand-in.
Run:  python -m unittest discover -s tests -v"""
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core import dm, outbox, sender  # noqa: E402


def fresh():
    d = tempfile.mkdtemp()
    outbox.open_db(os.path.join(d, "o.db"))


class FakeEngine:
    def __init__(self, results=None, inbox=None, logged_in=True):
        self.results, self.inbox_rows, self.sent, self.logged_in = list(results or []), inbox or [], [], logged_in

    def status(self):
        return {"logged_in": self.logged_in, "browser_open": True}

    def open_browser(self):
        pass

    def send_dm(self, handle, text):
        self.sent.append((handle, text))
        return self.results.pop(0) if self.results else {"ok": True, "thread": "100" + str(len(self.sent))}

    def inbox(self):
        return self.inbox_rows


class FakeManager:
    def __init__(self, engines, daily=20):
        self.items = [{"id": "a%d" % (i + 1), "label": "Account %d" % (i + 1), "enabled": True, "daily": daily} for i in range(len(engines))]
        self.engines = {"a%d" % (i + 1): e for i, e in enumerate(engines)}

    def engine(self, aid):
        return self.engines[aid]

    def status(self):
        return [dict(a, **self.engines[a["id"]].status()) for a in self.items]


def make_sender(engine, daily=20, **cfg):
    engines = engine if isinstance(engine, list) else [engine]
    mgr = FakeManager(engines, daily)
    s = sender.Sender(mgr, lambda: dict({"from_hour": 0, "to_hour": 24, "gap_min": 60, "gap_max": 60}, **cfg), lambda m: None)
    s.running = True
    return s


def row(h, msg="Hello there, I found your page and had an idea for you."):
    return {"handle": h, "instagram_link": f"https://www.instagram.com/{h}/", "country": "Nigeria", "what_they_do": "bakery", "service": "website", "message": msg, "name": h.title()}


class Outbox(unittest.TestCase):
    def setUp(self):
        fresh()

    def test_add_is_once_and_counts(self):
        self.assertTrue(outbox.add_row(row("a")))
        self.assertFalse(outbox.add_row(row("A")))
        self.assertEqual(outbox.add_handles(["b", "@b", "c"]), 2)
        self.assertEqual(outbox.stats()["found"], 3)

    def test_message_edit_only_before_sending(self):
        outbox.add_row(row("a"))
        outbox.set_message("a", "New text")
        self.assertEqual(outbox.one("SELECT message FROM leads")["message"], "New text")
        outbox.mark_sent("a", "1")
        outbox.set_message("a", "Changed after sending")
        self.assertEqual(outbox.one("SELECT message FROM leads")["message"], "New text")

    def test_stats(self):
        for h in "abc":
            outbox.add_row(row(h))
        outbox.mark_sent("a", "1"); outbox.mark_sent("b", "2")
        outbox.mark_replied("a", "yes please")
        s = outbox.stats()
        self.assertEqual((s["found"], s["contacted"], s["sent_today"], s["replies_all"]), (3, 2, 2, 1))
        self.assertEqual(s["reply_rate"], 50.0)
        self.assertEqual(s["series"][-1]["sent"], 2)
        self.assertFalse(outbox.mark_replied("a"))          # counted once


class Dm(unittest.TestCase):
    def test_parse_thread(self):
        self.assertEqual(dm.parse_thread("Sam Baker\nYou: Hi there · 2h"), ("Sam Baker", "You: Hi there", True))
        n, s, out = dm.parse_thread("Sam Baker\nThanks, tell me more · 1h")
        self.assertEqual((n, s, out), ("Sam Baker", "Thanks, tell me more", False))
        self.assertTrue(dm.parse_thread("Sam Baker\nActive 3h ago")[2])
        self.assertTrue(dm.parse_thread("")[2])

    def test_replies_in(self):
        leads = [{"handle": "sam", "name": "Sam Baker", "thread": "11"}, {"handle": "lee", "name": "", "thread": ""}]
        inbox = [{"thread": "11", "name": "Sam Baker", "snippet": "Yes", "outgoing": False},
                 {"thread": "22", "name": "lee", "snippet": "You: hello", "outgoing": True},
                 {"thread": "33", "name": "Someone else", "snippet": "Hi", "outgoing": False}]
        self.assertEqual(dm.replies_in(inbox, leads), [("sam", "Yes")])
        inbox[1] = {"thread": "22", "name": "lee", "snippet": "Hello!", "outgoing": False}
        self.assertEqual([h for h, _ in dm.replies_in(inbox, leads)], ["sam", "lee"])


class Sending(unittest.TestCase):
    def setUp(self):
        fresh()
        for h in ("a", "b", "c", "d"):
            outbox.add_row(row(h))

    def test_sends_one_then_waits(self):
        e = FakeEngine(); s = make_sender(e)
        s.tick()
        self.assertEqual(len(e.sent), 1)
        s.tick()
        self.assertEqual(len(e.sent), 1)                     # waits for the gap
        s.tick(time.time() + 61)
        self.assertEqual(len(e.sent), 2)
        self.assertEqual(outbox.stats()["sent_today"], 2)

    def test_daily_cap(self):
        e = FakeEngine(); s = make_sender(e, daily=2)
        for i in range(6):
            s.next_at = {}
            s.tick()
        self.assertEqual(len(e.sent), 2)
        self.assertIn("daily limit", s.message)

    def test_outside_hours(self):
        h = time.localtime().tm_hour
        e = FakeEngine(); s = make_sender(e, from_hour=(h + 2) % 24 if h < 22 else 0, to_hour=((h + 2) % 24) + 1 if h < 22 else 1)
        if h >= 22:
            self.skipTest("window arithmetic wraps at night")
        s.tick()
        self.assertEqual(e.sent, [])

    def test_stops_by_itself_when_blocked(self):
        e = FakeEngine(results=[{"ok": False, "error": "Instagram is limiting this account", "blocked": True}]); s = make_sender(e)
        s.tick()
        self.assertIn("limiting", s.paused["a1"])
        self.assertEqual(outbox.one("SELECT status FROM leads WHERE handle='a'")["status"], "new")   # still waiting, not lost
        s.tick()
        self.assertEqual(len(e.sent), 1)                     # nothing more is sent while stopped

    def test_three_failures_in_a_row_stop(self):
        bad = {"ok": False, "error": "no box"}
        e = FakeEngine(results=[bad, bad, bad]); s = make_sender(e)
        for _ in range(3):
            s.next_at = {}
            s.tick()
        self.assertIn("a1", s.paused)

    def test_missing_message_button_is_final(self):
        e = FakeEngine(results=[{"ok": False, "error": "No Message button on this profile"}]); s = make_sender(e)
        s.tick()
        self.assertEqual(outbox.one("SELECT status FROM leads WHERE handle='a'")["status"], "failed")

    def test_reply_check_marks_replied(self):
        e = FakeEngine(); s = make_sender(e)
        s.tick()                                              # sends to "a" with thread 1001
        e.inbox_rows = [{"thread": "1001", "name": "A", "snippet": "Interested", "outgoing": False}]
        self.assertEqual(s.check_replies(), 1)
        self.assertEqual(outbox.one("SELECT status FROM leads WHERE handle='a'")["status"], "replied")

    def test_two_accounts_take_turns_and_have_their_own_numbers(self):
        e1, e2 = FakeEngine(), FakeEngine()
        s = make_sender([e1, e2], daily=2)
        for _ in range(8):
            s.next_at = {}
            s.tick()
        self.assertEqual((len(e1.sent), len(e2.sent)), (2, 2))               # each stopped at its own limit of 2
        by = {r["account"]: r["n"] for r in outbox.q("SELECT account, COUNT(*) n FROM events WHERE type='sent' GROUP BY account")}
        self.assertEqual(by, {"a1": 2, "a2": 2})
        rows = {r["id"]: r for r in outbox.per_account({"a1": "One", "a2": "Two"})}
        self.assertEqual((rows["a1"]["sent_today"], rows["a2"]["sent_week"], rows["a1"]["sent_all"]), (2, 2, 2))
        self.assertEqual(outbox.stats(14, "a1")["sent_today"], 2)
        self.assertEqual(outbox.stats()["sent_today"], 4)

    def test_one_blocked_account_does_not_stop_the_others(self):
        bad = FakeEngine(results=[{"ok": False, "error": "limited", "blocked": True}]); good = FakeEngine()
        s = make_sender([bad, good], daily=5)
        for _ in range(6):
            s.next_at = {}
            s.tick()
        self.assertIn("a1", s.paused)
        self.assertGreaterEqual(len(good.sent), 3)
        self.assertEqual(len(bad.sent), 1)

    def test_logged_out_account_is_skipped_with_a_reason(self):
        e = FakeEngine(logged_in=False); s = make_sender(e)
        s.tick()
        self.assertEqual(e.sent, [])
        self.assertIn("Not logged in", s.paused["a1"])

    def test_empty_messages_are_never_sent(self):
        fresh()
        outbox.add_row(row("z", msg="   "))
        e = FakeEngine(); s = make_sender(e)
        s.tick()
        self.assertEqual(e.sent, [])


if __name__ == "__main__":
    unittest.main()
