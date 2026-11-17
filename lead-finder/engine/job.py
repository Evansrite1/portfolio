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

from . import countries as world, crawl, niches, sources, verify

SOCIAL_COLS = ["instagram", "instagram_link", "facebook", "twitter", "linkedin", "tiktok", "youtube", "pinterest", "whatsapp", "telegram", "threads"]
ESSENTIAL = ["business", "niche", "country", "city", "email", "phone", "website"] + SOCIAL_COLS
EXTRA = ["address", "email_type", "email_check", "first_name", "source", "found_on"]
COLUMN_NAMES = {"business": "Business", "niche": "Niche", "country": "Country", "city": "City", "address": "Address", "phone": "Phone", "email": "Email",
                "email_type": "Email type", "email_check": "Email check", "first_name": "First name", "website": "Website", "instagram": "Instagram handle",
                "instagram_link": "Instagram link", "facebook": "Facebook", "twitter": "X (Twitter)", "linkedin": "LinkedIn", "tiktok": "TikTok", "youtube": "YouTube",
                "pinterest": "Pinterest", "whatsapp": "WhatsApp", "telegram": "Telegram", "threads": "Threads", "source": "Found by", "found_on": "Email found on"}
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
            places = self._places()
            if not terms:
                self.state, self.message = "error", "Choose at least one niche."
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

    def _places(self):
        """The places to search, as questions for the map. Cities typed by hand are searched inside each picked country. With no country
        and no city, every country in the world is tried, the best mapped ones first, until there are enough leads."""
        cities = [x.strip() for x in str(self.p.get("places") or "").replace("\n", ",").split(",") if x.strip()]
        picked = [c for c in (self.p.get("countries") or []) if c in world.COUNTRIES]
        if cities and picked:
            return ["%s, %s" % (ci, co) for co in picked for ci in cities]
        if cities:
            return cities
        return picked or world.order_for_any()

    def _niches(self):
        out = []
        for i in self.p.get("niches") or []:
            if i in niches.BY_ID:
                out.append(niches.BY_ID[i])
        for t in [x.strip() for x in str(self.p.get("custom") or "").split(",") if x.strip()]:
            hits = niches.match_custom(t)
            for n in hits:
                if n not in out:
                    out.append(n)
            if not hits:                              # a niche that is not in the list: searched by its words on the map
                out.append({"id": "custom:" + t.lower(), "label": t, "group": "custom", "tags": []})
        return out

    def _candidates(self, n, geo):
        found, seen = [], set()
        try:
            for c in (sources.overpass(n["tags"], geo, limit=max(200, self.target * 6)) if n["tags"] else []):
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
        socials = dict(c.get("socials") or {})
        ig = [h for h in [handle_of(c["instagram"])] if h]
        fb = c["facebook"]
        phones = [c["phone"]] if c["phone"] else []
        found_on = "OpenStreetMap" if emails else ""
        need_email = self.mode in ("email", "both") and not emails
        need_ig = self.mode in ("instagram", "both") and not ig
        if url:                                      # the website is always read, so every social page it links to is collected too
            try:
                info = crawl.crawl_site(url, self.renderer if need_email else None)
            except Exception:
                info = {"emails": [], "instagram": [], "facebook": [], "phones": [], "found_on": "", "socials": {}}
            for k, v in (info.get("socials") or {}).items():
                socials.setdefault(k, v)
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
            for k in ("twitter", "linkedin", "tiktok", "youtube", "pinterest", "whatsapp", "telegram", "threads"):
                row[k] = socials.get(k, "")
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

    def pdf_bytes(self, extras=None):
        """The leads as an easy to read PDF: one row per lead, the contact details first."""
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
        small = ParagraphStyle("s", fontName="Helvetica", fontSize=7.5, leading=9.5)
        head = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=7.5, leading=9.5, textColor=colors.white)
        esc = lambda t: str(t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        def socials_of(r):
            out = []
            for k, label in (("instagram", "Instagram"), ("facebook", "Facebook"), ("twitter", "X"), ("linkedin", "LinkedIn"), ("tiktok", "TikTok"), ("youtube", "YouTube"),
                             ("pinterest", "Pinterest"), ("whatsapp", "WhatsApp"), ("telegram", "Telegram"), ("threads", "Threads")):
                v = r.get(k, "")
                if v:
                    out.append("%s: %s" % (label, (("@" + v) if k == "instagram" else v).replace("https://", "").replace("www.", "")))
            return "<br/>".join(esc(x) for x in out)
        data = [[Paragraph(x, head) for x in ("#", "Business", "Niche and place", "Email", "Phone", "Website", "Social media")]]
        for r in self.rows:
            data.append([Paragraph(str(r["#"]), small), Paragraph("<b>%s</b>" % esc(r["business"]), small), Paragraph(esc(r["niche"]) + "<br/>" + esc(r["city"]) + ", " + esc(r["country"]), small),
                         Paragraph(esc(r["email"]) + (("<br/>" + esc(r["email_type"])) if r["email_type"] else ""), small), Paragraph(esc(r["phone"]), small),
                         Paragraph(esc(r["website"].replace("https://", "").replace("http://", "").replace("www.", "")), small), Paragraph(socials_of(r), small)])
        from io import BytesIO
        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=10 * mm, rightMargin=10 * mm, topMargin=12 * mm, bottomMargin=12 * mm, title="Large Lead Finder leads")
        t = Table(data, repeatRows=1, colWidths=[9 * mm, 42 * mm, 40 * mm, 55 * mm, 28 * mm, 50 * mm, 52 * mm])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8412e")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]), ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db"))]))
        story = [Paragraph("Large Lead Finder: %d leads" % len(self.rows), ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=14)), Spacer(1, 4 * mm), t]
        doc.build(story)
        return buf.getvalue()

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
