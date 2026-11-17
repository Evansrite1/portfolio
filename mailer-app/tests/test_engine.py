import email
import os
import tempfile
import time

import pytest

os.environ["MAILER_HOME"] = tempfile.mkdtemp()
os.environ["MAILER_KEY"] = "testkey"

from engine import config, db, leads, mailer, scheduler, secrets_store, stats, templates, tracking, server  # noqa: E402


@pytest.fixture(autouse=True)
def fresh(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setattr(config, "SECRETS_PATH", str(tmp_path / "s.json"))
    db._local.__dict__.clear()
    yield


def mk_acct(**kw):
    a = dict(email="me@gmail.com", display_name="Me", smtp_host="s", smtp_port=587, imap_host="i", imap_port=993, username="me@gmail.com",
             daily_min=20, daily_cap=40, skip_warmup=1, auto_push=0, warmup_start=time.time(), enabled=1, created=time.time())
    a.update(kw)
    db.run("INSERT INTO accounts(" + ",".join(a) + ") VALUES(" + ",".join("?" * len(a)) + ")", tuple(a.values()))
    return db.one("SELECT * FROM accounts WHERE email=?", (a["email"],))


def test_csv_import_extra_columns_and_dupes():
    r = leads.import_csv("Email,First Name,Business,City,Niche\na@x.com,Ann,Ann Cafe,Austin,coffee\na@x.com,Ann,Ann Cafe,Austin,coffee\nbad,B,B,C,D\n", "list1")
    assert r == {"added": 1, "duplicate": 1, "invalid": 1, "suppressed": 0, "sent_before": 0}
    lead = db.one("SELECT * FROM leads")
    assert lead["biz"] == "Ann Cafe" and lead["source"] == "list1"
    s = {"sender_name": "Evans", "templates": {"first_subject": "{{biz}} in {{city}}", "first_body": "Hi {{first}}, about {{niche}}. {{sender_name}}"}}
    subj, body = templates.render("first", lead, s)
    assert subj == "Ann Cafe in Austin" and "about coffee" in body and "reply \"stop\"" in body


def test_semicolon_csv():
    assert leads.import_csv("email;first;business\nz@z.com;Z;Zed\n")["added"] == 1


def test_unfilled_field_is_refused():
    lead = {"email": "a@b.com", "first": "A", "biz": "B", "city": "", "website": ""}
    s = {"sender_name": "Me", "templates": {"first_body": "Hello {{unknownfield}}"}}
    assert any("unknownfield" in p for p in templates.problems(s))
    assert not templates.problems({"sender_name": "Me", "templates": {}})


def test_send_flow_tracks_token_and_follows_up():
    acct = mk_acct()
    db.set_setting("sender_name", "Me")
    leads.add_lead("t@x.com", "Tom", "Tom Co", "Town")
    sent = []
    assert scheduler.send_one(acct, lambda a, m: sent.append(m)) == "sent"
    m = sent[0]
    assert m["To"] == "t@x.com" and "/o/" in m.get_body(("html",)).get_content()
    row = db.one("SELECT * FROM messages WHERE direction='out'")
    assert row["token"] and db.one("SELECT status FROM leads")["status"] == "sent"
    assert scheduler.send_one(acct, lambda a, m: None) == "nothing_to_send"
    db.run("UPDATE messages SET ts=ts-?", (6 * 86400,))
    assert scheduler.send_one(acct, lambda a, m: sent.append(m)) == "sent"
    assert db.one("SELECT COUNT(*) n FROM messages WHERE kind='follow'")["n"] == 1
    assert sent[1]["In-Reply-To"] == sent[0]["Message-ID"]


def test_reply_bounce_stop_and_unrelated_mail():
    acct = mk_acct()
    for e in ("r@x.com", "b@x.com", "u@x.com"):
        leads.add_lead(e, "", e)
        scheduler.send_one(acct, lambda a, m: None)
    def inc(frm, subj, body):
        m = email.message_from_string(f"From: {frm}\nTo: me@gmail.com\nSubject: {subj}\nMessage-ID: <{frm}{subj}@x>\nDate: Mon, 16 Nov 2026 10:00:00 +0000\n\n{body}")
        return mailer.apply_incoming(acct["id"], m)
    assert inc("r@x.com", "Re: hi", "Yes, call me") == "reply"
    assert inc("u@x.com", "Re: hi", "stop") == "unsub"
    assert inc("mailer-daemon@googlemail.com", "Delivery Status Notification (Failure)", "550 5.1.1 address not found\nFinal-Recipient: rfc822; b@x.com") == "bounce_hard"
    assert inc("random@else.com", "Hello", "unrelated") == "other"
    assert db.one("SELECT COUNT(*) n FROM messages WHERE from_addr='random@else.com'")["n"] == 0
    st = {r["email"]: r["status"] for r in db.q("SELECT email,status FROM leads")}
    assert st == {"r@x.com": "replied", "b@x.com": "bounced", "u@x.com": "unsub"}
    assert leads.add_lead("u@x.com") == "suppressed"
    t = stats.totals()
    assert t["sent"] == 3 and t["replies"] == 2 and t["bounces"] == 1 and t["optouts"] == 1 and t["delivered"] == 2


def test_open_tracking_ignores_scanner_and_counts_once():
    acct = mk_acct()
    leads.add_lead("o@x.com", "", "O")
    scheduler.send_one(acct, lambda a, m: None)
    row = db.one("SELECT * FROM messages")
    assert tracking.record_open(row["token"], row["ts"] + 3) is False          # scanner, too fast
    assert tracking.record_open(row["token"], row["ts"] + 600) is True
    assert tracking.record_open(row["token"], row["ts"] + 900) is False        # repeat
    assert tracking.record_open("nonsense", row["ts"] + 900) is False
    t = stats.totals()
    assert t["opened"] == 1 and t["open_rate"] == 100.0


def test_pull_opens(monkeypatch):
    acct = mk_acct()
    leads.add_lead("p@x.com", "", "P")
    scheduler.send_one(acct, lambda a, m: None)
    row = db.one("SELECT * FROM messages")

    class R:
        def raise_for_status(self): pass
        def json(self): return {"opens": {row["token"]: [{"ts": row["ts"] + 500, "ua": "GoogleImageProxy"}]}}
    monkeypatch.setattr(tracking.requests, "post", lambda *a, **k: R())
    assert tracking.pull_opens() == 1
    assert stats.activity()[0]["what"] in ("Opened the email", "Email sent")


def test_daily_cap_and_window():
    acct = mk_acct(daily_cap=5, daily_min=5)
    for i in range(8):
        leads.add_lead(f"l{i}@x.com", "", "L")
    res = [scheduler.send_one(acct, lambda a, m: None) for _ in range(7)]
    assert res.count("sent") == 5 and res[-1] == "cap_reached"


def test_api_needs_key_and_flow(monkeypatch):
    app = server.create_app()
    c = app.test_client()
    assert c.get("/api/state").status_code == 403
    assert c.get("/").status_code == 403
    H = {"X-Mailer-Key": "testkey"}
    assert "Outreach" in c.get("/?k=testkey").get_data(as_text=True)
    r = c.get("/api/state", headers=H).get_json()
    assert r["todo"][0].startswith("Connect") and r["all"]["sent"] == 0
    assert c.post("/api/engine/start", headers=H).status_code == 400
    r = c.post("/api/leads/import", headers=H, json={"text": "email,first\nq@q.com,Q\n", "name": "mine"}).get_json()
    assert r["added"] == 1
    assert c.post("/api/settings", headers=H, json={"sender_name": "Evans"}).get_json()["ok"]
    pv = c.post("/api/preview", headers=H, json={"kind": "first"}).get_json()
    assert "Evans" in pv["body"]
    monkeypatch.setattr(mailer, "test_connection", lambda a: {"smtp": False, "imap": False, "error": "nope"})
    r = c.post("/api/accounts", headers=H, json={"email": "me@gmail.com", "password": "abcd efgh ijkl mnop", "provider": "gmail"})
    assert r.status_code == 400 and secrets_store.get_secret("me@gmail.com") is None
    monkeypatch.setattr(mailer, "test_connection", lambda a: {"smtp": True, "imap": True, "error": ""})
    monkeypatch.setattr(mailer, "sync_account", lambda a: {})
    assert c.post("/api/accounts", headers=H, json={"email": "me@gmail.com", "password": "abcd efgh ijkl mnop", "provider": "gmail"}).status_code == 200
    assert secrets_store.get_secret("me@gmail.com") == "abcdefghijklmnop"
    assert c.get("/api/state", headers=H).get_json()["todo"] == []
    assert b"q@q.com" in c.get("/api/export.csv", headers=H).data
