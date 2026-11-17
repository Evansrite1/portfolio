"""IG Outreach: find Instagram businesses for the service you offer, and save them as a leads sheet.

Two ways to start it:
  run.bat          the console shows the live log, the screen opens in your browser
  IG Scout.exe     no console, the screen opens in its own window (see launcher.py)
"""
import io
import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory, abort

from core import outbox, services, updater
from core.accounts import Accounts
from core.sender import Sender
from core.countries import country_names
from core.engine import Engine
from core.job import Job, load_known
from core.version import VERSION

ROOT = Path(__file__).parent                                   # where the code and screen files are
HOME = Path(os.environ.get("IGSCOUT_HOME") or ROOT)            # where the person's own data lives
OUT = Path(os.environ.get("IGSCOUT_OUT") or HOME / "output")
PORT = int(os.environ.get("IGSCOUT_PORT") or 5057)
FROZEN = bool(os.environ.get("IGSCOUT_EXE"))
KNOWN_DIRS = [Path(os.environ.get("IGSCOUT_KNOWN") or HOME / "already-have")] + ([ROOT.parent / "outreach"] if not FROZEN and (ROOT.parent / "outreach").is_dir() else [])
LOG, LOG_LOCK = [], threading.Lock()
last_ping = [0.0]                                              # the screen pings while it is open
restart_hook = None                                            # set by the launcher so an update can restart the app

app = Flask(__name__, static_folder=None)
import logging
logging.getLogger("werkzeug").setLevel(logging.ERROR)
if getattr(sys.stdout, "reconfigure", None):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def log(msg):
    line = f"{time.strftime('%H:%M:%S')}  {msg}"
    if not FROZEN:
        try:
            print(line, flush=True)
        except Exception:
            pass
    with LOG_LOCK:
        LOG.append(line)
        del LOG[:-400]
    try:
        with open(HOME / "igscout.log", "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass


accounts = Accounts(HOME, log)
engine = accounts.engine("a1")                              # the first account, also used for finding leads and for the old screens
job = None
HOME.mkdir(parents=True, exist_ok=True)
outbox.open_db(HOME / "outreach.db")
sender = Sender(accounts, lambda: read_settings().get("send"), log)
known_cache = {"at": 0, "set": set()}


def known():
    if time.time() - known_cache["at"] > 300:
        s = set()
        for d in KNOWN_DIRS:
            s |= load_known(str(d))
        known_cache["set"], known_cache["at"] = s, time.time()
        log(f"{len(s)} handles you already have will be skipped")
    return known_cache["set"]


def clean_handles(text):
    out = []
    for h in text.replace(",", " ").split():
        h = h.strip().lstrip("@")
        if "instagram.com/" in h:
            h = h.split("instagram.com/")[-1]
        h = h.split("/")[0].split("?")[0].strip()
        if h:
            out.append(h)
    return out


@app.before_request
def only_our_own_screen():
    """Another web page open in the browser must not be able to start a run, read results or change settings.
    Requests must be for 127.0.0.1 (stops DNS rebinding), and anything that changes something must carry a header
    that a web page on another site cannot add without the browser asking first."""
    host = (request.host or "").split(":")[0].lower()
    if host not in ("127.0.0.1", "localhost"):
        abort(403)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("Origin")
        if origin and origin not in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"):
            abort(403)
        if request.headers.get("X-IGLF") != "1":
            abort(403)


@app.get("/")
def index():
    return send_from_directory(ROOT / "ui", "index.html")


@app.get("/favicon.ico")
def favicon():
    return send_from_directory(ROOT / "ui", "icon.ico")


@app.get("/api/services")
def service_list():
    return jsonify(services.listing())


@app.get("/api/countries")
def countries():
    return jsonify(country_names())


SETTINGS_FILE = HOME / "settings.json"


def read_settings():
    try:
        import json
        return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


sender.boot()                                          # replies are checked even before sending is switched on


@app.get("/api/settings")
def get_settings():
    return jsonify(read_settings())


@app.post("/api/settings")
def save_settings():
    import json
    cur = read_settings()
    d = request.get_json(force=True) or {}
    if "message" in d:                                     # older screens: one message for the website service
        cur.setdefault("templates", {})["website"] = str(d["message"])[:4000]
    if isinstance(d.get("templates"), dict):
        t = cur.setdefault("templates", {})
        for k, v in d["templates"].items():
            if k in services.SERVICES:
                t[k] = str(v)[:4000]
    if isinstance(d.get("last"), dict):                    # the service and audience used last time, so the screen reopens as it was
        cur["last"] = {str(k)[:30]: (v if isinstance(v, (bool, int, float)) else str(v)[:300]) for k, v in list(d["last"].items())[:30]}
    HOME.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(cur), encoding="utf-8")
    return jsonify(ok=True)


