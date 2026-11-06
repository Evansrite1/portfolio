"""IG Scout for Mac starts here (the Windows app uses launcher.py). The screen opens in its own app window.

Same design as Windows: the app carries a copy of its code, a newer downloaded copy runs instead when there is one,
and the built-in copy is used if the newer one fails to start.
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

# Never executed. They tell the packager which libraries the app code needs inside the app.
if __name__ == "__never__":  # pragma: no cover
    import bs4, csv, flask, glob, hashlib, io, json, openpyxl, queue, random, requests, shutil, urllib.request, zipfile  # noqa
    import playwright.async_api, werkzeug.serving, reportlab.platypus  # noqa

PORT = int(os.environ.get("IGSCOUT_PORT") or 5057)
HOME = Path.home() / "Library" / "Application Support" / "IG Scout"
DOCS = Path.home() / "Documents" / "IG Scout"
HOME.mkdir(parents=True, exist_ok=True)
DOCS.mkdir(parents=True, exist_ok=True)

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

BROWSERS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    str(Path.home() / "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    str(Path.home() / "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
]


def say(title, text):
    try:
        esc = lambda x: x.replace("\\", "\\\\").replace('"', '\\"')
        subprocess.run(["osascript", "-e", f'display dialog "{esc(text)}" with title "{esc(title)}" buttons {{"OK"}} with icon stop'], check=False)
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
        bundled = Path(__file__).parent
    updated = HOME / "code" / "current"
    if updated.exists() and version_of(updated) > version_of(bundled):
        return updated, bundled
    return bundled, bundled


def port_busy():
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


def find_browser():
    for p in BROWSERS:
        if Path(p).exists():
            return p
    return None


def open_window():
    browser = find_browser()
    url = f"http://127.0.0.1:{PORT}"
    if not browser:
        say("IG Scout needs Chrome or Edge",
            "IG Scout opens in Google Chrome or Microsoft Edge. Install one of them, then open IG Scout again.")
        return None
    return subprocess.Popen([browser, f"--app={url}", f"--user-data-dir={HOME / 'ui-profile'}", "--window-size=1320,880",
                             "--no-first-run", "--no-default-browser-check", "--disable-sync", "--disable-background-mode"])


def bundle_path():
    p = Path(sys.executable).resolve()
    for parent in p.parents:
        if parent.suffix == ".app":
            return parent
    return None


def main():
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
    app.log(f"IG Scout {app.VERSION} started on Mac ({code})")

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
            try:
                window.terminate()
            except Exception:
                pass
        if restart:
            b = bundle_path()
            if b:
                subprocess.Popen(["/usr/bin/open", "-n", str(b)])
        os._exit(0)

    app.restart_hook = lambda: quit_now(True)

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
        say("IG Scout could not start", "Something went wrong while starting. Details were saved to:\n" + str(HOME / "igscout-crash.log"))
