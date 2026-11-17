"""One search run: for every niche and every place, collect businesses from the map sources, read each one's website for contact
details, check the details, and keep the leads that meet the rule you chose (every lead has an email, or every lead has an
Instagram page, or either)."""
import csv
import io
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

from . import crawl, niches, sources, verify

ESSENTIAL = ["business", "niche", "country", "city", "email", "instagram", "instagram_link", "website"]
EXTRA = ["address", "phone", "email_type", "email_check", "first_name", "facebook", "source", "found_on"]
COLUMN_NAMES = {"business": "Business", "niche": "Niche", "country": "Country", "city": "City", "address": "Address", "phone": "Phone", "email": "Email",
                "email_type": "Email type", "email_check": "Email check", "first_name": "First name", "website": "Website", "instagram": "Instagram handle",
                "instagram_link": "Instagram link", "facebook": "Facebook", "source": "Found by", "found_on": "Email found on"}
MODES = ("email", "instagram", "both")


def handle_of(s):
    s = str(s or "").strip().lstrip("@")
    m = re.search(r"instagram\.com/([A-Za-z0-9._]{2,30})", s)
    if m:
        s = m.group(1)
    s = s.split("/")[0].split("?")[0]
    return s.lower() if re.fullmatch(r"[A-Za-z0-9._]{2,30}", s) and s.lower() not in ("instagram", "explore", "p", "reel") else ""


def domain_of(url):
    d = urlparse(url if "//" in url else "//" + url).netloc.lower()
    return d[4:] if d.startswith("www.") else d