# ---------------------------------------------------------------- outreach: messages, sending, replies, statistics
@app.get("/api/outbox")
def outbox_list():
    return jsonify(leads=outbox.list_leads(request.args.get("status") or None, (request.args.get("q") or "").strip() or None),
                   sender=sender.status(), counts=outbox.stats()["by_status"])


@app.post("/api/outbox/message")
def outbox_message():
    d = request.get_json(force=True) or {}
    outbox.set_message(str(d.get("handle", "")).lower(), d.get("message", ""))
    return jsonify(ok=True)


@app.post("/api/outbox/status")
def outbox_status():
    d = request.get_json(force=True) or {}
    outbox.set_status(str(d.get("handle", "")).lower(), d.get("status"))
    return jsonify(ok=True)


@app.post("/api/outbox/delete")
def outbox_delete():
    d = request.get_json(force=True) or {}
    outbox.delete(str(d.get("handle", "")).lower())
    return jsonify(ok=True)


@app.post("/api/outbox/add")
def outbox_add():
    d = request.get_json(force=True) or {}
    n = outbox.add_handles(clean_handles(d.get("handles") or ""), str(d.get("message") or "")[:2000])
    return jsonify(ok=True, added=n)


@app.get("/api/outbox.csv")
def outbox_csv():
    import csv
    rows = outbox.q("SELECT handle,link,name,country,what,message,status,sent_at,replied_at,error FROM leads ORDER BY created")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["handle", "link", "name", "country", "what_they_do", "message", "status", "sent_at", "replied_at", "error"])
    fmt = lambda t: time.strftime("%Y-%m-%d %H:%M", time.localtime(t)) if t else ""
    for r in rows:
        w.writerow([r["handle"], r["link"], r["name"], r["country"], r["what"], r["message"], r["status"], fmt(r["sent_at"]), fmt(r["replied_at"]), r["error"]])
    return send_file(io.BytesIO(("\ufeff" + buf.getvalue()).encode("utf-8")), mimetype="text/csv", as_attachment=True, download_name="outreach-results.csv")


@app.post("/api/send/start")
def send_start():
    try:
        sender.start()
    except Exception as e:  # noqa
        return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True, sender=sender.status())


@app.post("/api/send/stop")
def send_stop():
    sender.stop("Stopped")
    return jsonify(ok=True, sender=sender.status())


@app.get("/api/send/status")
def send_status():
    return jsonify(sender.status())


@app.get("/api/send/settings")
def send_settings_get():
    return jsonify(sender.cfg())


@app.post("/api/send/settings")
def send_settings_set():
    import json
    d = request.get_json(force=True) or {}
    cur = read_settings()
    s = cur.setdefault("send", {})
    for k in ("daily_cap", "gap_min", "gap_max", "from_hour", "to_hour", "reply_check_minutes"):
        if k in d:
            try:
                s[k] = int(d[k])
            except Exception:
                pass
    if not (0 <= int(s.get("from_hour", 9)) < int(s.get("to_hour", 20)) <= 24):
        return jsonify(ok=False, error="The start hour must be before the end hour."), 400
    SETTINGS_FILE.write_text(json.dumps(cur), encoding="utf-8")
    return jsonify(ok=True, settings=sender.cfg())


@app.post("/api/replies/check")
def replies_check():
    if not engine.status()["logged_in"]:
        return jsonify(ok=False, error="Log in to Instagram first"), 400
    def go():
        sender.check_replies()
    threading.Thread(target=go, daemon=True).start()
    return jsonify(ok=True)


@app.get("/api/stats")
def stats():
    acc = request.args.get("account") or None
    out = outbox.stats(14, acc)
    out["accounts"] = outbox.per_account({a["id"]: a["label"] for a in accounts.items})
    return jsonify(out)


# ---------------------------------------------------------------- Instagram accounts (up to 10)
@app.get("/api/ig/accounts")
def ig_accounts():
    return jsonify(sender.status())


@app.post("/api/ig/accounts")
def ig_account_add():
    d = request.get_json(force=True) or {}
    try:
        a = accounts.add(d.get("label"))
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True, account=a)


