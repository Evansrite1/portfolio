"""The built-in browser. The installer downloads its own copy of Chromium into the app folder, so finding leads never depends on
the browser you use every day and never opens a window: it runs in the background. If it is missing (no internet during the
install), everything still works; only pages that need scripts to show their contact details are skipped."""
import os
import subprocess
import sys
import threading
from pathlib import Path


def app_dir():
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent)).resolve() if not getattr(sys, "frozen", False) else Path(sys.executable).parent


def browsers_dir():
    return Path(os.environ.get("LLF_BROWSERS") or (app_dir() / "browser"))


def installed():
    d = browsers_dir()
    return d.is_dir() and any(p.name.startswith("chromium") for p in d.iterdir())


def install(log=print):
    """Downloads Chromium into the browser folder. Returns True when it is there. Run by the installer and by Settings."""
    env = dict(os.environ, PLAYWRIGHT_BROWSERS_PATH=str(browsers_dir()))
    try:
        from playwright._impl._driver import compute_driver_executable, get_driver_env
        node, cli = compute_driver_executable()
        env.update(get_driver_env())
        env["PLAYWRIGHT_BROWSERS_PATH"] = str(browsers_dir())
        cmd = [node, cli, "install", "--only-shell", "chromium"] if cli else [str(node), "install", "--only-shell", "chromium"]
    except Exception:
        cmd = [sys.executable, "-m", "playwright", "install", "--only-shell", "chromium"]
    browsers_dir().mkdir(parents=True, exist_ok=True)
    log("Downloading the built-in browser (about 100 MB). This happens once.")
    p = subprocess.run(cmd, env=env, capture_output=True, text=True, creationflags=0x08000000 if os.name == "nt" else 0)
    log((p.stdout or "")[-400:] + (p.stderr or "")[-400:])
    return installed()


class Renderer:
    """Opens pages in the built-in browser, headless, one at a time. Used only when a plain page held no email."""

    def __init__(self):
        self._lock = threading.Lock()
        self._pw = self._browser = None

    def _start(self):
        if self._browser:
            return True
        if not installed():
            return False
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(browsers_dir())
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        return True

    def __call__(self, url):
        with self._lock:
            if not self._start():
                return ""
            ctx = self._browser.new_context(user_agent="Mozilla/5.0 (compatible; LargeLeadFinder/1.0)", viewport={"width": 1100, "height": 800})
            try:
                page = ctx.new_page()
                page.route("**/*", lambda r: r.abort() if r.request.resource_type in ("image", "media", "font") else r.continue_())
                page.goto(url, wait_until="domcontentloaded", timeout=20000)
                page.wait_for_timeout(1800)
                return page.content()
            except Exception:
                return ""
            finally:
                ctx.close()

    def close(self):
        try:
            if self._browser:
                self._browser.close()
            if self._pw:
                self._pw.stop()
        except Exception:
            pass
        self._browser = self._pw = None
