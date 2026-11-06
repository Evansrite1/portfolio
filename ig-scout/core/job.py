"""One search run: find handles, check each profile, keep the ones that match, write rows as they arrive."""
import csv
import glob
import json
import os
import queue
import random
import re
import threading
import time
from datetime import datetime
from pathlib import Path

from . import discover, fit, message as M, profile as P, website as W

# The same columns, in the same order, as the leads sheet (outreach/ig-leads-structured), then the website link and the
# dates of the three newest posts.
COLUMNS = ["#", "handle", "instagram_link", "country", "has_website", "website_detail", "what_they_do", "message",
           "website", "last_3_post_dates"]

MODES = {
    "safe": {"workers": 1, "delay": (3.5, 7.0), "daily_cap": 400},
    "fast": {"workers": 3, "delay": (1.0, 2.5), "daily_cap": 900},
}


def load_known(outreach_dir):
    """Handles the person already has, so the tool never hands back the same business twice."""
    known = set()
    if not outreach_dir or not os.path.isdir(outreach_dir):
        return known
    for f in glob.glob(os.path.join(outreach_dir, "**", "*"), recursive=True):
        if not f.lower().endswith((".csv", ".md", ".txt")):
            continue
        try:
            if os.path.getsize(f) > 8_000_000:
                continue
            text = open(f, encoding="utf-8-sig", errors="ignore").read()
        except Exception:
            continue
        known.update(h.lower() for h in discover.handles_in(text))
        if f.lower().endswith(".csv"):
            try:
                for row in csv.DictReader(text.splitlines()):
                    h = (row.get("handle") or row.get("Handle") or "").strip().lstrip("@")
                    if h:
                        known.add(h.lower())
            except Exception:
                pass
    return known


