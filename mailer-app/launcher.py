"""Outreach Mailer.exe starts here. No console window: the screen opens in its own app window.

The app is a small local web server shown in an Edge or Chrome window with no tabs or address bar. Closing the window
closes the app (sending only runs while the app is open). A second launch just brings up the window of the running copy.
"""
import json
import os
import socket
import subprocess
import sys
import threading
import time
import traceback
from pathlib import Path

if __name__ == "__never__":  # pragma: no cover  (tells the packager which libraries the app needs)
    import flask, requests, werkzeug.serving, sqlite3, imaplib, smtplib, email.message, csv, pypdf  # noqa

LOCAL = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
HOME = LOCAL / "OutreachMailer"
HOME.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MAILER_HOME", str(HOME))
try:
    _log = open(HOME / "mailer.log", "a", buffering=1, encoding="utf-8")
    if sys.stdout is None:
        sys.stdout = _log
    if sys.stderr is None:
        sys.stderr = _log
except Exception:
    pass

BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
sys.path.insert(0, str(BASE))
RUNNING = HOME / "running.json"


def say(title, text):
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, text, title, 0x10)
    except Exception:
        pass


def find_browser():
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"), str(LOCAL / "Programs")):
        for rel in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe"):
            if base and (Path(base) / rel).exists():
                return str(Path(base) / rel)
    return None


def open_window(url):
    b = find_browser()
    if not b:
        import webbrowser
        webbrowser.open(url)
        return None
    return subprocess.Popen([b, f"--app={url}", f"--user-data-dir={HOME / 'ui-profile'}", "--window-size=1280,860",
                             "--no-first-run", "--no-default-browser-check", "--disable-sync", "--disable-background-mode"])


def alive(port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    try:
        info = json.loads(RUNNING.read_text(encoding="utf-8"))
        if alive(info["port"]):
            open_window(f"http://127.0.0.1:{info['port']}/?k={info['key']}")
            return
    except Exception:
        pass
    port = free_port()
    key = __import__("secrets").token_urlsafe(24)
    os.environ["MAILER_KEY"] = key
    from engine import server
    srv = server.make_server("127.0.0.1", port)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    RUNNING.write_text(json.dumps({"port": port, "key": key}), encoding="utf-8")
    window = open_window(f"http://127.0.0.1:{port}/?k={key}")
    started = time.time()
    while True:
        time.sleep(1)
        ping = server.last_ping[0]
        silent = time.time() - (ping or started)
        gone = window is not None and window.poll() is not None
        if (gone and silent > 4) or silent > (90 if not ping else 180):
            try:
                RUNNING.unlink()
            except Exception:
                pass
            if window and window.poll() is None:
                subprocess.call(["taskkill", "/F", "/T", "/PID", str(window.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=0x08000000)
            os._exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        err = traceback.format_exc()
        try:
            (HOME / "crash.log").write_text(err, encoding="utf-8")
        except Exception:
            pass
        say("Outreach Mailer could not start", "Something went wrong while starting.\n\nDetails were saved to:\n" + str(HOME / "crash.log"))
