"""Large Lead Finder checks that need no internet: the map and web services are replaced by stand-ins."""
import csv
import io
import os
import sys
import tempfile
import time

import pytest

os.environ.setdefault("LLF_HOME", tempfile.mkdtemp())
os.environ["LLF_KEY"] = "testkey"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import crawl, job as joblib, niches, server, sources, verify  # noqa: E402

H = {"X-LLF-Key": "testkey"}


def test_niche_catalog():
    assert len(niches.NICHES) >= 120
    ids = [n["id"] for n in niches.NICHES]
    assert len(ids) == len(set(ids))
    for n in niches.NICHES:
        assert n["tags"] and all("=" in t for t in n["tags"]), n
    assert {"bakery", "hairdresser", "lawyer", "gym", "hotel", "electrician"} <= set(ids)
    assert [n["id"] for n in niches.match_custom("tattoo")] == ["tattoo"]


def test_overpass_question_and_parsing():
    q = sources.overpass_query(["shop=bakery", "shop=confectionery"], area_id=3600123, limit=100)
    assert "area(3600123)->.a;" in q and 'nwr["shop"="bakery"](area.a);' in q and "out tags center 100;" in q
    b = sources.overpass_query(["amenity=cafe"], bbox=[6.3, 6.7, 3.1, 3.6])
    assert '(6.3,3.1,6.7,3.6)' in b
    el = {"type": "node", "id": 7, "tags": {"name": "Tasty Bakes", "contact:email": "hi@tasty.ng", "website": "tasty.ng", "contact:instagram": "tastybakes",
                                          "addr:street": "Main St", "addr:housenumber": "4", "addr:city": "Lagos", "phone": "+234 803 123 4567"}}
    p = sources.parse_osm(el)
    assert p["email"] == "hi@tasty.ng" and p["instagram"] == "tastybakes" and p["address"].startswith("4 Main St") and p["osm"] == "node/7"


HTML = """<html><body>
<a href="mailto:Ann.Lee@Tasty.NG?subject=hi">mail</a> Write to sales [at] tasty [dot] ng or info@tasty.ng
<a href="https://www.instagram.com/tastybakes/">ig</a><a href="https://instagram.com/p/XYZ/">post</a><a href="https://www.instagram.com/explore/">e</a>
<a href="https://facebook.com/tastybakesng">fb</a> Call +234 803 123 4567 <img src="logo@2x.png"> you@example.com
<a href="/contact-us">Contact</a></body></html>"""


def test_parse_page_and_best_email():
    r = crawl.parse_page(HTML)
    assert "ann.lee@tasty.ng" in r["emails"] and "sales@tasty.ng" in r["emails"] and "info@tasty.ng" in r["emails"]
    assert not any("example" in e or "2x" in e for e in r["emails"])
    assert r["instagram"] == ["tastybakes"]                     # posts and the explore page are not accounts
    assert r["facebook"] == ["tastybakesng"] and r["phones"] == ["+2348031234567"]
    assert crawl.best_email(r["emails"], "tasty.ng")[0] == "ann.lee@tasty.ng"      # a person before info@


def test_verify(monkeypatch):
    monkeypatch.setattr(verify, "has_mx", lambda d, timeout=6: d != "nowhere.invalid")
    assert verify.check("ann@tasty.ng")["ok"] and verify.check("ann@tasty.ng")["kind"] == "personal"
    assert verify.check("info@tasty.ng")["kind"] == "generic"
    assert not verify.check("a@nowhere.invalid")["ok"] and not verify.check("bad@@x")["ok"]
    assert not verify.check("x@mailinator.com")["ok"] and not verify.check("1234567890123@x.com")["ok"]
    assert verify.check("owner@gmail.com")["free"] is True
    assert verify.first_name("ann.lee@x.com") == "Ann" and verify.first_name("info@x.com") == ""
    monkeypatch.setattr(verify, "has_mx", lambda d, timeout=6: None)           # lookup failed: allowed, but not marked as checked
    r = verify.check("ann@tasty.ng")
    assert r["ok"] and not r["checked"]


def biz(i, **kw):
    d = {"name": "Biz %d" % i, "phone": "", "email": "", "website": "", "instagram": "", "facebook": "", "address": "%d Road" % i, "city": "Lagos", "source": "OpenStreetMap", "osm": "node/%d" % i}
    d.update(kw)
    return d


