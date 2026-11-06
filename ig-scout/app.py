"""IG Scout: find Instagram businesses by country and website status, and save them as a leads sheet.

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

from core import updater
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


engine = Engine(HOME / "profile", log)
job = None
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


@app.get("/")
def index():
    return send_from_directory(ROOT / "ui", "index.html")


@app.get("/favicon.ico")
def favicon():
    return send_from_directory(ROOT / "ui", "icon.ico")


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


@app.get("/api/settings")
def get_settings():
    return jsonify(read_settings())


@app.post("/api/settings")
def save_settings():
    import json
    cur = read_settings()
    d = request.get_json(force=True) or {}
    if "message" in d:
        cur["message"] = str(d["message"])[:4000]
    HOME.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(cur), encoding="utf-8")
    return jsonify(ok=True)


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
    params = {
        "country": d.get("country") or "",
        "website": d.get("website") if d.get("website") in ("yes", "no") else "either",
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
        "message": str(d.get("message", read_settings().get("message", "")))[:4000],
    }
    job = Job(engine, params, OUT, OUT / "usage.json", known() if params["skip_known"] else set(), log)
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
@app.get("/api/update")
def update_check():
    info = updater.check(VERSION)
    info["exe"] = FROZEN
    return jsonify(info)


@app.post("/api/update/install")
def update_install():
    if not FROZEN:
        return jsonify(ok=False, error="Updates apply to the installed app only"), 400
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
    print(f"  IG Scout {VERSION} is running.  Keep this window open.")
    print(f"  Screen:  http://127.0.0.1:{PORT}")
    print("  Results are saved as they arrive in:  " + str(OUT))
    print("=" * 62, flush=True)
    if not os.environ.get("IGSCOUT_NOBROWSER"):
        threading.Timer(1.2, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
    try:
        app.run(host="127.0.0.1", port=PORT, threaded=True, debug=False)
    finally:
        engine.close()


if __name__ == "__main__":
    main()