@app.post("/api/ig/accounts/<aid>")
def ig_account_update(aid):
    d = request.get_json(force=True) or {}
    try:
        accounts.update(aid, **{k: d[k] for k in ("label", "enabled", "daily") if k in d})
    except KeyError:
        return jsonify(ok=False, error="No such account"), 404
    return jsonify(ok=True)


@app.post("/api/ig/accounts/<aid>/remove")
def ig_account_remove(aid):
    try:
        accounts.remove(aid)
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True)


@app.post("/api/ig/accounts/<aid>/login")
def ig_account_login(aid):
    if not accounts.get(aid):
        return jsonify(ok=False, error="No such account"), 404

    def go():
        try:
            accounts.engine(aid).open_login()
            log(f"Log in to Instagram in the window that opened for {accounts.get(aid)['label']}. This app never sees your password.")
        except Exception as e:  # noqa
            log(f"Could not open the browser: {e}")
    threading.Thread(target=go, daemon=True).start()
    return jsonify(ok=True)


@app.post("/api/ig/import")
def ig_import():
    """Add Instagram leads from a spreadsheet (a handle column, for example from Large Lead Finder) or a list of handles."""
    import csv as _csv
    from core import message as M
    d = request.get_json(force=True) or {}
    tpl = str(d.get("template") or "")[:3000]
    text = str(d.get("text") or "")
    rows = []
    if "," in text.split("\n")[0] or "\t" in text.split("\n")[0]:
        rows = [{k.strip().lower(): (v or "").strip() for k, v in r.items() if k} for r in _csv.DictReader(io.StringIO(text))]
    else:
        rows = [{"handle": h} for h in clean_handles(text)]
    added = dupes = 0
    for r in rows:
        h = clean_handles(r.get("handle") or r.get("instagram") or r.get("instagram_link") or "")
        if not h:
            continue
        row = {"handle": h[0], "instagram_link": f"https://www.instagram.com/{h[0]}/", "country": r.get("country", ""), "name": r.get("business") or r.get("name", ""),
               "what_they_do": r.get("niche") or r.get("what_they_do", ""), "niche": r.get("niche", ""), "city": r.get("city", ""), "service": r.get("service", ""),
               "website": r.get("website", ""), "has_website": r.get("has_website", "")}
        row["message"] = r.get("message") or (M.message_for(tpl, row) if tpl.strip() else "")
        if outbox.add_row(row):
            added += 1
        else:
            dupes += 1
    return jsonify(ok=True, added=added, duplicates=dupes)


@app.get("/api/version")
def version():
    return jsonify(version=VERSION, exe=FROZEN, output=str(OUT))


@app.get("/api/state")
def state():
    last_ping[0] = time.time()
    since = int(request.args.get("since", 0))
    log_since = int(request.args.get("log", 0))
    snap = job.snapshot() if job else None
    with LOG_LOCK:
        lines = LOG[log_since:]
        log_total = len(LOG)
    rows = []
    if job:
        with job.lock:
            rows = job.rows[since:]
    return jsonify({"engine": engine.status(), "job": snap, "rows": rows, "log": lines, "log_total": log_total})


@app.post("/api/login")
def login():
    def go():
        try:
            engine.open_login()
            log("Log in to Instagram in the window that opened. This app never sees your password.")
        except Exception as e:  # noqa
            log(f"Could not open the browser: {e}")
    threading.Thread(target=go, daemon=True).start()
    return jsonify(ok=True)


@app.post("/api/run")
def run():
    global job
    if job and job.state in ("running", "starting", "stopping"):
        return jsonify(ok=False, error="A run is already going"), 409
    if not engine.status()["logged_in"]:
        return jsonify(ok=False, error="Log in to Instagram first"), 400
    d = request.get_json(force=True) or {}
    service = d.get("service") if d.get("service") in services.SERVICES else services.DEFAULT_SERVICE
    svc = services.get(service)
    saved = read_settings()
    params = {
        "service": service,
        "offer": str(d.get("offer") or svc["offer"])[:80].strip(),
        "city": str(d.get("city") or "")[:60].strip(),
        "country": d.get("country") or "",
        "website": svc["website"],
        "keywords": [k for k in (d.get("keywords") or "").replace("\n", ",").split(",") if k.strip()],
        "min_followers": max(0, int(d.get("min_followers") or 0)),
        "max_followers": int(d.get("max_followers") or 100000),
        "target": max(1, min(2000, int(d.get("target") or 50))),
        "speed": d.get("speed") if d.get("speed") in ("safe", "fast") else "safe",
        "skip_known": bool(d.get("skip_known", True)),
        "only_active": bool(d.get("only_active", True)),
        "only_business": bool(d.get("only_business", True)),
        "allow_unknown": bool(d.get("allow_unknown", False)),
        "handles": clean_handles(d.get("handles") or ""),
        "expand": bool(d.get("expand", True)),
        "message": str(d.get("message", (saved.get("templates") or {}).get(service, "")))[:4000],
    }
    job = Job(engine, params, OUT, OUT / "usage.json", known() if params["skip_known"] else set(), log)
    job.on_row = outbox.add_row            # every lead found is kept in the outreach list
    job.start()
    return jsonify(ok=True)