@pytest.fixture()
def fake_world(monkeypatch):
    monkeypatch.setattr(sources, "geocode", lambda p: {"name": p, "country": "Nigeria", "country_code": "NG", "area_id": 3600001, "bbox": None, "query": p})
    data = [biz(1, email="owner1@biz1.ng", website="biz1.ng"), biz(2, website="biz2.ng"), biz(3, instagram="biz3ig"), biz(4, website="biz4.ng"),
            biz(5, email="owner1@biz1.ng"), biz(6, email="info@dead.invalid"), biz(7, website="biz7.ng", instagram="@Biz7IG")]
    monkeypatch.setattr(sources, "overpass", lambda tags, geo, limit=400: [dict(x) for x in data])
    monkeypatch.setattr(sources, "nominatim_places", lambda *a, **k: [])
    sites = {"http://biz2.ng": {"emails": ["hello@biz2.ng", "ann@biz2.ng"], "instagram": ["biz2ig"], "facebook": [], "phones": ["+2348000000001"], "found_on": "http://biz2.ng/contact"},
             "http://biz4.ng": {"emails": [], "instagram": [], "facebook": [], "phones": [], "found_on": ""},
             "http://biz7.ng": {"emails": ["x@biz7.ng"], "instagram": [], "facebook": [], "phones": [], "found_on": "http://biz7.ng"},
             "http://biz1.ng": {"emails": [], "instagram": [], "facebook": [], "phones": [], "found_on": ""}}
    monkeypatch.setattr(crawl, "crawl_site", lambda url, render=None, pause=0: sites.get(url, {"emails": [], "instagram": [], "facebook": [], "phones": [], "found_on": ""}))
    monkeypatch.setattr(verify, "has_mx", lambda d, timeout=6: not d.endswith(".invalid"))


def run(params, **kw):
    j = joblib.Job(params, lambda m: None, workers=1, **kw)
    j._main()
    return j


def test_email_mode_keeps_only_working_emails(fake_world):
    j = run({"mode": "email", "niches": ["bakery"], "places": "Lagos", "target": 50})
    mails = [r["email"] for r in j.rows]
    assert sorted(mails) == ["ann@biz2.ng", "owner1@biz1.ng", "x@biz7.ng"]          # the dead domain, no-email and repeat businesses are left out
    assert all(r["email"] for r in j.rows) and j.skipped["no working email found"] >= 2
    ann = [r for r in j.rows if r["email"] == "ann@biz2.ng"][0]
    assert ann["first_name"] == "Ann" and ann["found_on"].endswith("/contact") and ann["country"] == "Nigeria"


def test_instagram_mode_keeps_only_instagram_pages(fake_world):
    j = run({"mode": "instagram", "niches": ["bakery"], "places": "Lagos", "target": 50})
    assert [r["instagram"] for r in j.rows] == ["biz2ig", "biz3ig", "biz7ig"] or sorted(r["instagram"] for r in j.rows) == ["biz2ig", "biz3ig", "biz7ig"]
    assert all(r["instagram_link"].startswith("https://www.instagram.com/") for r in j.rows)


def test_both_mode_and_target_and_skip_lists(fake_world):
    j = run({"mode": "both", "niches": ["bakery"], "places": "Lagos", "target": 3})
    assert len(j.rows) == 3 and j.state == "done"
    j2 = run({"mode": "email", "niches": ["bakery"], "places": "Lagos", "target": 50}, skip_emails={"owner1@biz1.ng"})
    assert "owner1@biz1.ng" not in [r["email"] for r in j2.rows]
    j3 = run({"mode": "instagram", "niches": ["bakery"], "places": "Lagos", "target": 50}, skip_handles={"biz3ig"})
    assert "biz3ig" not in [r["instagram"] for r in j3.rows]


def test_needs_niche_and_place(fake_world):
    j = run({"mode": "email", "niches": [], "places": "Lagos"})
    assert j.state == "error"


