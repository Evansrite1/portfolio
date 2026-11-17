"""25 mailboxes, 150 a day, lead numbers, setting leads aside for a mailbox, never emailing an address twice, PDF import."""
import base64
import time

import pytest

from engine import config, db, docs, leads, scheduler, server

H = {"X-Mailer-Key": "testkey"}


@pytest.fixture(autouse=True)
def fresh(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setattr(config, "SECRETS_PATH", str(tmp_path / "s.json"))
    db._local.__dict__.clear()


def acct(n, cap=40):
    e = "box%d@gmail.com" % n
    db.run("INSERT INTO accounts(email,display_name,smtp_host,smtp_port,imap_host,imap_port,username,daily_min,daily_cap,skip_warmup,auto_push,warmup_start,enabled,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
           (e, "", "s", 587, "i", 993, e, 10, cap, 1, 0, time.time(), 1, time.time()))
    return db.one("SELECT * FROM accounts WHERE email=?", (e,))


def make_pdf(text):
    stream = "BT /F1 12 Tf 72 720 Td (%s) Tj ET" % text.replace("(", "").replace(")", "")
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            "<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream), "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offs = "%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += "%d 0 obj\n%s\nendobj\n" % (i, o)
    x = len(out)
    out += "xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + "".join("%010d 00000 n \n" % o for o in offs)
    out += "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, x)
    return out.encode("latin-1")


def test_limits():
    assert config.MAX_ACCOUNTS == 25 and config.HARD_DAILY_CAP == 150


def test_25_mailboxes_and_150_cap_through_the_api(monkeypatch):
    from engine import mailer
    monkeypatch.setattr(mailer, "test_connection", lambda a: {"smtp": True, "imap": True, "error": ""})
    monkeypatch.setattr(mailer, "sync_account", lambda a: {})
    c = server.create_app().test_client()
    for i in range(25):
        r = c.post("/api/accounts", headers=H, json={"email": "m%d@gmail.com" % i, "password": "abcdabcdabcdabcd", "provider": "gmail", "daily_cap": 150})
        assert r.status_code == 200, (i, r.get_json())
    assert c.post("/api/accounts", headers=H, json={"email": "m26@gmail.com", "password": "abcdabcdabcdabcd", "provider": "gmail"}).status_code == 400
    assert db.one("SELECT MAX(daily_cap) m FROM accounts")["m"] == 150
    c.post("/api/accounts/1/update", headers=H, json={"daily_cap": 9999})
    assert db.one("SELECT daily_cap FROM accounts WHERE id=1")["daily_cap"] == 150


def test_lead_numbers_and_assignment_by_ranges():
    a, b = acct(1), acct(2)
    for i in range(1, 21):
        leads.add_lead("p%d@x.com" % i, "P%d" % i)
    assert [r["num"] for r in db.q("SELECT num FROM leads ORDER BY id")][:3] == [1, 2, 3]
    c = server.create_app().test_client()
    r = c.post("/api/assign", headers=H, json={"rules": [{"account": a["id"], "from": 1, "to": 10}, {"account": b["id"], "from": 11, "to": 20}]})
    assert r.status_code == 200
    sent = {a["id"]: [], b["id"]: []}
    for acc in (a, b):
        for _ in range(10):
            fake = []
            assert scheduler.send_one(acc, lambda ac, m, f=fake: f.append(m)) == "sent"
            sent[acc["id"]].append(fake[0]["To"])
    assert set(sent[a["id"]]) == {"p%d@x.com" % i for i in range(1, 11)}
    assert set(sent[b["id"]]) == {"p%d@x.com" % i for i in range(11, 21)}


def test_bad_range_is_refused():
    a = acct(1)
    c = server.create_app().test_client()
    assert c.post("/api/assign", headers=H, json={"rules": [{"account": a["id"], "from": 10, "to": 2}]}).status_code == 400
    assert c.post("/api/assign", headers=H, json={"rules": [{"account": 999, "from": 1, "to": 2}]}).status_code == 400


def test_split_in_blocks():
    a, b = acct(1), acct(2)
    for i in range(1, 31):
        leads.add_lead("s%d@x.com" % i)
    c = server.create_app().test_client()
    c.post("/api/assign", headers=H, json={"split": {"accounts": [a["id"], b["id"]], "block": 10}})
    who = {r["num"]: r["account_id"] for r in db.q("SELECT num, account_id FROM leads")}
    assert all(who[n] == a["id"] for n in range(1, 11)) and all(who[n] == b["id"] for n in range(11, 21)) and all(who[n] == a["id"] for n in range(21, 31))


def test_an_emailed_address_is_never_sent_again_even_after_deleting_the_lead():
    a = acct(1)
    leads.add_lead("once@x.com", "Once")
    assert scheduler.send_one(a, lambda ac, m: None) == "sent"
    db.run("DELETE FROM leads")                                   # the person clears their list
    assert leads.add_lead("once@x.com") == "sent_before"
    assert db.one("SELECT COUNT(*) n FROM leads")["n"] == 0
    res = leads.import_csv("email,first\nonce@x.com,Once\nnew@x.com,New\nnew@x.com,New again\n", "again")
    assert res["added"] == 1 and res["sent_before"] == 1 and res["duplicate"] == 1


def test_upload_report_names_addresses_sent_before():
    a = acct(1)
    leads.add_lead("old@x.com")
    scheduler.send_one(a, lambda ac, m: None)
    c = server.create_app().test_client()
    text = "email,first\nold@x.com,Old\nfresh@x.com,Fresh\nfresh@x.com,Again\n"
    an = c.post("/api/leads/analyze", headers=H, json={"text": text}).get_json()
    assert [x["email"] for x in an["already_sent"]] == ["old@x.com"]
    res = c.post("/api/leads/import_mapped", headers=H, json={"text": an["text"], "name": "u", "mapping": an["guess"]}).get_json()
    assert res["added"] == 1 and res["sent_before"] == 1 and res["duplicate"] == 1 and res["sent_before_list"][0]["email"] == "old@x.com"


def test_pdf_becomes_a_table():
    pdf = make_pdf("Contact Ann Lee ann.lee@cafe.com and Bob Stone bob@gym.com or ann.lee@cafe.com again")
    csv_text = docs.pdf_to_csv(pdf)
    rows = [l for l in csv_text.splitlines()[1:] if l]
    assert len(rows) == 2 and rows[0].startswith("ann.lee@cafe.com,Contact") or rows[0].startswith("ann.lee@cafe.com,Ann")
    c = server.create_app().test_client()
    an = c.post("/api/leads/analyze", headers=H, json={"pdf_b64": base64.b64encode(pdf).decode()}).get_json()
    assert an["total"] == 2 and an["headers"][an["guess"]["email"]] == "Email"
    bad = c.post("/api/leads/analyze", headers=H, json={"pdf_b64": base64.b64encode(make_pdf("no addresses here")).decode()})
    assert bad.status_code == 400
