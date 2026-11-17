"""Build Large Lead Finder: the installer (Large-Lead-Finder-Setup.exe).

    python build.py              builds into ./dist
    python build.py --out DIR    writes the installer to DIR (the GitHub workflow uses this)
"""
import glob
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
WORK = HERE / "build_out"
VERSION = re.search(r'VERSION\s*=\s*"([\d.]+)"', (HERE / "engine" / "version.py").read_text(encoding="utf-8")).group(1)


def makensis():
    on_path = shutil.which("makensis")
    if on_path:
        return on_path
    for pf in (os.environ.get("ProgramFiles(x86)", ""), os.environ.get("ProgramFiles", "")):
        c = os.path.join(pf, "NSIS", "makensis.exe")
        if pf and os.path.exists(c):
            return c
    hits = glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""), "electron-builder", "Cache", "nsis", "nsis-*", "makensis.exe"))
    if not hits:
        raise SystemExit("makensis.exe not found. Install NSIS, or run an electron-builder build once (desktop/presenter-app).")
    return sorted(hits)[-1]


def main():
    if WORK.exists():
        shutil.rmtree(WORK)
    subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--onedir", "--noconsole", "--name", "Large Lead Finder",
                    "--icon", str(HERE / "ui" / "icon.ico"), "--exclude-module", "tkinter", "--exclude-module", "pytest", "--exclude-module", "numpy", "--exclude-module", "unittest", "--add-data", f"{HERE / 'ui'};ui", "--collect-all", "playwright",
                    "--distpath", str(WORK / "dist"), "--workpath", str(WORK / "work"), "--specpath", str(WORK),
                    str(HERE / "launcher.py")], check=True)
    app_dir = WORK / "dist" / "Large Lead Finder"
    dest = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else HERE / "dist"
    dest.mkdir(parents=True, exist_ok=True)
    out = dest / "Large-Lead-Finder-Setup.exe"
    side = HERE / "build_art" / "installerSidebar.bmp"
    extra = [f"/DSIDEBAR={side}"] if side.exists() else []
    subprocess.run([makensis(), "/V2", f"/DVERSION={VERSION}", f"/DSRC={app_dir}", f"/DOUT={out}",
                    f"/DICON={HERE / 'ui' / 'icon.ico'}", f"/DLICENSE={HERE / 'build_art' / 'license.txt'}"] + extra + [str(HERE / "installer.nsi")], check=True)
    print(f"installer {out}  {out.stat().st_size // 1048576} MB  version {VERSION}")


if __name__ == "__main__":
    main()
