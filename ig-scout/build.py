"""Build IG Scout.exe, the code update package and the version file.

    python build.py            builds everything
    python build.py --code     rebuilds only the code package and version file (use this for a normal update)

Output goes to ../scout/ (the private download page of the portfolio site):
    scout/download/IG-Scout-Setup.exe         the installer people download
    scout/update/ig-scout-code-<version>.zip  what installed apps download to update themselves
    scout/version.json                        what installed apps check
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).parent
SITE = HERE.parent / "scout"
WORK = HERE / "build_out"
VERSION = re.search(r'VERSION\s*=\s*"([\d.]+)"', (HERE / "core" / "version.py").read_text(encoding="utf-8")).group(1)
CODE_FILES = ["app.py"]


def code_zip():
    (SITE / "update").mkdir(parents=True, exist_ok=True)
    out = SITE / "update" / f"ig-scout-code-{VERSION}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in CODE_FILES:
            z.write(HERE / f, f)
        for d in ("core", "ui"):
            for p in sorted((HERE / d).rglob("*")):
                if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc":
                    z.write(p, p.relative_to(HERE).as_posix())
    sha = hashlib.sha256(out.read_bytes()).hexdigest()
    notes = []
    try:
        log = json.loads((HERE / "changelog.json").read_text(encoding="utf-8"))
        notes = next((e["notes"] for e in log if e["version"] == VERSION), [])
    except Exception:
        pass
    info = {"version": VERSION, "code": f"update/{out.name}", "sha256": sha, "notes": notes}
    url_file = HERE / "download_url.txt"          # where the exe zip is hosted; put the full link in this file
    if url_file.exists() and url_file.read_text(encoding="utf-8").strip():
        info["download"] = url_file.read_text(encoding="utf-8").strip()
    (SITE / "version.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    print(f"code package {out.name}  {out.stat().st_size // 1024} KB  sha256 {sha[:12]}")


def makensis():
    import glob, os
    hits = glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""), "electron-builder", "Cache", "nsis", "nsis-*", "makensis.exe"))
    if not hits:
        raise SystemExit("makensis.exe not found. Run an electron-builder build once (desktop/presenter-app) or install NSIS.")
    return sorted(hits)[-1]


def exe():
    """The app as a folder (starts fast), then wrapped into one installer: IG-Scout-Setup.exe."""
    if WORK.exists():
        shutil.rmtree(WORK)
    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--onedir", "--noconsole", "--name", "IG Scout",
           "--icon", str(HERE / "ui" / "icon.ico"),
           "--add-data", f"{HERE / 'app.py'};code", "--add-data", f"{HERE / 'core'};code/core",
           "--add-data", f"{HERE / 'ui'};code/ui", "--collect-all", "playwright", "--collect-all", "reportlab",
           "--distpath", str(WORK / "dist"), "--workpath", str(WORK / "work"), "--specpath", str(WORK),
           str(HERE / "launcher.py")]
    subprocess.run(cmd, check=True)
    app_dir = WORK / "dist" / "IG Scout"
    (SITE / "download").mkdir(parents=True, exist_ok=True)
    for old in (SITE / "download").glob("*"):
        old.unlink()
    out = SITE / "download" / "IG-Scout-Setup.exe"
    subprocess.run([makensis(), "/V2", f"/DVERSION={VERSION}", f"/DSRC={app_dir}", f"/DOUT={out}",
                    f"/DICON={HERE / 'ui' / 'icon.ico'}", str(HERE / "installer.nsi")], check=True)
    print(f"installer {out.name}  {out.stat().st_size // 1048576} MB")


if __name__ == "__main__":
    if "--code" not in sys.argv:
        exe()
    code_zip()
