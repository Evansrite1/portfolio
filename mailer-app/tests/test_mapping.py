"""Importing a spreadsheet: finding the email column, suggesting fixes, correcting a lead, and the email using the correction."""
import pytest

from engine import config, db, leads, scheduler, templates

H = {"X-Mailer-Key": "testkey"}


@pytest.fixture(autouse=True)
def fresh(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setattr(config, "SECRETS_PATH", str(tmp_path / "s.json"))
    db._local.__dict__.clear()


MESSY = ("Company Name,Owner,Reach us,Town,Web\n"
         "Ann Cafe,Ann Lee,Contact: ANN@cafe.com;,Austin,anncafe.com\n"
         "Bob Gym,Bob Stone,bob@gmial.com,Dallas,https://bobgym.com\n"
         "Cy Salon,Cy,cy at salon dot com,Miami,\n"
         "Dee Bakes,Dee Ray,dee@bakes.con,Reno,deebakes.com\n"
         ",,,,\n")


def test_guesses_the_columns_from_the_values():
    a = leads.analyze(MESSY)
    g = a["guess"]
    assert a["headers"][g["email"]] == "Reach us"          # not called email at all
    assert a["headers"][g["biz"]] == "Company Name" and a["headers"][g["first"]] == "Owner"
    assert a["headers"][g["city"]] == "Town" and a["headers"][g["website"]] == "Web"
    assert a["total"] == 4


def test_no_header_row():
    a = leads.analyze("x@y.com,Xavier\nz@y.com,Zed\n")
    assert a["headers"] == ["Column 1", "Column 2"] and a["guess"]["email"] == 0 and a["total"] == 2


def test_extract_and_suggest():
    assert leads.extract_email("Contact: MAILTO:Sam@X.com;") == "sam@x.com"
    assert leads.extract_email("no address here") is None
    assert leads.suggest_fix("bob@gmial.com") == "bob@gmail.com"
    assert leads.suggest_fix("dee@bakes.con") == "dee@bakes.com"
    assert leads.suggest_fix("a b@c.com") == "ab@c.com"
    assert leads.suggest_fix("nonsense") is None
    assert leads.suggest_fix("fine@ok.com") is None


def test_problem_rows_come_with_fixes():
    a = leads.analyze(MESSY)
    probs = leads.check_rows(MESSY, a["guess"]["email"])
    by = {p["row"]: p for p in probs}
    # Ann is fine; Bob and Dee have fixable typos; Cy cannot be read as an address
    assert 0 not in by
    assert by[1]["suggestion"] == "bob@gmail.com" and by[3]["suggestion"] == "dee@bakes.com"
    assert by[2]["suggestion"] is None


def test_import_with_corrections_and_skips():
    a = leads.analyze(MESSY)
    mapping = {k: v for k, v in a["guess"].items()}
    res = leads.import_mapped(MESSY, mapping, "messy", fixes={"1": {"email": "bob@gmail.com"}, "2": {"email": "cy@salon.com", "first": "Cyrus"}, "3": {"email": "dee@bakes.com"}})
    assert res["added"] == 4
    ann = db.one("SELECT * FROM leads WHERE email='ann@cafe.com'")
    assert ann["biz"] == "Ann Cafe" and ann["first"] == "Ann" and ann["city"] == "Austin" and ann["source"] == "messy"   # full name gives the first name
    assert db.one("SELECT first FROM leads WHERE email='cy@salon.com'")["first"] == "Cyrus"
    res2 = leads.import_mapped(MESSY, mapping, "again", skip=[0, 1, 2, 3])
    assert res2["skipped"] == 4 and res2["added"] == 0


def test_unfixed_bad_rows_are_counted_not_imported():
    a = leads.analyze(MESSY)
    res = leads.import_mapped(MESSY, a["guess"], "x")
    assert res["added"] == 3 and res["invalid"] == 1          # the unreadable one is counted; typos are imported as typed unless fixed


def test_edit_a_lead_and_the_email_uses_it(tmp_path):
    leads.add_lead("old@x.com", "Olly", "Old Name")
    lid = db.one("SELECT id FROM leads")["id"]
    assert leads.update_lead(lid, {"email": "new@x.com", "first": "Nina", "biz": "Fresh Name"}) == "ok"
    lead = db.one("SELECT * FROM leads")
    s = {"sender_name": "Evans", "templates": {"first_subject": "Hi {{first}}", "first_body": "About {{biz}}"}}
    subj, body = templates.render("first", lead, s)
    assert lead["email"] == "new@x.com" and subj == "Hi Nina" and body.startswith("About Fresh Name")
    assert leads.update_lead(lid, {"email": "bad"}) == "invalid"
    leads.add_lead("other@x.com")
    assert leads.update_lead(lid, {"email": "other@x.com"}) == "duplicate"
    db.run("UPDATE leads SET status='sent' WHERE id=?", (lid,))
    assert leads.update_lead(lid, {"first": "Zed"}) == "locked"


def test_api_flow(monkeypatch):
    from engine import server
    c = server.create_app().test_client()
    r = c.post("/api/leads/analyze", headers=H, json={"text": MESSY}).get_json()
    assert r["total"] == 4 and len(r["problems"]) == 3 and r["problems"][0]["suggestion"] == "bob@gmail.com"
    res = c.post("/api/leads/import_mapped", headers=H, json={"text": MESSY, "name": "messy", "mapping": r["guess"], "fixes": {"1": {"email": "bob@gmail.com"}}, "skip": [2, 3]}).get_json()
    assert res["added"] == 2 and res["skipped"] == 2
    lid = db.one("SELECT id FROM leads WHERE email='bob@gmail.com'")["id"]
    assert c.post("/api/leads/%d/update" % lid, headers=H, json={"first": "Robert"}).status_code == 200
    assert c.post("/api/leads/%d/update" % lid, headers=H, json={"email": "nope"}).status_code == 400
    assert c.get("/api/leads/suggest?email=x@gmial.com", headers=H).get_json()["suggestion"] == "x@gmail.com"
