"""Build IG Scout for Mac (run on a Mac, normally by the GitHub workflow scout-mac.yml).

    python build_mac.py arm64     Apple chip
    python build_mac.py x64       Intel

Result: build_out/IG-Scout-mac-<arch>.dmg (the app plus a shortcut to the Applications folder).
The app is not signed with a paid Apple certificate, so the first time it is opened the person right-clicks it and
presses Open.
"""
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
WORK = HERE / "build_out"
ARCH = sys.argv[1] if len(sys.argv) > 1 else "arm64"


def icns():
    from PIL import Image
    out = WORK / "icon.icns"
    WORK.mkdir(exist_ok=True)
    im = Image.open(HERE / "ui" / "icon.ico")
    try:
        im = im.convert("RGBA")
    except Exception:
        pass
    big = im.resize((512, 512))
    big.save(out, format="ICNS")
    return out


def main():
    if WORK.exists():
        shutil.rmtree(WORK)
    WORK.mkdir()
    icon = icns()
    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--windowed", "--onedir", "--name", "IG Scout",
           "--icon", str(icon), "--osx-bundle-identifier", "com.evansademilua.igscout",
           "--add-data", f"{HERE / 'app.py'}:code", "--add-data", f"{HERE / 'core'}:code/core",
           "--add-data", f"{HERE / 'ui'}:code/ui", "--collect-all", "playwright", "--collect-all", "reportlab",
           "--distpath", str(WORK / "dist"), "--workpath", str(WORK / "work"), "--specpath", str(WORK),
           str(HERE / "launcher_mac.py")]
    subprocess.run(cmd, check=True)
    app = WORK / "dist" / "IG Scout.app"
    if not app.exists():
        raise SystemExit("The app was not built")
    stage = WORK / "dmg"
    stage.mkdir()
    subprocess.run(["cp", "-R", str(app), str(stage / "IG Scout.app")], check=True)
    (stage / "Applications").symlink_to("/Applications")
    out = WORK / f"IG-Scout-mac-{ARCH}.dmg"
    subprocess.run(["hdiutil", "create", "-volname", "IG Scout", "-srcfolder", str(stage), "-ov", "-format", "UDZO", str(out)], check=True)
    print("built", out)


if __name__ == "__main__":
    main()
