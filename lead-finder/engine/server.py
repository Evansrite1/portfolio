"""The app's local server. Listens only on this computer and needs the key the app window was opened with."""
import csv
import io
import os
import re
import secrets
import time
from pathlib import Path

from flask import Flask, Response, jsonify, request

from . import browser, countries, job as joblib, niches
from .version import VERSION

ROOT = Path(__file__).resolve().parent.parent
UI = ROOT / "ui"
HOME = Path(os.environ.get("LLF_HOME") or (os.environ.get("LOCALAPPDATA") or str(Path.home())) + "/LargeLeadFinder")
KEY = os.environ.get("LLF_KEY") or secrets.token_urlsafe(24)
LOG, last_ping, state = [], [0.0], {"job": None, "renderer": None, "skip_emails": set(), "skip_handles": set()}


def log(msg):
    LOG.append("%s  %s" % (time.strftime("%H:%M:%S"), msg))
    del LOG[:-300]


def load_skip(text):
    """Emails and Instagram handles from an earlier spreadsheet, so they are not found again."""
    emails = set(re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text.lower()))
    handles = set()
    for h in re.findall(r"instagram\.com/([A-Za-z0-9._]{2,30})", text, re.I):
        handles.add(h.lower())
    try:
        for row in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
            for k, v in row.items():
                if k and k.strip().lower() in ("handle", "instagram", "instagram handle") and v:
                    h = joblib.handle_of(v)
                    if h:
                        handles.add(h)
    except Exception:
        pass
    return emails, handles


def create_app():
    app = Flask(__name__, static_folder=None)

    @app.before_request
    def gate():
        host = (request.host or "").split(":")[0].lower()
        if host not in ("127.0.0.1", "localhost"):
            return Response("local only", 403)
        if request.path.startswith("/api/"):
            if request.headers.get("X-LLF-Key") != KEY:
                return jsonify(error="Open this from the Large Lead Finder app."), 403
        elif request.path in ("/", "/index.html") and request.args.get("k") != KEY:
            return Response("Open this from the Large Lead Finder app on your computer.", 403)

    @app.get("/")
    def index():
        html = (UI / "index.html").read_text(encoding="utf-8").replace("__KEY__", KEY).replace("__VERSION__", VERSION)
        return Response(html, mimetype="text/html", headers={"Cache-Control": "no-store"})

    @app.get("/<path:p>")
    def assets(p):
        full = (UI / p).resolve()
        if UI.resolve() not in full.parents or not full.is_file():
            return ("", 404)
        mt = {"png": "image/png", "ico": "image/x-icon"}.get(full.suffix[1:], "application/octet-stream")
        return Response(full.read_bytes(), mimetype=mt, headers={"Cache-Control": "max-age=3600"})

    @app.get("/api/info")
    def info():
        last_ping[0] = time.time()
        return jsonify(version=VERSION, niches=niches.catalog(), countries=countries.COUNTRIES, columns={"essential": joblib.ESSENTIAL, "extra": joblib.EXTRA, "names": joblib.COLUMN_NAMES},
                       browser=browser.installed(), modes=list(joblib.MODES))

    @app.get("/api/state")
    def get_state():
        last_ping[0] = time.time()
        j = state["job"]
        return jsonify(job=j.snapshot() if j else None, rows=(j.rows[int(request.args.get("since", 0)):] if j else []), log=LOG[int(request.args.get("log", 0)):], log_total=len(LOG),
                       skip_loaded=[len(state["skip_emails"]), len(state["skip_handles"])])

    @app.post("/api/skip")
    def skip():
        text = (request.json or {}).get("text", "")
        e, h = load_skip(text)
        state["skip_emails"] |= e
        state["skip_handles"] |= h
        return jsonify(emails=len(state["skip_emails"]), handles=len(state["skip_handles"]))

    @app.post("/api/skip/clear")
    def skip_clear():
        state["skip_emails"], state["skip_handles"] = set(), set()
        return jsonify(ok=True)

    @app.post("/api/run")
    def run():
        j = state["job"]
        if j and j.state in ("running", "starting", "stopping"):
            return jsonify(error="A search is already running."), 409
        d = request.json or {}
        if d.get("mode") not in joblib.MODES:
            return jsonify(error="Choose what the leads must have."), 400
        if not (d.get("niches") or d.get("custom")):
            return jsonify(error="Choose at least one niche."), 400
        if state["renderer"] is None and browser.installed():
            state["renderer"] = browser.Renderer()
        state["job"] = joblib.Job(d, log, state["skip_emails"], state["skip_handles"], state["renderer"] if d.get("use_browser", True) else None)
        state["job"].start()
        log("Search started")
        return jsonify(ok=True)

    @app.post("/api/stop")
    def stop():
        if state["job"]:
            state["job"].stop()
        return jsonify(ok=True)

    @app.get("/api/download/<kind>")
    def download(kind):
        j = state["job"]
        if not j or not j.rows:
            return jsonify(error="Nothing to download yet."), 404
        extras = [x for x in (request.args.get("extras") or "").split(",") if x] if request.args.get("extras") is not None else None
        if kind == "pdf":
            return Response(j.pdf_bytes(extras), mimetype="application/pdf", headers={"Content-Disposition": "attachment; filename=leads-%s.pdf" % time.strftime("%Y-%m-%d-%H%M")})
        body = {"all": lambda: j.csv_all(extras), "mailer": j.csv_for_mailer, "instagram": j.csv_for_instagram}.get(kind)
        if not body:
            return jsonify(error="unknown"), 404
        name = {"all": "leads", "mailer": "email-leads-for-outreach-mailer", "instagram": "instagram-leads-for-ig-outreach"}[kind]
        return Response(body(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=%s-%s.csv" % (name, time.strftime("%Y-%m-%d-%H%M"))})

    @app.post("/api/browser/install")
    def install_browser():
        ok = browser.install(log)
        return jsonify(ok=ok)

    return app


def make_server(host="127.0.0.1", port=8797):
    from werkzeug.serving import make_server as ms
    HOME.mkdir(parents=True, exist_ok=True)
    return ms(host, port, create_app(), threaded=True)
