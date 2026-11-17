"""The mailbox and the sending, end to end against small real IMAP and SMTP servers (tests/fakemail.py)."""
import email
import time

import pytest

import fakemail
from engine import config, db, inbox, leads, mailer, scheduler, secrets_store, server, stats

H = {"X-Mailer-Key": "testkey"}


@pytest.fixture()
def world(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setattr(config, "SECRETS_PATH", str(tmp_path / "s.json"))
    db._local.__dict__.clear()
    inbox._conns.clear()
    st, ip, sp, stop = fakemail.start()
    c = server.create_app().test_client()
    r = c.post("/api/accounts", headers=H, json={"email": st.user, "password": st.password, "provider": "gmail", "smtp_host": "127.0.0.1", "smtp_port": sp, "imap_host": "127.0.0.1", "imap_port": ip})
    assert r.status_code == 200, r.get_json()
    yield st, c, db.one("SELECT * FROM accounts")
    stop()
    inbox._conns.clear()


def test_wrong_password_is_refused_with_plain_words(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setattr(config, "SECRETS_PATH", str(tmp_path / "s.json"))
    db._local.__dict__.clear()
    st, ip, sp, stop = fakemail.start()
    try:
        c = server.create_app().test_client()
        r = c.post("/api/accounts", headers=H, json={"email": st.user, "password": "wrong", "provider": "gmail", "smtp_host": "127.0.0.1", "smtp_port": sp, "imap_host": "127.0.0.1", "imap_port": ip})
        assert r.status_code == 400 and "app password" in r.get_json()["error"]
        assert secrets_store.get_secret(st.user) is None
    finally:
        stop()


def test_folders_and_unread(world):
    st, c, a = world
    st.add("INBOX", fakemail.make_msg("Ann <ann@x.com>", st.user, "Hello", "hi there"))
    st.add("INBOX", fakemail.make_msg("Bob <bob@x.com>", st.user, "Second", "yo"), flags=["\\Seen"])
    fl = c.get("/api/mail/folders?account=%d" % a["id"], headers=H).get_json()
    roles = [f["role"] for f in fl]
    assert roles[:2] == ["inbox", "sent"] and "spam" in roles and "trash" in roles
    assert fl[0]["unread"] == 1


def test_list_read_and_mark_seen(world):
    st, c, a = world
    for i in range(35):
        st.add("INBOX", fakemail.make_msg("Ann <ann@x.com>", st.user, "Message %d" % i, "body %d" % i))
    r = c.get("/api/mail/list?account=%d&folder=INBOX&page=0" % a["id"], headers=H).get_json()
    assert r["total"] == 35 and len(r["messages"]) == 30 and r["messages"][0]["subject"] == "Message 34"
    assert r["messages"][0]["seen"] is False and r["messages"][0]["from_name"] == "Ann"
    r2 = c.get("/api/mail/list?account=%d&folder=INBOX&page=1" % a["id"], headers=H).get_json()
    assert len(r2["messages"]) == 5
    uid = r["messages"][0]["uid"]
    m = c.get("/api/mail/message?account=%d&folder=INBOX&uid=%d" % (a["id"], uid), headers=H).get_json()
    assert m["text"].strip() == "body 34" and m["subject"] == "Message 34"
    r3 = c.get("/api/mail/list?account=%d&folder=INBOX" % a["id"], headers=H).get_json()
    assert r3["messages"][0]["seen"] is True


def test_search(world):
    st, c, a = world
    st.add("INBOX", fakemail.make_msg("Ann <ann@x.com>", st.user, "Invoice for May", "pay"))
    st.add("INBOX", fakemail.make_msg("Bob <bob@x.com>", st.user, "Lunch", "tomorrow?"))
    r = c.get("/api/mail/list?account=%d&folder=INBOX&q=invoice" % a["id"], headers=H).get_json()
    assert [m["subject"] for m in r["messages"]] == ["Invoice for May"]


def test_html_and_attachment(world):
    st, c, a = world
    m = fakemail.make_msg("Ann <ann@x.com>", st.user, "Pic", "plain", html="<p>Hello <b>bold</b></p><script>alert(1)</script>")
    m.add_attachment(b"filedata", maintype="application", subtype="octet-stream", filename="report.pdf")
    uid = st.add("INBOX", m)
    got = c.get("/api/mail/message?account=%d&folder=INBOX&uid=%d" % (a["id"], uid), headers=H).get_json()
    assert got["attachments"][0]["name"] == "report.pdf" and "<b>bold</b>" in got["html"]
    dl = c.get("/api/mail/attachment?account=%d&folder=INBOX&uid=%d&i=0" % (a["id"], uid), headers=H)
    assert dl.data == b"filedata" and "report.pdf" in dl.headers["Content-Disposition"]


def test_delete_spam_star(world):
    st, c, a = world
    u1 = st.add("INBOX", fakemail.make_msg("Ann <ann@x.com>", st.user, "A", "a"))
    u2 = st.add("INBOX", fakemail.make_msg("Spammer <s@x.com>", st.user, "WIN", "money"))
    act = lambda uid, action, folder="INBOX": c.post("/api/mail/action", headers=H, json={"account": a["id"], "folder": folder, "uid": uid, "action": action})
    assert act(u1, "delete").status_code == 200
    assert act(u2, "spam").status_code == 200
    assert [m["uid"] for m in st.boxes["INBOX"]] == []
    assert len(st.boxes["[Gmail]/Trash"]) == 1 and len(st.boxes["[Gmail]/Spam"]) == 1
    spam_uid = st.boxes["[Gmail]/Spam"][0]["uid"]
    assert act(spam_uid, "notspam", "[Gmail]/Spam").status_code == 200
    assert len(st.boxes["INBOX"]) == 1
    uid = st.boxes["INBOX"][0]["uid"]
    act(uid, "star")
    assert "\\Flagged" in st.boxes["INBOX"][0]["flags"]
    # deleting from the trash removes for good
    t_uid = st.boxes["[Gmail]/Trash"][0]["uid"]
    act(t_uid, "delete", "[Gmail]/Trash")
    assert st.boxes["[Gmail]/Trash"] == []


def test_send_and_reply(world):
    st, c, a = world
    r = c.post("/api/mail/send", headers=H, json={"account": a["id"], "to": "ann@x.com", "subject": "Re: Hello", "body": "Thanks Ann", "in_reply_to": "<abc@x>"})
    assert r.status_code == 200, r.get_json()
    got = email.message_from_bytes(st.sent[0]["raw"])
    assert got["To"] == "ann@x.com" and got["In-Reply-To"] == "<abc@x>" and got["List-Unsubscribe"] is None
    bad = c.post("/api/mail/send", headers=H, json={"account": a["id"], "to": "nonsense", "subject": "x", "body": "y"})
    assert bad.status_code == 400


def test_campaign_send_then_real_reply_and_bounce_are_read_from_the_mailbox(world):
    st, c, a = world
    db.set_setting("sender_name", "Evans")
    leads.add_lead("ann@x.com", "Ann", "Ann Cafe")
    leads.add_lead("ghost@nowhere.com", "Gus", "Ghost Co")
    assert scheduler.send_one(a) == "sent"                  # a real SMTP send
    a = db.one("SELECT * FROM accounts")
    assert scheduler.send_one(a) == "sent"
    assert len(st.sent) == 2
    first = email.message_from_bytes(st.sent[0]["raw"])
    mid = first["Message-ID"]
    # a person replies, and the mail server sends a bounce for the other address
    st.add("INBOX", fakemail.make_msg("Ann <ann@x.com>", st.user, "Re: " + first["Subject"], "Yes, call me", extra={"In-Reply-To": mid}))
    st.add("INBOX", fakemail.make_msg("Mail Delivery Subsystem <mailer-daemon@googlemail.com>", st.user, "Delivery Status Notification (Failure)",
                                      "550 5.1.1 The email account that you tried to reach does not exist.\nFinal-Recipient: rfc822; ghost@nowhere.com"))
    st.add("INBOX", fakemail.make_msg("Newsletter <news@shop.com>", st.user, "Sale", "unrelated mail"))
    counts = mailer.sync_account(db.one("SELECT * FROM accounts"))
    assert counts["reply"] == 1 and counts["bounce_hard"] == 1
    status = {r["email"]: r["status"] for r in db.q("SELECT email,status FROM leads")}
    assert status == {"ann@x.com": "replied", "ghost@nowhere.com": "bounced"}
    t = stats.totals()
    assert t["sent"] == 2 and t["replies"] == 1 and t["bounces"] == 1
    assert db.one("SELECT COUNT(*) n FROM messages WHERE from_addr='news@shop.com'")["n"] == 0     # unrelated mail is not kept
