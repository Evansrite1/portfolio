"""Checks for IG Outreach that need no Instagram login. Run:  python -m unittest discover -s tests -v"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["IGSCOUT_HOME"] = tempfile.mkdtemp(prefix="iglf-home-")
os.environ["IGSCOUT_OUT"] = tempfile.mkdtemp(prefix="iglf-out-")
os.environ["IGSCOUT_NOBROWSER"] = "1"

from core import discover, message as M, services as S  # noqa: E402

ROW = {"name": "Maria Lopez", "handle": "marias_cuts", "niche": "barber", "category": "Barber Shop", "country": "USA",
       "city": "Dallas", "followers_text": "4.2K", "instagram_link": "https://www.instagram.com/marias_cuts/",
       "posts": 130, "posts_per_month": "5.2", "active": "Yes", "last_post": "2026-11-01", "has_website": "No",
       "website": "", "website_detail": "No. Linktree has only text", "domain": "", "site_status": ""}
BANNED = ("I built", "I made you", "I have built", "I redesigned", "I created a", "ready for the", "this holiday", "—", "–")


class Services(unittest.TestCase):
    def test_every_service_has_what_the_screen_needs(self):
        for s in S.listing():
            self.assertTrue(s["label"] and s["blurb"] and s["example"])
        self.assertEqual({s["key"] for s in S.listing()}, {"website", "redesign", "social", "booking", "any"})

    def test_website_filter_follows_the_service(self):
        self.assertEqual(S.get("website")["website"], "no")
        self.assertEqual(S.get("redesign")["website"], "yes")
        for k in ("social", "booking", "any"):
            self.assertEqual(S.get(k)["website"], "either")
        self.assertEqual(S.get("nonsense")["label"], S.get("website")["label"])          # unknown key falls back safely

    def test_social_keeps_quiet_accounts_only(self):
        quiet = {"last_post": "2026-05-01", "active": "Inactive", "posts_per_month": "0.5"}
        slow = {"last_post": "2026-09-01", "active": "Slow", "posts_per_month": "2.0"}
        busy = {"last_post": "2026-11-10", "active": "Yes", "posts_per_month": "12.0"}
        nopost = {"last_post": "", "active": "", "posts_per_month": ""}
        self.assertEqual(S.skip_reason("social", {}, quiet, {}, []), "")
        self.assertEqual(S.skip_reason("social", {}, slow, {}, []), "")
        self.assertTrue(S.skip_reason("social", {}, busy, {}, []))
        self.assertTrue(S.skip_reason("social", {}, nopost, {}, []))
        self.assertTrue(S.get("social")["quiet_ok"])

    def test_booking_skips_profiles_that_already_take_bookings(self):
        self.assertTrue(S.skip_reason("booking", {}, {}, {"website_detail": "No. Booksy booking page, not a website"}, ["https://booksy.com/x"]))
        self.assertTrue(S.skip_reason("booking", {}, {}, {}, ["https://wa.me/123"]))
        self.assertEqual(S.skip_reason("booking", {}, {}, {"website_detail": "No. Linktree has only text"}, ["https://linktr.ee/x"]), "")

    def test_services_without_an_extra_rule_keep_everyone(self):
        for k in ("website", "redesign", "any"):
            self.assertEqual(S.skip_reason(k, {}, {}, {}, []), "")


class Messages(unittest.TestCase):
    def rows(self):
        for service in S.SERVICES:
            row = dict(ROW, service=service, offer=S.get(service)["offer"])
            if service == "redesign":
                row.update(has_website="Yes", website="https://mariascuts.com", domain="mariascuts.com", site_status="live", website_detail="Yes. Wix, mariascuts.com")
            if service == "social":
                row.update(active="Slow", last_post="2026-08-20", posts_per_month="1.3")
            yield service, row

    def test_automatic_messages_only_say_what_is_true(self):
        for service, row in self.rows():
            m = M.auto_message(row)
            for bad in BANNED:
                self.assertNotIn(bad, m, service + ": " + bad)
            self.assertIn("Maria", m)
            self.assertTrue(m.rstrip().endswith("quick call this week?"))
        self.assertIn("does not link to a website", M.auto_message(dict(ROW, service="website")))
        self.assertIn("2026-08-20", M.auto_message(dict(ROW, service="social", active="Slow", last_post="2026-08-20")))
        self.assertIn("booking or ordering link", M.auto_message(dict(ROW, service="booking")))

    def test_a_claim_is_not_made_without_the_fact(self):
        m = M.auto_message(dict(ROW, service="website", has_website="Yes", website="https://x.com"))
        self.assertNotIn("does not link to a website", m)                                      # it has one, so it must not say so
        m = M.auto_message(dict(ROW, service="redesign", has_website="No"))
        self.assertNotIn("had a look at your website", m)
        m = M.auto_message(dict(ROW, service="redesign", has_website="Yes", domain="a.com", site_status="down"))
        self.assertIn("did not load", m)

    def test_own_template_wins_and_examples_render(self):
        row = dict(ROW, service="website")
        self.assertEqual(M.message_for("Hi {first_name}, I saw @{handle}", row), "Hi Maria, I saw @marias_cuts")
        for s in S.listing():
            out = M.message_for(s["example"], dict(ROW, website="https://mariascuts.com"))
            self.assertNotIn("{", out)
            for bad in BANNED:
                self.assertNotIn(bad, out)

    def test_business_names_do_not_become_first_names(self):
        self.assertEqual(M.first_name("Dallas Fade Barbershop"), "there")
        self.assertEqual(M.first_name("Maria Lopez"), "Maria")


class Discovery(unittest.TestCase):
    def test_a_city_limits_the_searches(self):
        q = discover.make_queries("USA", ["barber"], "Austin")
        self.assertTrue(q and all(t.endswith("Austin") and n == "barber" for t, n in q))
        any_city = discover.make_queries("USA", ["barber"], "")
        self.assertGreater(len(any_city), 1)


class App(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import app
        cls.app = app
        cls.c = app.app.test_client()
        cls.H = {"X-IGLF": "1", "Origin": f"http://127.0.0.1:{app.PORT}"}

    def test_services_and_settings(self):
        r = self.c.get("/api/services", headers={"Host": "127.0.0.1:5057"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.get_json()), 5)
        r = self.c.post("/api/settings", json={"templates": {"social": "Hello {first_name}", "bogus": "x"}, "last": {"service": "social", "city": "Austin"}}, headers=self.H)
        self.assertEqual(r.status_code, 200)
        saved = self.c.get("/api/settings").get_json()
        self.assertEqual(saved["templates"]["social"], "Hello {first_name}")
        self.assertNotIn("bogus", saved["templates"])
        self.assertEqual(saved["last"]["service"], "social")

    def test_only_our_own_screen_can_change_things(self):
        bad_host = self.c.get("/api/services", headers={"Host": "evil.example.com"})
        self.assertEqual(bad_host.status_code, 403)
        no_header = self.c.post("/api/stop", json={}, headers={"Origin": f"http://127.0.0.1:{self.app.PORT}"})
        self.assertEqual(no_header.status_code, 403)
        other_site = self.c.post("/api/stop", json={}, headers={"X-IGLF": "1", "Origin": "https://evil.example.com"})
        self.assertEqual(other_site.status_code, 403)
        plain_form = self.c.post("/api/stop", data="{}", headers={"Content-Type": "text/plain", "Origin": "https://evil.example.com"})
        self.assertEqual(plain_form.status_code, 403)
        self.assertEqual(self.c.post("/api/stop", json={}, headers=self.H).status_code, 200)

    def test_run_needs_a_login(self):
        r = self.c.post("/api/run", json={"service": "social"}, headers=self.H)
        self.assertEqual(r.status_code, 400)

    def test_the_screen_loads_and_names_the_app(self):
        r = self.c.get("/")
        self.assertEqual(r.status_code, 200)
        html = r.get_data(as_text=True)
        self.assertIn("IG Outreach", html)
        self.assertIn("What do you offer?", html)
        self.assertIn("Who do you want to reach?", html)
        self.assertNotIn("—", html)

    def test_update_banner_data(self):
        r = self.c.get("/api/update").get_json()
        self.assertIn("manual", r)
        self.assertIn("download_page", r)
        self.assertEqual(r["manual"], sys.platform != "win32")

    def test_mac_never_runs_downloaded_code(self):
        self.app.FROZEN, was = True, self.app.FROZEN
        self.app.CAN_SELF_UPDATE, was2 = False, self.app.CAN_SELF_UPDATE
        try:
            r = self.c.post("/api/update/install", json={}, headers=self.H)
            self.assertEqual(r.status_code, 400)
            self.assertIn("download", r.get_json()["error"])
        finally:
            self.app.FROZEN, self.app.CAN_SELF_UPDATE = was, was2


class MacSafety(unittest.TestCase):
    """The Mac launcher and build script are read as text, because they only run on a Mac."""
    def test_mac_files_stay_in_their_own_places(self):
        src = (ROOT / "launcher_mac.py").read_text(encoding="utf-8")
        for needle in ("rm -rf", "sudo", "defaults write", "killall", "launchctl", "chmod -R", "shutil.rmtree(Path.home()"):
            self.assertNotIn(needle, src)
        self.assertIn('"Library" / "Application Support" / "IG Outreach"', src)
        self.assertIn('"Documents" / "IG Outreach"', src)
        self.assertIn("--user-data-dir", src)                       # its own browser profile, never the person's
        build = (ROOT / "build_mac.py").read_text(encoding="utf-8")
        self.assertIn('"--install-location", "/Applications/Evans Large"', build)
        for needle in ("sudo", "rm -rf /", "launchctl", "defaults write"):
            self.assertNotIn(needle, build)


if __name__ == "__main__":
    unittest.main()