def test_csv_files_for_the_other_apps(fake_world):
    j = run({"mode": "both", "niches": ["bakery"], "places": "Lagos", "target": 50})
    allc = list(csv.reader(io.StringIO(j.csv_all(["address"]).lstrip("﻿"))))
    assert allc[0][:4] == ["#", "Business", "Niche", "Country"] and "Facebook" in allc[0] and "LinkedIn" in allc[0] and "Email type" not in allc[0]
    mail = list(csv.DictReader(io.StringIO(j.csv_for_mailer().lstrip("﻿"))))
    assert set(mail[0]) == {"Email", "First name", "Business", "City", "Website", "Niche", "Phone", "Country"} and all(r["Email"] for r in mail)
    ig = list(csv.DictReader(io.StringIO(j.csv_for_instagram().lstrip("﻿"))))
    assert "handle" in ig[0] and all(r["handle"] for r in ig)


def test_mailer_can_import_what_the_finder_makes(fake_world, tmp_path, monkeypatch):
    """The two apps must agree: the Mailer reads the Finder's file with no column fixing."""
    j = run({"mode": "email", "niches": ["bakery"], "places": "Lagos", "target": 50})
    saved = {k: v for k, v in sys.modules.items() if k == "engine" or k.startswith("engine.")}
    path_before = list(sys.path)
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "mailer-app"))
        os.environ["MAILER_HOME"] = str(tmp_path)
        for k in saved:
            del sys.modules[k]
        import importlib
        leads = importlib.import_module("engine.leads")
        a = leads.analyze(j.csv_for_mailer())
        assert a["headers"][a["guess"]["email"]] == "Email" and a["headers"][a["guess"]["biz"]] == "Business" and a["headers"][a["guess"]["first"]] == "First name"
    finally:
        for k in [k for k in sys.modules if k == "engine" or k.startswith("engine.")]:
            del sys.modules[k]
        sys.modules.update(saved)
        sys.path[:] = path_before


def test_server_key_and_validation(fake_world):
    c = server.create_app().test_client()
    assert c.get("/api/info").status_code == 403 and c.get("/").status_code == 403
    assert "Large Lead Finder" in c.get("/?k=testkey").get_data(as_text=True)
    info = c.get("/api/info", headers=H).get_json()
    assert len(info["niches"]) >= 120 and "email_type" in info["columns"]["extra"]
    assert c.post("/api/run", headers=H, json={"mode": "x"}).status_code == 400
    assert c.post("/api/run", headers=H, json={"mode": "email", "niches": []}).status_code == 400
    assert c.get("/api/download/all", headers=H).status_code == 404
    r = c.post("/api/run", headers=H, json={"mode": "email", "niches": ["bakery"], "places": "Lagos", "target": 5, "use_browser": False})
    assert r.status_code == 200
    for _ in range(100):
        s = c.get("/api/state", headers=H).get_json()
        if s["job"]["state"] in ("done", "error", "stopped"):
            break
        time.sleep(0.1)
    assert s["job"]["state"] == "done" and s["job"]["found"] >= 1
    assert b"Email" in c.get("/api/download/mailer", headers=H).data
    sk = c.post("/api/skip", headers=H, json={"text": "email,handle\nold@x.com,@oldig\nsee https://instagram.com/another"}).get_json()
    assert sk["emails"] == 1 and sk["handles"] == 2


SOCIAL_HTML = """<a href="https://www.facebook.com/tastybakesng">fb</a><a href="https://twitter.com/tastybakes_ng?lang=en">x</a><a href="https://x.com/intent/tweet?text=hi">share</a>
<a href="https://www.linkedin.com/company/tasty-bakes-ltd/">li</a><a href="https://www.tiktok.com/@tastybakes">tt</a><a href="https://www.youtube.com/@TastyBakes">yt</a>
<a href="https://www.pinterest.com/tastybakes/">pin</a><a href="https://wa.me/2348031234567">wa</a><a href="https://t.me/tastybakes_chat">tg</a><a href="https://www.threads.net/@tastybakes">th</a>
<a href="https://www.instagram.com/tastybakes/">ig</a>"""


def test_every_social_platform_is_found():
    r = crawl.parse_page(SOCIAL_HTML)
    s = r["socials"]
    assert s["twitter"] == "https://x.com/tastybakes_ng" and s["linkedin"] == "https://www.linkedin.com/company/tasty-bakes-ltd"
    assert s["tiktok"] == "https://www.tiktok.com/@tastybakes" and s["youtube"] == "https://www.youtube.com/@TastyBakes"
    assert s["pinterest"] == "https://www.pinterest.com/tastybakes/" and s["whatsapp"] == "https://wa.me/2348031234567"
    assert s["telegram"] == "https://t.me/tastybakes_chat" and s["threads"] == "https://www.threads.net/@tastybakes"
    assert r["instagram"] == ["tastybakes"] and r["facebook"] == ["tastybakesng"]


