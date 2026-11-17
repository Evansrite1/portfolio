"""The app's local web server. It only listens on this computer. Every request needs the key the app window was
opened with, so a web page open in another browser tab cannot control the app."""
import csv
import datetime
import io
import os
import re
import secrets
import time

from flask import Flask, Response, jsonify, request

from . import config, db, inbox, leads, mailer, scheduler, secrets_store, stats, templates, tracking
from .version import VERSION

UI = os.path.join(config.ROOT, "ui")
engine = scheduler.Engine()
KEY = os.environ.get("MAILER_KEY") or secrets.token_urlsafe(24)
last_ping = [0.0]


def readiness():
    """What is still missing before sending can start."""
    s = {"sender_name": db.get_setting("sender_name", ""), "templates": db.get_setting("templates", {})}
    todo = []
    if not db.one("SELECT 1 FROM accounts WHERE enabled=1"):
        todo.append("Connect a Gmail account.")
    todo += templates.problems(s)
    if not db.one("SELECT 1 FROM leads WHERE status='new'"):
        todo.append("Add some leads to email.")
    return todo


def _already_sent(text, email_col):
    """Addresses in an uploaded table that were emailed before, with the date. Shown before importing."""
    if email_col is None:
        return []
    out = []
    _h, rows = leads.parse_table(text)
    for r in rows:
        e = leads.extract_email(r[email_col]) if email_col < len(r) else None
        t = leads.sent_info(e) if e else None
        if t:
            out.append({"email": e, "when": t})
        if len(out) >= 50:
            break
    return out