@app.post("/api/stop")
def stop():
    if job:
        job.stop()
    return jsonify(ok=True)


@app.get("/api/download/<kind>")
def download(kind):
    if not job or not job.rows:
        abort(404)
    stem = job.csv_path.stem
    if kind == "csv":
        return send_file(job.csv_path, as_attachment=True, download_name=stem + ".csv", mimetype="text/csv")
    if kind == "pdf":
        return send_file(io.BytesIO(job.pdf_bytes()), as_attachment=True, download_name=stem + ".pdf", mimetype="application/pdf")
    if kind == "xlsx":
        return send_file(io.BytesIO(job.xlsx_bytes()), as_attachment=True, download_name=stem + ".xlsx",
                         mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    abort(404)


@app.post("/api/open-folder")
def open_folder():
    """Open the folder the CSV files are saved in (Windows)."""
    try:
        OUT.mkdir(parents=True, exist_ok=True)
        if sys.platform == "win32":
            os.startfile(str(OUT))  # noqa
        else:
            import subprocess
            subprocess.Popen(["open", str(OUT)])
        return jsonify(ok=True)
    except Exception as e:  # noqa
        return jsonify(ok=False, error=str(e)), 500


# ---------- updates ----------
DOWNLOAD_PAGE = os.environ.get("IGSCOUT_DOWNLOAD_PAGE") or "https://evansademilua.vercel.app/tools/ig-leads-finder/"
CAN_SELF_UPDATE = sys.platform == "win32"      # On a Mac the app never runs downloaded code: it only points to the download page.


@app.get("/api/update")
def update_check():
    info = updater.check(VERSION)
    info["exe"] = FROZEN
    info["manual"] = not CAN_SELF_UPDATE
    info["download_page"] = DOWNLOAD_PAGE
    return jsonify(info)


@app.post("/api/open-download-page")
def open_download_page():
    webbrowser.open(DOWNLOAD_PAGE)
    return jsonify(ok=True)


@app.post("/api/update/install")
def update_install():
    if not FROZEN:
        return jsonify(ok=False, error="Updates apply to the installed app only"), 400
    if not CAN_SELF_UPDATE:
        return jsonify(ok=False, error="On this computer, download the new version from the page instead"), 400
    if job and job.state in ("running", "starting", "stopping"):
        return jsonify(ok=False, error="Stop the current run first"), 409
    info = updater.check(VERSION)
    if not info.get("available"):
        return jsonify(ok=False, error="Already up to date"), 400
    try:
        updater.install(info, HOME, log)
    except Exception as e:  # noqa
        log(f"Update failed: {e}")
        return jsonify(ok=False, error=str(e)), 500
    log(f"Updated to {info['latest']}. Restarting.")
    if restart_hook:
        threading.Timer(0.8, restart_hook).start()
    return jsonify(ok=True, restarting=bool(restart_hook))


def make_server():
    """A server object the launcher can start in a thread and shut down."""
    from werkzeug.serving import make_server as ms
    HOME.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    KNOWN_DIRS[0].mkdir(parents=True, exist_ok=True)
    return ms("127.0.0.1", PORT, app, threaded=True)


def main():
    HOME.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    print("=" * 62)
    print(f"  IG Outreach {VERSION} is running.  Keep this window open.")
    print(f"  Screen:  http://127.0.0.1:{PORT}")
    print("  Results are saved as they arrive in:  " + str(OUT))
    print("=" * 62, flush=True)
    if not os.environ.get("IGSCOUT_NOBROWSER"):
        threading.Timer(1.2, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
    try:
        app.run(host="127.0.0.1", port=PORT, threaded=True, debug=False)
    finally:
        accounts.close_all()


if __name__ == "__main__":
    main()
