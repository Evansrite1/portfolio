"""Updates. The app checks a small version file on the portfolio site. When a newer version exists it downloads a
zip of the app's code (a few hundred KB, not the whole exe), checks its checksum, and swaps it in.

The exe keeps working from its own built-in code if anything goes wrong, so a bad update never leaves it broken.
"""
import hashlib
import io
import json
import os
import shutil
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urljoin

BASE = os.environ.get("IGSCOUT_UPDATE_BASE") or "https://evansademilua.vercel.app/scout/"
VERSION_URL = BASE + "version.json"
UA = "IGScout-updater"


def _tuple(v):
    out = []
    for p in str(v).split("."):
        try:
            out.append(int(p))
        except ValueError:
            out.append(0)
    return tuple(out)


def _get(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def check(current):
    """Returns dict(current, latest, available, notes, error). Never raises: no internet just means no update."""
    out = {"current": current, "latest": current, "available": False, "notes": [], "error": ""}
    try:
        info = json.loads(_get(VERSION_URL).decode("utf-8"))
        out["latest"] = info.get("version", current)
        out["notes"] = info.get("notes", [])
        out["code_url"] = urljoin(BASE, info.get("code", ""))
        out["sha256"] = info.get("sha256", "")
        out["available"] = _tuple(out["latest"]) > _tuple(current) and bool(info.get("code"))
    except Exception as e:  # noqa
        out["error"] = type(e).__name__
    return out


def install(info, home, log=print):
    """Download, verify and swap in the new code. Raises on any problem and changes nothing in that case."""
    home = Path(home)
    data = _get(info["code_url"], timeout=60)
    if info.get("sha256") and hashlib.sha256(data).hexdigest().lower() != info["sha256"].lower():
        raise RuntimeError("The download did not match its checksum, so it was not installed")
    staging = home / "code" / "staging"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for m in z.namelist():
            if m.startswith("/") or ".." in Path(m).parts:
                raise RuntimeError("Unsafe file path in the update")
        z.extractall(staging)
    if not (staging / "app.py").exists() or not (staging / "core" / "version.py").exists():
        shutil.rmtree(staging, ignore_errors=True)
        raise RuntimeError("The update package is incomplete")
    cur, prev = home / "code" / "current", home / "code" / "previous"
    if prev.exists():
        shutil.rmtree(prev, ignore_errors=True)
    if cur.exists():
        cur.rename(prev)
    staging.rename(cur)
    log(f"Installed version {info['latest']}")