class Job:
    def __init__(self, params, log, skip_emails=(), skip_handles=(), renderer=None, workers=6):
        self.p, self.log, self.renderer, self.workers = params, log, renderer, workers
        self.mode = params.get("mode") if params.get("mode") in MODES else "email"
        self.target = max(1, min(5000, int(params.get("target") or 50)))
        self.rows, self.lock = [], threading.RLock()
        self.stop_flag = threading.Event()
        self.state, self.message, self.checked, self.started = "starting", "", 0, time.time()
        self.skipped = {}
        self.seen_email, self.seen_handle, self.seen_dom = set(skip_emails), set(skip_handles), set()
        self.seen_biz = set()
        self.thread = None

    # ---------- control ----------
    def start(self):
        self.thread = threading.Thread(target=self._main, daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_flag.set()
        if self.state == "running":
            self.state, self.message = "stopping", "Finishing what is in progress"

    def skip(self, why):
        with self.lock:
            self.skipped[why] = self.skipped.get(why, 0) + 1

    def snapshot(self):
        with self.lock:
            return {"state": self.state, "message": self.message, "found": len(self.rows), "target": self.target, "checked": self.checked,
                    "skipped": dict(self.skipped), "elapsed": int(time.time() - self.started), "mode": self.mode}

    def _done(self):
        return len(self.rows) >= self.target or self.stop_flag.is_set()

    # ---------- the run ----------
    def _main(self):
        try:
            self.state = "running"
            terms = self._niches()
            places = [x.strip() for x in str(self.p.get("places") or "").replace("\n", ",").split(",") if x.strip()]
            if not terms or not places:
                self.state, self.message = "error", "Choose at least one niche and one place."
                return
            for place in places:
                if self._done():
                    break
                self.message = f"Finding {place} on the map"
                try:
                    geo = sources.geocode(place)
                except Exception as e:  # noqa
                    self.log(f"Could not look up {place}: {e}")
                    geo = None
                if not geo or not (geo.get("area_id") or geo.get("bbox")):
                    self.skip(f"place not found: {place}")
                    self.log(f"{place}: no such place on the map")
                    continue
                self.log(f"{place}: {geo['name']}, {geo['country']}")
                for n in terms:
                    if self._done():
                        break
                    self.message = f"{n['label']} in {geo['name']}"
                    cands = self._candidates(n, geo)
                    self.log(f"{n['label']} in {geo['name']}: {len(cands)} businesses to check")
                    with ThreadPoolExecutor(self.workers) as ex:
                        list(ex.map(lambda c: self._lead(c, n, geo), cands))
            if self.renderer:
                self.renderer.close()
            self.state = "stopped" if self.stop_flag.is_set() else "done"
            self.message = f"{len(self.rows)} leads found" + ("" if len(self.rows) >= self.target else " (the map has no more matching businesses with the details you asked for)")
        except Exception as e:  # noqa
            self.state, self.message = "error", str(e)[:200]
            self.log(f"Stopped: {e}")

    def _niches(self):
        out = []
        for i in self.p.get("niches") or []:
            if i in niches.BY_ID:
                out.append(niches.BY_ID[i])
        for t in [x.strip() for x in str(self.p.get("custom") or "").split(",") if x.strip()]:
            for n in niches.match_custom(t):
                if n not in out:
                    out.append(n)
        return out

    def _candidates(self, n, geo):
        found, seen = [], set()
        try:
            for c in sources.overpass(n["tags"], geo, limit=max(200, self.target * 6)):
                if c["osm"] not in seen:
                    seen.add(c["osm"])
                    found.append(c)
        except Exception as e:  # noqa
            self.log(f"The map service had a problem: {e}")
        if len(found) < self.target * 2 and not self.stop_flag.is_set():          # a second view of the map for thin areas
            try:
                for c in sources.nominatim_places(n["label"].lower(), geo["query"], 40):
                    if c["osm"] not in seen:
                        seen.add(c["osm"])
                        found.append(c)
            except Exception as e:  # noqa
                self.log(f"Place search had a problem: {e}")
        # businesses that already show a website or an email are the most likely to give a lead, so they go first
        found.sort(key=lambda c: -(bool(c["email"]) * 2 + bool(c["website"]) + bool(c["instagram"])))
        return found

    def _lead(self, c, n, geo):
        if self._done():
            return
        with self.lock:
            key = (c["name"].lower(), c.get("address", "")[:20])
            if key in self.seen_biz:
                return
            self.seen_biz.add(key)
            self.checked += 1
        url = sources.clean_url(c["website"])
        dom = domain_of(url) if url else ""
        if dom:
            with self.lock:
                if dom in self.seen_dom:
                    return self.skip("same website as another lead")
        emails = [c["email"].lower()] if c["email"] else []
        ig = [h for h in [handle_of(c["instagram"])] if h]
        fb = c["facebook"]
        phones = [c["phone"]] if c["phone"] else []
        found_on = "OpenStreetMap" if emails else ""
        need_email = self.mode in ("email", "both") and not emails
        need_ig = self.mode in ("instagram", "both") and not ig
        if url and (need_email or need_ig):
            try:
                info = crawl.crawl_site(url, self.renderer if need_email else None)
            except Exception:
                info = {"emails": [], "instagram": [], "facebook": [], "phones": [], "found_on": ""}
            for e in crawl.best_email(info["emails"], dom):
                if e not in emails:
                    emails.append(e)
            ig += [h for h in info["instagram"] if h not in ig]
            fb = fb or (("https://facebook.com/" + info["facebook"][0]) if info["facebook"] else "")
            phones += [p for p in info["phones"] if p not in phones]
            found_on = found_on or info["found_on"]
        chosen, chk = "", {}
        for e in emails:
            r = verify.check(e)
            if r["ok"]:
                chosen, chk = e, r
                break
        if self.mode == "email" and not chosen:
            return self.skip("no working email found")
        if self.mode == "instagram" and not ig:
            return self.skip("no Instagram page found")
        if self.mode == "both" and not chosen and not ig:
            return self.skip("no email and no Instagram page")
        handle = ig[0] if ig else ""
        with self.lock:
            if len(self.rows) >= self.target:
                return
            if chosen and chosen in self.seen_email:
                return self.skip("email already in your list")
            if handle and handle in self.seen_handle:
                return self.skip("Instagram page already in your list")
            if chosen:
                self.seen_email.add(chosen)
            if handle:
                self.seen_handle.add(handle)
            if dom:
                self.seen_dom.add(dom)
            row = {"business": c["name"], "niche": n["label"], "country": geo.get("country", ""), "city": c.get("city") or geo.get("name", ""), "address": c.get("address", ""),
                   "phone": phones[0] if phones else "", "email": chosen, "email_type": chk.get("kind", ""),
                   "email_check": ("domain accepts mail" if chk.get("checked") else "format ok, domain not checked") if chosen else "",
                   "first_name": verify.first_name(chosen) if chosen else "", "website": url, "instagram": handle,
                   "instagram_link": ("https://www.instagram.com/%s/" % handle) if handle else "", "facebook": fb, "source": c["source"], "found_on": found_on}
            row["#"] = len(self.rows) + 1
            self.rows.append(row)
        self.log(f"+ {c['name']}  {chosen or '-'}  {('@' + handle) if handle else '-'}")

    # ---------- files ----------
    def _csv(self, columns, header_names, rows):
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(header_names)
        for r in rows:
            w.writerow([r.get(c, "") for c in columns])
        return "﻿" + buf.getvalue()

    def csv_all(self, extras=None):
        extras = [x for x in (extras if extras is not None else EXTRA) if x in EXTRA]
        cols = ["#"] + ESSENTIAL + extras
        return self._csv(cols, ["#"] + [COLUMN_NAMES[c] for c in cols[1:]], self.rows)

    def csv_for_mailer(self):
        """Columns the Outreach Mailer reads on its own: Email, First name, Business, City, Website, plus the niche and phone as fields."""
        rows = [r for r in self.rows if r["email"]]
        cols = ["email", "first_name", "business", "city", "website", "niche", "phone", "country"]
        return self._csv(cols, ["Email", "First name", "Business", "City", "Website", "Niche", "Phone", "Country"], rows)

    def csv_for_instagram(self):
        """Columns IG Outreach reads: handle, business, niche, city, country."""
        rows = [r for r in self.rows if r["instagram"]]
        cols = ["instagram", "business", "niche", "city", "country", "website", "instagram_link"]
        return self._csv(cols, ["handle", "business", "niche", "city", "country", "website", "instagram_link"], rows)
