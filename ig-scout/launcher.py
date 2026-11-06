"""IG Scout.exe starts here. No console window: the screen opens in its own app window.

The exe carries a copy of the code. If a newer copy was downloaded earlier (see core/updater.py) that one runs
instead. If the newer copy fails to start, the built-in copy is used, so an update can never leave the app broken.
"""
import os
import re
import socket
import subprocess
import sys
import threading
import time
import traceback
from pathlib import Path

# Never executed. They tell the packager which libraries the app code needs inside the exe.
if __name__ == "__never__":  # pragma: no cover
    import bs4, csv, flask, glob, hashlib, io, json, openpyxl, queue, random, requests, shutil, urllib.request, zipfile  # noqa
    import playwright.async_api, werkzeug.serving, reportlab.platypus  # noqa

PORT = int(os.environ.get("IGSCOUT_PORT") or 5057)
LOCAL = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
HOME = LOCAL / "IGScout"
DOCS = Path.home() / "Documents" / "IG Scout"
HOME.mkdir(parents=True, exist_ok=True)
DOCS.mkdir(parents=True, exist_ok=True)

# With no console, stdout and stderr do not exist. Give them a file so nothing that prints can crash.
try:
    _log = open(HOME / "igscout.log", "a", buffering=1, encoding="utf-8")
    if sys.stdout is None:
        sys.stdout = _log
    if sys.stderr is None:
        sys.stderr = _log
except Exception:
    pass

os.environ.update({"IGSCOUT_EXE": "1", "IGSCOUT_HOME": str(HOME), "IGSCOUT_OUT": str(DOCS / "results"),
                   "IGSCOUT_KNOWN": str(DOCS / "already-have"), "IGSCOUT_PORT": str(PORT)})


def say(title, text):
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, text, title, 0x10)
    except Exception:
        pass


def version_of(folder):
    try:
        m = re.search(r'VERSION\s*=\s*"([\d.]+)"', (Path(folder) / "core" / "version.py").read_text(encoding="utf-8"))
        return tuple(int(x) for x in m.group(1).split("."))
    except Exception:
        return (0,)


def pick_code():
    bundled = Path(getattr(sys, "_MEIPASS", Path(__file__).parent)) / "code"
    if not bundled.exists():
        bundled = Path(__file__).parent          # running from source
    updated = HOME / "code" / "current"
    if updated.exists() and version_of(updated) > version_of(bundled):
        return updated, bundled
    return bundled, bundled


def port_busy():
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


def find_browser():
    pf = [os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"), str(LOCAL / "Programs")]
    for base in pf:
        if not base:
            continue
        for rel in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe"):
            p = Path(base) / rel
            if p.exists():
                return str(p)
    return None


def open_window():
    browser = find_browser()
    url = f"http://127.0.0.1:{PORT}"
    if not browser:
        import webbrowser
        webbrowser.open(url)
        return None
    return subprocess.Popen([browser, f"--app={url}", f"--user-data-dir={HOME / 'ui-profile'}", "--window-size=1320,880",
                             "--no-first-run", "--no-default-browser-check", "--disable-sync", "--disable-background-mode"])


def main():
    # Starting a second copy just brings up the screen of the one already running.
    for _ in range(25):
        if not port_busy():
            break
        time.sleep(0.4)
    else:
        open_window()
        return

    code, bundled = pick_code()
    sys.path.insert(0, str(code))
    try:
        import app
    except Exception:
        if code != bundled:
            sys.path.remove(str(code))
            for m in [m for m in sys.modules if m == "app" or m == "core" or m.startswith("core.")]:
                del sys.modules[m]
            sys.path.insert(0, str(bundled))
            import app
        else:
            raise
    server = app.make_server()
    threading.Thread(target=server.serve_forever, daemon=True).start()
    app.log(f"IG Scout {app.VERSION} started ({code})")

    window = open_window()
    started = time.time()

    def quit_now(restart=False):
        try:
            app.engine.close()
        except Exception:
            pass
        try:
            server.shutdown()
        except Exception:
            pass
        if window and window.poll() is None:
            subprocess.call(["taskkill", "/F", "/T", "/PID", str(window.pid)], stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, creationflags=0x08000000)
        if restart:
            # Without this reset the new copy would reuse this copy's temporary folder, which is about to be deleted.
            env = dict(os.environ, PYINSTALLER_RESET_ENVIRONMENT="1")
            subprocess.Popen([sys.executable], env=env, creationflags=0x00000008 | 0x08000000)
        os._exit(0)

    app.restart_hook = lambda: quit_now(True)

    # Close the app when its window is closed: the window process ends, or the screen stops pinging for 3 minutes
    # (a minimised window pings slowly, so the wait is long).
    while True:
        time.sleep(1)
        ping = app.last_ping[0]
        silent = time.time() - (ping or started)
        gone = window is not None and window.poll() is not None
        if (gone and silent > 4) or silent > (90 if not ping else 180):
            quit_now()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        err = traceback.format_exc()
        try:
            (HOME / "igscout-crash.log").write_text(err, encoding="utf-8")
        except Exception:
            pass
        say("IG Scout could not start", "Something went wrong while starting.\n\nDetails were saved to:\n"
            + str(HOME / "igscout-crash.log"))