def test_osm_social_tags():
    p = sources.parse_osm({"type": "node", "id": 1, "tags": {"name": "A", "contact:twitter": "ax", "contact:youtube": "https://youtube.com/@a"}})
    assert p["socials"] == {"twitter": "ax", "youtube": "https://youtube.com/@a"}


def test_all_social_media_reach_the_csv_and_the_pdf(fake_world, monkeypatch):
    sites = {"http://biz2.ng": {"emails": ["ann@biz2.ng"], "instagram": ["biz2ig"], "facebook": [], "phones": [], "found_on": "http://biz2.ng", "socials": {"twitter": "https://x.com/biz2", "linkedin": "https://www.linkedin.com/company/biz2", "tiktok": "https://www.tiktok.com/@biz2"}}}
    monkeypatch.setattr(crawl, "crawl_site", lambda url, render=None, pause=0: sites.get(url, {"emails": [], "instagram": [], "facebook": [], "phones": [], "found_on": "", "socials": {}}))
    j = run({"mode": "email", "niches": ["bakery"], "places": "Lagos", "target": 50})
    row = [r for r in j.rows if r["email"] == "ann@biz2.ng"][0]
    assert row["twitter"] == "https://x.com/biz2" and row["linkedin"].endswith("company/biz2") and row["tiktok"].endswith("@biz2") and row["instagram"] == "biz2ig"
    c = list(csv.DictReader(io.StringIO(j.csv_all().lstrip("﻿"))))
    assert {"Instagram handle", "Facebook", "X (Twitter)", "LinkedIn", "TikTok", "YouTube", "Pinterest", "WhatsApp", "Telegram", "Threads"} <= set(c[0])
    pdf = j.pdf_bytes()
    assert pdf.startswith(b"%PDF") and len(pdf) > 1500


def test_countries_and_any_country():
    from engine import countries
    assert len(countries.COUNTRIES) >= 190 and "Nigeria" in countries.COUNTRIES and "Kuwait" in countries.COUNTRIES
    assert countries.order_for_any()[0] == "United States" and set(countries.order_for_any()) == set(countries.COUNTRIES)
    j = joblib.Job({"mode": "email", "niches": ["bakery"], "countries": ["Nigeria", "Kuwait"], "places": "Lagos, Kuwait City", "target": 5}, lambda m: None)
    assert j._places() == ["Lagos, Nigeria", "Kuwait City, Nigeria", "Lagos, Kuwait", "Kuwait City, Kuwait"]
    assert joblib.Job({"mode": "email", "niches": ["bakery"], "countries": ["Nigeria"], "target": 5}, lambda m: None)._places() == ["Nigeria"]
    assert joblib.Job({"mode": "email", "niches": ["bakery"], "places": "Lagos", "target": 5}, lambda m: None)._places() == ["Lagos"]
    assert len(joblib.Job({"mode": "email", "niches": ["bakery"], "target": 5}, lambda m: None)._places()) == len(countries.COUNTRIES)      # none picked means any country


def test_pdf_download_endpoint(fake_world):
    c = server.create_app().test_client()
    c.post("/api/run", headers=H, json={"mode": "email", "niches": ["bakery"], "places": "Lagos", "target": 3, "use_browser": False})
    for _ in range(100):
        s = c.get("/api/state", headers=H).get_json()
        if s["job"]["state"] in ("done", "error", "stopped"):
            break
        time.sleep(0.1)
    r = c.get("/api/download/pdf", headers=H)
    assert r.status_code == 200 and r.data.startswith(b"%PDF") and r.mimetype == "application/pdf"
    assert len(c.get("/api/info", headers=H).get_json()["countries"]) >= 190


def test_a_niche_typed_by_hand_that_is_not_in_the_list_is_still_searched(fake_world, monkeypatch):
    seen = []
    monkeypatch.setattr(sources, "nominatim_places", lambda term, place, limit=40: seen.append(term) or [biz(1, email="owner1@biz1.ng")])
    j = run({"mode": "email", "niches": [], "custom": "drone photography", "places": "Lagos", "target": 5})
    assert seen == ["drone photography"] and [r["email"] for r in j.rows] == ["owner1@biz1.ng"] and j.rows[0]["niche"] == "drone photography"