class Job:
    def __init__(self, engine, params, out_dir, state_file, known, log):
        self.engine, self.p, self.log = engine, params, log
        self.out_dir, self.state_file, self.known = Path(out_dir), Path(state_file), known
        self.mode = MODES.get(params.get("speed"), MODES["safe"])
        self.rows, self.lock = [], threading.Lock()
        self.stop_flag = threading.Event()
        self.state, self.message = "starting", ""
        self.checked = 0
        self.skipped = {}
        self.started = time.time()
        stamp = datetime.now().strftime("%Y-%m-%d-%H%M")
        self.csv_path = self.out_dir / f"leads-{stamp}.csv"
        self.seen = set()
        self.q = queue.Queue()
        self.threads = []
        self.feeder_done = False
        self.active = 0

    # ---------- bookkeeping ----------
    def skip(self, why):
        with self.lock:
            self.skipped[why] = self.skipped.get(why, 0) + 1

    def _today_used(self):
        try:
            d = json.loads(self.state_file.read_text())
        except Exception:
            d = {}
        return d.get(datetime.now().strftime("%Y-%m-%d"), 0)

    def _add_used(self, n=1):
        with self.lock:
            try:
                d = json.loads(self.state_file.read_text())
            except Exception:
                d = {}
            k = datetime.now().strftime("%Y-%m-%d")
            d[k] = d.get(k, 0) + n
            self.state_file.write_text(json.dumps(d))

    def snapshot(self):
        with self.lock:
            return {"state": self.state, "message": self.message, "checked": self.checked, "kept": len(self.rows),
                    "target": self.p["target"], "skipped": dict(self.skipped), "csv": self.csv_path.name,
                    "elapsed": int(time.time() - self.started), "used_today": self._used_cache(),
                    "cap": self.mode["daily_cap"]}

    def _used_cache(self):
        try:
            return json.loads(self.state_file.read_text()).get(datetime.now().strftime("%Y-%m-%d"), 0)
        except Exception:
            return 0

    # ---------- run ----------
    def start(self):
        self.out_dir.mkdir(parents=True, exist_ok=True)
        t = threading.Thread(target=self._main, daemon=True)
        t.start()
        self.threads.append(t)

    def stop(self):
        self.stop_flag.set()
        if self.state == "running":
            self.state, self.message = "stopping", "Finishing the profiles already in progress"

    def _finish(self, state, message):
        with self.lock:
            if self.state not in ("blocked",):
                self.state, self.message = state, message
        self.log(f"Run {state}: {message}")

    def _main(self):
        self.state = "running"
        self.log(f"Run started: country={self.p['country'] or 'Any'}, website={self.p['website']}, "
                 f"target={self.p['target']}, speed={self.p['speed']}")
        feeder = threading.Thread(target=self._feed, daemon=True)
        feeder.start()
        workers = [threading.Thread(target=self._work, args=(i,), daemon=True) for i in range(self.mode["workers"])]
        for w in workers:
            w.start()
        for w in workers:
            w.join()
        self.stop_flag.set()
        kept = len(self.rows)
        if self.state in ("blocked",):
            return
        if kept >= self.p["target"]:
            self._finish("done", f"Found {kept} leads")
        elif self._today_used() >= self.mode["daily_cap"]:
            self._finish("capped", f"Daily safety limit reached with {kept} leads. Resume tomorrow.")
        elif self.state == "stopping":
            self._finish("stopped", f"Stopped with {kept} leads")
        else:
            self._finish("done", f"Ran out of new profiles to check. {kept} leads found")

    def _enqueue(self, h, niche, src):
        key = h.lower()
        with self.lock:
            if key in self.seen:
                return
            self.seen.add(key)
        if self.p["skip_known"] and key in self.known:
            self.skip("already have")
            return
        self.q.put((h, niche, src))

    def _feed(self):
        try:
            for h in self.p.get("handles", []):
                self._enqueue(h, (self.p["keywords"] or [""])[0], "pasted")
            for h, niche, src in discover.candidates(self.engine, self.p["country"], self.p["keywords"], self.stop_flag.is_set):
                if self.stop_flag.is_set():
                    break
                if src == "blocked":
                    with self.lock:
                        self.state, self.message = "blocked", "Instagram search asked the account to slow down. Wait 30 minutes, then run again."
                    self.log(self.message)
                    self.stop_flag.set()
                    break
                while self.q.qsize() > 60 and not self.stop_flag.is_set():
                    time.sleep(0.5)
                self._enqueue(h, niche, src)
        finally:
            self.feeder_done = True

    def _work(self, slot=0):
        lo, hi = self.mode["delay"]
        while not self.stop_flag.is_set():
            try:
                item = self.q.get(timeout=1)
            except queue.Empty:
                if self.feeder_done and self.active == 0 and self.q.empty():
                    return
                continue
            if len(self.rows) >= self.p["target"] or self._today_used() >= self.mode["daily_cap"]:
                self.stop_flag.set()
                return
            handle, niche, src = item
            with self.lock:
                self.active += 1
            try:
                self._check(handle, niche, src, slot)
            except Exception as e:  # noqa
                self.log(f"{handle}: error {type(e).__name__}: {e}")
            finally:
                with self.lock:
                    self.active -= 1
            time.sleep(random.uniform(lo, hi))

    def _check(self, handle, niche, src, slot=0):
        res = self.engine.profile(handle, slot)
        status = res["status"]
        self._add_used()
        with self.lock:
            self.checked += 1
        if status in (429, 401):
            with self.lock:
                self.state = "blocked"
                self.message = ("Instagram asked this account to slow down or sign in again. "
                                "Open the browser window, make sure you are logged in, wait 30 minutes, then run again.")
            self.log(f"{handle}: HTTP {status}, stopping so the account is not pushed")
            self.stop_flag.set()
            return
        u = P.read_user(res["user"], res["edges"])
        if not u:
            self.skip("profile not found")
            return
        if u["private"]:
            return self.skip("private")
        f = u["followers"]
        if f is not None and (f < self.p["min_followers"] or f > self.p["max_followers"]):
            return self.skip("followers outside range")
        if u["verified"] and self.p["max_followers"] < 1_000_000:
            return self.skip("verified brand")
        tr = P.track_record(u)
        if self.p["only_active"] and tr["active"] == "Inactive":
            return self.skip("inactive account")
        term = niche.lower()
        text_blob = " ".join([u["bio"], u["name"], u["category"]] + [p["caption"][:200] for p in u["posts"][:6]]).lower()
        if self.p["only_business"] and not u["business"] and not any(w in text_blob for w in term.split()):
            return self.skip("not a business")
        # Country first: cheap, and it avoids fetching websites for the wrong place.
        links = u["links"]
        country, basis = P.guess_country(u, links[0] if links else "")
        want = self.p["country"]
        if want and country != want and not (country == "Unknown" and self.p["allow_unknown"]):
            return self.skip("other or unknown country")
        site = W.analyze(links)
        why = fit.skip_reason(u, site)
        if why:
            return self.skip("not a fit: " + why)
        if self.p["website"] == "yes" and site["has_website"] != "Yes":
            return self.skip("has no website")
        if self.p["website"] == "no" and site["has_website"] != "No":
            return self.skip("has a website")
        if country == "Unknown" and site["website"]:
            country, basis = P.guess_country(u, site["website"])
        city = P.city_of(u, country)
        row = {
            "handle": u["handle"], "instagram_link": f"https://www.instagram.com/{u['handle']}/", "country": country,
            "has_website": site["has_website"], "website_detail": site["website_detail"],
            "what_they_do": P.summary(u, country, city, P.niche_of(u, niche)), "website": site["website"],
            "name": u["name"], "bio": " / ".join(x for x in u["bio"].split("\n") if x.strip()),
            "category": u["category"], "followers": u["followers"], "posts": u["post_count"],
            "last_post": tr["last_post"], "last_3_post_dates": tr["last_3_post_dates"],
            "first_visible_post": tr["first_visible_post"],
            "posts_per_month": tr["posts_per_month"], "top_post_likes": tr["top_post_likes"], "active": tr["active"],
            "email": u["email"] or P.find_email(u["bio"]), "phone": u["phone"] or P.find_phone(u["bio"]),
            "country_basis": basis, "found_by": src,
            "niche": P.niche_of(u, niche), "city": city, "followers_text": P.human(u.get("followers")),
            "platform": site.get("platform", ""), "domain": site.get("domain", ""), "site_status": site.get("site_status", ""),
        }
        row["message"] = M.message_for(self.p.get("message", ""), row)
        if self._add_row(row) and self.p.get("expand", True):
            for h in res.get("suggested", []):
                if h.lower() != u["handle"].lower():
                    self._enqueue(h, niche, "similar to @" + u["handle"])

    def _add_row(self, row):
        with self.lock:
            if len(self.rows) >= self.p["target"]:
                return False
            row["#"] = len(self.rows) + 1
            self.rows.append(row)
            new = not self.csv_path.exists()
            with open(self.csv_path, "a", newline="", encoding="utf-8-sig") as fh:
                w = csv.DictWriter(fh, fieldnames=COLUMNS, extrasaction="ignore")
                if new:
                    w.writeheader()
                w.writerow(row)
        self.log(f"+ {row['handle']}  {row['country']}  {row['has_website']}  {row['what_they_do']}")
        return True

    # ---------- export ----------
    def pdf_bytes(self):
        """A readable PDF of the leads. The standard PDF fonts cannot draw emoji or other scripts, so text is reduced
        to what they can show; the CSV keeps everything exactly as found."""
        from io import BytesIO
        from xml.sax.saxutils import escape
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        def t(x):
            x = "" if x is None else str(x)
            x = x.replace("—", ", ").replace("–", ", ")
            return escape(x.encode("latin-1", "ignore").decode("latin-1").strip())

        body = ParagraphStyle("b", fontName="Helvetica", fontSize=7.6, leading=9.4)
        head = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=7.6, leading=9.4, textColor=colors.white)
        title = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=16, leading=20)
        small = ParagraphStyle("s", fontName="Helvetica", fontSize=8.5, leading=11, textColor=colors.HexColor("#555555"))
        with self.lock:
            rows = list(self.rows)
        p = self.p
        bits = [f"Country: {p['country'] or 'Any'}", f"Website: {dict(yes='Has a website', no='No website', either='Either')[p['website']]}"]
        if p["keywords"]:
            bits.append("Kind: " + ", ".join(p["keywords"]))
        bits.append(f"Followers {p['min_followers']} to {p['max_followers']}")
        story = [Paragraph("IG Scout leads", title), Spacer(1, 2 * mm),
                 Paragraph(t(f"{len(rows)} leads, {datetime.now().strftime('%Y-%m-%d %H:%M')}. " + ". ".join(bits)), small),
                 Spacer(1, 5 * mm)]
        cols = ["#", "Handle and Instagram link", "Country", "Website and link", "What they do", "Followers", "Last 3 posts", "Notes"]
        widths = [8, 52, 17, 56, 36, 15, 28, 45]
        data = [[Paragraph(c, head) for c in cols]]
        spans = []
        msg_style = ParagraphStyle("m", fontName="Helvetica-Oblique", fontSize=7.4, leading=9.2, textColor=colors.HexColor("#333333"))
        for r in rows:
            notes = ", ".join(x for x in (
                r.get("category"), f"{r.get('posts')} posts" if r.get("posts") else "",
                f"{r.get('posts_per_month')}/month" if r.get("posts_per_month") else "",
                r.get("email"), r.get("phone")) if x)
            ig = escape(r["instagram_link"])
            handle = f'<b>@{t(r["handle"])}</b><br/><link href="{ig}" color="#0b57d0">{ig}</link>'
            site_url = r.get("website", "")
            site = t(r["website_detail"])
            if site_url:
                site += f'<br/><link href="{escape(site_url)}" color="#0b57d0">{t(site_url)}</link>'
            data.append([Paragraph(str(r["#"]), body), Paragraph(handle, body), Paragraph(t(r["country"]), body),
                         Paragraph(site, body), Paragraph(t(r["what_they_do"]), body), Paragraph(t(r["followers"]), body),
                         Paragraph(t(r.get("last_3_post_dates", "")).replace(" | ", "<br/>"), body), Paragraph(t(notes), body)])
            if r.get("message"):
                data.append([Paragraph("", body), Paragraph("Message: " + t(r["message"]).replace("\n", "<br/>"), msg_style)]
                            + [""] * (len(cols) - 2))
                spans.append(("SPAN", (1, len(data) - 1), (-1, len(data) - 1)))
        tbl = Table(data, colWidths=[w * mm for w in widths], repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
            ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)] + spans))
        story.append(tbl)

        def footer(canvas, doc):
            canvas.saveState()
            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(colors.HexColor("#777777"))
            canvas.drawRightString(landscape(A4)[0] - 12 * mm, 7 * mm, f"IG Scout   page {doc.page}")
            canvas.restoreState()
        bio = BytesIO()
        SimpleDocTemplate(bio, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm,
                          bottomMargin=14 * mm, title="IG Scout leads").build(story, onFirstPage=footer, onLaterPages=footer)
        return bio.getvalue()

    def xlsx_bytes(self):
        from io import BytesIO
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill
        wb = Workbook()
        ws = wb.active
        ws.title = "Leads"
        ws.append(COLUMNS)
        for c in ws[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="1F2937")
        with self.lock:
            rows = list(self.rows)
        for r in rows:
            ws.append([r.get(c, "") for c in COLUMNS])
        widths = {"#": 5, "handle": 22, "instagram_link": 42, "country": 12, "has_website": 12, "website_detail": 38,
                  "what_they_do": 34, "website": 34, "name": 24, "bio": 60}
        for i, c in enumerate(COLUMNS, 1):
            ws.column_dimensions[ws.cell(1, i).column_letter].width = widths.get(c, 14)
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = Alignment(vertical="top", wrap_text=cell.column_letter in ("F", "G", "J"))
        for i in range(2, ws.max_row + 1):
            ws.cell(i, 3).hyperlink = ws.cell(i, 3).value
            ws.cell(i, 3).font = Font(color="0563C1", underline="single")
        ws.freeze_panes = "C2"
        bio = BytesIO()
        wb.save(bio)
        return bio.getvalue()