def create_app():
    app = Flask(__name__, static_folder=None)

    def guarded():
        if request.headers.get("X-Mailer-Key") != KEY:
            return jsonify(error="Open this from the Outreach Mailer app."), 403
        host = (request.host or "").split(":")[0].lower()
        if host not in ("127.0.0.1", "localhost"):
            return jsonify(error="local only"), 403
        return None

    @app.before_request
    def gate():
        if request.path.startswith("/api/"):
            bad = guarded()
            if bad:
                return bad
        elif request.path in ("/", "/index.html"):
            if request.args.get("k") != KEY:
                return Response("Open this from the Outreach Mailer app on your computer.", 403)

    @app.get("/")
    def index():
        with open(os.path.join(UI, "index.html"), encoding="utf-8") as f:
            html = f.read().replace("__KEY__", KEY).replace("__VERSION__", VERSION)
        return Response(html, mimetype="text/html", headers={"Cache-Control": "no-store"})

    @app.get("/<path:p>")
    def assets(p):
        full = os.path.normpath(os.path.join(UI, p))
        if not full.startswith(UI) or not os.path.isfile(full):
            return ("", 404)
        with open(full, "rb") as f:
            data = f.read()
        mt = {"ico": "image/x-icon", "png": "image/png", "svg": "image/svg+xml", "css": "text/css", "js": "text/javascript"}.get(full.rsplit(".", 1)[-1], "application/octet-stream")
        return Response(data, mimetype=mt, headers={"Cache-Control": "max-age=3600"})

    @app.get("/api/ping")
    def ping():
        last_ping[0] = time.time()
        return jsonify(ok=True)

    # ---------- the whole screen in one call ----------
    @app.get("/api/state")
    def state():
        last_ping[0] = time.time()
        now = db.now()
        accts = []
        for a in db.q("SELECT * FROM accounts ORDER BY id"):
            accts.append({"id": a["id"], "email": a["email"], "display_name": a["display_name"], "enabled": bool(a["enabled"]),
                          "daily_cap": a["daily_cap"], "daily_min": a["daily_min"], "skip_warmup": bool(a["skip_warmup"]),
                          "paused": (a["paused_until"] or 0) > now, "paused_reason": a["paused_reason"] if (a["paused_until"] or 0) > now else "",
                          "allowed_today": scheduler.allowed_today(a), "sent_today": scheduler.sent_today(a["id"]),
                          **{k: v for k, v in stats.totals(0, a["id"]).items() if k in ("sent", "replies", "bounces", "opened")}})
        week = stats.totals(now - 7 * 86400)
        return jsonify(version=VERSION, sending=engine.running, in_window=scheduler.in_window(),
                       window=db.get_setting("send_window", list(config.SEND_WINDOW)),
                       accounts=accts, todo=readiness(), leads=stats.lead_counts(),
                       all=stats.totals(0), today=stats.totals(stats._midnight(0)), week=week,
                       series=stats.series(14), lists=stats.by_list(), activity=stats.activity(40),
                       log=engine.log[-25:], tracking=bool(db.get_setting("track_opens", True)),
                       tracker_configured=db.get_setting("tracker_configured", True))

    # ---------- the mailbox: read, reply, delete ----------
    def acct_of(aid):
        a = db.one("SELECT * FROM accounts WHERE id=?", (int(aid or 0),))
        if not a:
            raise LookupError("Choose a mailbox first.")
        return a

    def mail_error(e):
        return jsonify(error=mailer.friendly_error(e)), (404 if isinstance(e, LookupError) else 502)

    @app.get("/api/mail/folders")
    def mail_folders():
        try:
            return jsonify(inbox.folders(acct_of(request.args.get("account"))))
        except Exception as e:
            return mail_error(e)

    @app.get("/api/mail/list")
    def mail_list():
        try:
            a = acct_of(request.args.get("account"))
            return jsonify(inbox.list_messages(a, request.args.get("folder") or "INBOX", int(request.args.get("page", 0)), 30, (request.args.get("q") or "").strip()))
        except Exception as e:
            return mail_error(e)

    @app.get("/api/mail/message")
    def mail_message():
        try:
            a = acct_of(request.args.get("account"))
            return jsonify(inbox.get_message(a, request.args.get("folder") or "INBOX", int(request.args.get("uid"))))
        except Exception as e:
            return mail_error(e)

    @app.get("/api/mail/attachment")
    def mail_attachment():
        try:
            a = acct_of(request.args.get("account"))
            name, ctype, data = inbox.attachment(a, request.args.get("folder") or "INBOX", int(request.args.get("uid")), int(request.args.get("i", 0)))
        except Exception as e:
            return mail_error(e)
        safe = "".join(ch for ch in name if ch not in '\\/:*?"<>|\r\n')[:120] or "attachment"
        return Response(data, mimetype="application/octet-stream", headers={"Content-Disposition": "attachment; filename=\"%s\"" % safe, "X-Content-Type-Options": "nosniff"})

    @app.post("/api/mail/action")
    def mail_action():
        d = request.json or {}
        try:
            a = acct_of(d.get("account"))
            inbox.act(a, d.get("folder") or "INBOX", int(d.get("uid")), str(d.get("action")))
            return jsonify(ok=True)
        except Exception as e:
            return mail_error(e)

    @app.post("/api/mail/send")
    def mail_send():
        d = request.json or {}
        try:
            a = acct_of(d.get("account"))
            to = [x for x in re.split(r"[,;\s]+", str(d.get("to") or "")) if x]
            if not to or not all(leads.EMAIL_RE.fullmatch(x) for x in to):
                return jsonify(error="Type a valid email address in To."), 400
            msg = mailer.build_message(a, ", ".join(to), str(d.get("subject") or "(no subject)")[:300], str(d.get("body") or ""),
                                       in_reply_to=d.get("in_reply_to") or None, references=d.get("references") or d.get("in_reply_to") or None)
            if "List-Unsubscribe" in msg:
                del msg["List-Unsubscribe"]        # a personal message, not a campaign email
            mailer.smtp_send(a, msg)
            return jsonify(ok=True)
        except Exception as e:
            return mail_error(e)

    @app.get("/api/update")
    def update():
        """Is a newer version on the website? Only the version number is fetched."""
        import requests
        try:
            j = requests.get("https://evansademilua.vercel.app/tools/mailer/version.json", timeout=8).json()
            newer = tuple(int(x) for x in str(j["version"]).split(".")) > tuple(int(x) for x in VERSION.split("."))
            return jsonify(newer=newer, version=j["version"], notes=j.get("notes", []), page="https://evansademilua.vercel.app/tools/mailer/")
        except Exception:
            return jsonify(newer=False)

    # ---------- sending on and off ----------
    @app.post("/api/engine/<action>")
    def engine_ctl(action):
        if action == "start":
            todo = readiness()
            if todo:
                return jsonify(error=todo[0]), 400
            engine.start()
        elif action == "stop":
            engine.stop()
        else:
            return jsonify(error="unknown"), 400
        return jsonify(running=engine.running)

    # ---------- mailboxes ----------
    @app.post("/api/accounts")
    def add_account():
        d = request.json or {}
        em = (d.get("email") or "").strip().lower()
        pw = (d.get("password") or "").replace(" ", "")
        provider = d.get("provider") or "gmail"
        if not leads.EMAIL_RE.fullmatch(em) or not pw:
            return jsonify(error="Type your email address and the app password."), 400
        if db.one("SELECT COUNT(*) n FROM accounts")["n"] >= config.MAX_ACCOUNTS and not db.one("SELECT 1 FROM accounts WHERE email=?", (em,)):
            return jsonify(error=f"You can connect up to {config.MAX_ACCOUNTS} mailboxes."), 400
        p = dict(config.PRESETS.get(provider) or {})
        for k in ("smtp_host", "smtp_port", "imap_host", "imap_port"):
            if d.get(k):
                p[k] = d[k]
        if not p.get("smtp_host") or not p.get("imap_host"):
            return jsonify(error="Type the mail server names."), 400
        cap = max(5, min(config.HARD_DAILY_CAP, int(d.get("daily_cap") or config.DEFAULT_DAILY_CAP)))
        old = secrets_store.get_secret(em)
        secrets_store.set_secret(em, pw)
        probe = {"email": em, "username": em, "smtp_host": p["smtp_host"], "smtp_port": int(p.get("smtp_port") or 587),
                 "imap_host": p["imap_host"], "imap_port": int(p.get("imap_port") or 993)}
        res = mailer.test_connection(probe)
        if not (res["smtp"] and res["imap"]):
            if old is None:
                secrets_store.delete_secret(em)
            else:
                secrets_store.set_secret(em, old)
            return jsonify(error=res["error"] or "Could not sign in.", smtp=res["smtp"], imap=res["imap"]), 400
        aid = db.run("""INSERT OR REPLACE INTO accounts(email,display_name,smtp_host,smtp_port,imap_host,imap_port,username,daily_min,daily_cap,
                        skip_warmup,auto_push,warmup_start,enabled,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (em, d.get("display_name") or db.get_setting("sender_name", ""), probe["smtp_host"], probe["smtp_port"], probe["imap_host"],
                      probe["imap_port"], em, max(5, cap - 10), cap, 1 if d.get("skip_warmup") else 0, 0, db.now(), 1, db.now()))
        try:
            mailer.sync_account(db.one("SELECT * FROM accounts WHERE id=?", (aid,)))     # marks "now" as the starting point
        except Exception:
            pass
        return jsonify(ok=True, id=aid)

    @app.delete("/api/accounts/<int:aid>")
    def del_account(aid):
        a = db.one("SELECT email FROM accounts WHERE id=?", (aid,))
        if a:
            secrets_store.delete_secret(a["email"])
            db.run("UPDATE leads SET account_id=NULL WHERE account_id=? AND status='new'", (aid,))
            db.run("DELETE FROM accounts WHERE id=?", (aid,))
        return jsonify(ok=True)

    @app.post("/api/accounts/<int:aid>/update")
    def update_acct(aid):
        d = request.json or {}
        cap = max(5, min(config.HARD_DAILY_CAP, int(d.get("daily_cap") or config.DEFAULT_DAILY_CAP)))
        db.run("UPDATE accounts SET daily_cap=?, daily_min=?, skip_warmup=? WHERE id=?",
               (cap, max(5, cap - 10), 1 if d.get("skip_warmup") else 0, aid))
        return jsonify(ok=True)

    @app.post("/api/accounts/<int:aid>/resume")
    def resume_acct(aid):
        db.run("UPDATE accounts SET paused_until=0, paused_reason='', enabled=1 WHERE id=?", (aid,))
        return jsonify(ok=True)

    @app.post("/api/accounts/<int:aid>/sync")
    def sync_acct(aid):
        a = db.one("SELECT * FROM accounts WHERE id=?", (aid,))
        if not a:
            return jsonify(error="no such mailbox"), 404
        try:
            r = mailer.sync_account(a)
            tracking.pull_opens()
            return jsonify(r)
        except Exception as e:
            return jsonify(error=mailer.friendly_error(e)), 502

    # ---------- leads ----------
    @app.get("/api/leads")
    def leads_list():
        st = request.args.get("status")
        qy = (request.args.get("q") or "").strip().lower()
        src = request.args.get("list")
        where, args = [], []
        if st:
            where.append("l.status=?"); args.append(st)
        if src is not None and src != "":
            where.append("l.source=?"); args.append("" if src == "__hand__" else src)
        if qy:
            where.append("(l.email LIKE ? OR LOWER(l.biz) LIKE ? OR LOWER(l.first) LIKE ?)"); args += [f"%{qy}%"] * 3
        w = ("WHERE " + " AND ".join(where)) if where else ""
        rows = db.q(f"""SELECT l.id,l.num,l.account_id,(SELECT email FROM accounts a WHERE a.id=l.account_id) mailbox,l.email,l.first,l.biz,l.city,l.website,l.status,l.source,
                        (SELECT MAX(ts) FROM messages m WHERE m.lead_id=l.id AND m.direction='out') last_sent,
                        (SELECT COUNT(*) FROM messages m WHERE m.lead_id=l.id AND m.direction='out') emails,
                        EXISTS(SELECT 1 FROM events e WHERE e.lead_id=l.id AND e.type='open') opened
                        FROM leads l {w} ORDER BY COALESCE(l.num, l.id) DESC LIMIT 500""", tuple(args))
        return jsonify(rows)

    @app.post("/api/leads/import")
    def leads_import():
        d = request.json or {}
        text = d.get("text") or ""
        if not text.strip():
            return jsonify(error="The file is empty."), 400
        res = leads.import_csv(text, (d.get("name") or "Imported list")[:60])
        return jsonify(res)

    @app.post("/api/leads/analyze")
    def leads_analyze():
        d = request.json or {}
        text = d.get("text") or ""
        if d.get("pdf_b64"):
            import base64
            from . import docs
            try:
                text = docs.pdf_to_csv(base64.b64decode(d["pdf_b64"]))
            except Exception as e:
                return jsonify(error="That PDF could not be read: " + str(e)[:120]), 400
            if text.count("\n") < 2:
                return jsonify(error="No email addresses were found in that PDF. If it is a scanned picture, export it as text or CSV first."), 400
        if not text.strip():
            return jsonify(error="The file is empty."), 400
        a = leads.analyze(text)
        if not a["headers"]:
            return jsonify(error="No rows were found in that file."), 400
        a["problems"] = leads.check_rows(text, a["guess"].get("email"))
        a["text"] = text            # the table the screen should import (a PDF becomes one)
        a["already_sent"] = _already_sent(text, a["guess"].get("email"))
        return jsonify(a)

    @app.post("/api/leads/check")
    def leads_check():
        d = request.json or {}
        return jsonify(problems=leads.check_rows(d.get("text") or "", d.get("email_col")))

    @app.post("/api/leads/import_mapped")
    def leads_import_mapped():
        d = request.json or {}
        mp = {k: (int(v) if v not in (None, "", -1) else None) for k, v in (d.get("mapping") or {}).items()}
        res = leads.import_mapped(d.get("text") or "", mp, (d.get("name") or "Imported list")[:60], d.get("fixes") or {}, d.get("skip") or [])
        return jsonify(res)

    @app.post("/api/leads/<int:lid>/update")
    def leads_update(lid):
        res = leads.update_lead(lid, request.json or {})
        if res != "ok":
            return jsonify(error={"invalid": "That is not a valid email address.", "duplicate": "Another lead already has that address.",
                                  "locked": "This lead was already emailed, so it cannot be changed.", "missing": "No such lead."}.get(res, res)), 400
        return jsonify(ok=True)

    @app.get("/api/leads/suggest")
    def leads_suggest():
        return jsonify(suggestion=leads.suggest_fix(request.args.get("email", "")))

    @app.post("/api/assign")
    def assign():
        """Set leads aside for a mailbox. rules: [{account, from, to}] by lead number, or split: {accounts: [ids], block: 10}."""
        d = request.json or {}
        n = 0
        if d.get("clear"):
            db.run("UPDATE leads SET account_id=NULL WHERE status='new'")
        for r in d.get("rules") or []:
            lo, hi = int(r.get("from") or 0), int(r.get("to") or 0)
            if lo < 1 or hi < lo or not db.one("SELECT 1 FROM accounts WHERE id=?", (int(r.get("account") or 0),)):
                return jsonify(error="Check the numbers: the first lead must be 1 or more and the last must not be smaller."), 400
            cur = db.run("UPDATE leads SET account_id=? WHERE status='new' AND num>=? AND num<=?", (int(r["account"]), lo, hi))
        sp = d.get("split")
        if sp:
            ids = [int(x) for x in sp.get("accounts") or [] if db.one("SELECT 1 FROM accounts WHERE id=?", (int(x),))]
            block = max(1, min(1000, int(sp.get("block") or 10)))
            if not ids:
                return jsonify(error="Choose at least one mailbox."), 400
            rows = db.q("SELECT id FROM leads WHERE status='new' ORDER BY COALESCE(num, id)")
            for i, r in enumerate(rows):
                db.run("UPDATE leads SET account_id=? WHERE id=?", (ids[(i // block) % len(ids)], r["id"]))
        counts = db.q("SELECT account_id, COUNT(*) n, MIN(num) lo, MAX(num) hi FROM leads WHERE status='new' AND account_id IS NOT NULL GROUP BY account_id")
        return jsonify(ok=True, counts=counts)

    @app.post("/api/leads/add")
    def leads_add():
        d = request.json or {}
        res = leads.add_lead(d.get("email"), d.get("first", ""), d.get("biz", ""), d.get("city", ""), d.get("website", ""), "")
        if res != "added":
            return jsonify(error={"invalid": "That is not a valid email address.", "duplicate": "Already in your list.",
                                  "suppressed": "This person asked not to be emailed."}.get(res, res)), 400
        return jsonify(ok=True)

    @app.post("/api/leads/delete")
    def leads_delete():
        d = request.json or {}
        st = d.get("status")
        if st not in ("new",):
            ids = [int(i) for i in d.get("ids", [])]
            for i in ids:
                db.run("DELETE FROM leads WHERE id=? AND status='new'", (i,))
            return jsonify(ok=True, removed=len(ids))
        n = db.one("SELECT COUNT(*) n FROM leads WHERE status='new'")["n"]
        db.run("DELETE FROM leads WHERE status='new'")
        return jsonify(ok=True, removed=n)

    @app.get("/api/export.csv")
    def export():
        rows = db.q("""SELECT l.email,l.first,l.biz,l.city,l.website,l.source list_name,l.status,
                       (SELECT COUNT(*) FROM messages m WHERE m.lead_id=l.id AND m.direction='out') emails_sent,
                       (SELECT datetime(MIN(m.ts),'unixepoch','localtime') FROM messages m WHERE m.lead_id=l.id AND m.direction='out') first_sent,
                       EXISTS(SELECT 1 FROM events e WHERE e.lead_id=l.id AND e.type='open') opened,
                       (SELECT datetime(MIN(m.ts),'unixepoch','localtime') FROM messages m WHERE m.lead_id=l.id AND m.direction='in' AND m.kind='reply') replied_at
                       FROM leads l ORDER BY l.id""")
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["email", "first", "business", "city", "website", "list", "status", "emails_sent", "first_sent", "opened", "replied_at"])
        for r in rows:
            w.writerow([r["email"], r["first"], r["biz"], r["city"], r["website"], r["list_name"], r["status"], r["emails_sent"],
                        r["first_sent"] or "", "yes" if r["opened"] else "", r["replied_at"] or ""])
        return Response("﻿" + buf.getvalue(), mimetype="text/csv",
                        headers={"Content-Disposition": "attachment; filename=outreach-results-%s.csv" % datetime.date.today().isoformat()})

    # ---------- the message ----------
    @app.get("/api/settings")
    def get_settings():
        t = db.get_setting("templates", {}) or {}
        return jsonify(sender_name=db.get_setting("sender_name", ""), postal_address=db.get_setting("postal_address", ""),
                       templates={k: t.get(k, templates.DEFAULTS[k]) for k in templates.DEFAULTS},
                       send_window=db.get_setting("send_window", list(config.SEND_WINDOW)),
                       followup_after_days=db.get_setting("followup_after_days", config.FOLLOWUP_AFTER_DAYS),
                       max_followups=db.get_setting("max_followups", config.MAX_FOLLOWUPS),
                       track_opens=bool(db.get_setting("track_opens", True)),
                       tracker_url=db.get_setting("tracker_url", config.DEFAULT_TRACKER),
                       fields=sorted(templates.known_fields()))

    @app.post("/api/settings")
    def set_settings():
        d = request.json or {}
        if "sender_name" in d:
            db.set_setting("sender_name", str(d["sender_name"])[:80])
        if "postal_address" in d:
            db.set_setting("postal_address", str(d["postal_address"])[:200])
        if "templates" in d:
            db.set_setting("templates", {k: str(v)[:5000] for k, v in d["templates"].items() if k in templates.DEFAULTS})
        if "send_window" in d:
            lo, hi = [int(x) for x in d["send_window"]][:2]
            if not (0 <= lo < hi <= 24):
                return jsonify(error="The start hour must be before the end hour."), 400
            db.set_setting("send_window", [lo, hi])
        if "followup_after_days" in d:
            db.set_setting("followup_after_days", max(1, min(60, int(d["followup_after_days"]))))
        if "max_followups" in d:
            db.set_setting("max_followups", max(0, min(3, int(d["max_followups"]))))
        if "track_opens" in d:
            db.set_setting("track_opens", bool(d["track_opens"]))
        if "tracker_url" in d:
            u = str(d["tracker_url"]).strip() or config.DEFAULT_TRACKER
            if not u.startswith("https://"):
                return jsonify(error="The tracker address must start with https://"), 400
            db.set_setting("tracker_url", u)
        return jsonify(ok=True)

    @app.post("/api/preview")
    def preview():
        d = request.json or {}
        kind = "follow" if d.get("kind") == "follow" else "first"
        lead = db.one("SELECT * FROM leads ORDER BY id LIMIT 1") or {"email": "sample@example.com", "first": "Sam", "biz": "Sample Bakery", "city": "Austin", "website": "samplebakery.com"}
        s = scheduler.settings_blob()
        if d.get("templates"):
            s["templates"] = {k: str(v) for k, v in d["templates"].items() if k in templates.DEFAULTS}
        if d.get("sender_name") is not None:
            s["sender_name"] = d["sender_name"]
        if d.get("postal_address") is not None:
            s["postal_address"] = d["postal_address"]
        try:
            subj, body = templates.render(kind, lead, s, orig_subject="a quick question")
        except ValueError as e:
            return jsonify(error=str(e)), 400
        return jsonify(subject=subj, body=body, lead=lead.get("email"))

    @app.post("/api/test_send")
    def test_send():
        """Send the first email to your own address, so you see exactly what people get. Not counted in the stats."""
        d = request.json or {}
        to = leads.clean_email(d.get("to") or "")
        acct = db.one("SELECT * FROM accounts WHERE enabled=1 ORDER BY id LIMIT 1")
        if not to or not acct:
            return jsonify(error="Connect a mailbox and type a valid email address."), 400
        lead = {"email": to, "first": "Sam", "biz": "Sample Business", "city": "Your City", "website": "example.com"}
        try:
            subj, body = templates.render("first", lead, scheduler.settings_blob())
            msg = mailer.build_message(acct, to, "[Test] " + subj, body)
            mailer.smtp_send(acct, msg)
        except Exception as e:
            return jsonify(error=mailer.friendly_error(e)), 502
        return jsonify(ok=True)

    return app


def make_server(host="127.0.0.1", port=8791):
    from werkzeug.serving import make_server as ms
    engine.boot()
    return ms(host, port, create_app(), threaded=True)
