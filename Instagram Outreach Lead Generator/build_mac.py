"""Build IG Leads Finder for Mac (run on a Mac, normally by the GitHub workflow leads-finder.yml).

    python build_mac.py arm64     Apple chip
    python build_mac.py x64       Intel

Result in build_out/:
    IG-Leads-Finder-mac-<arch>.pkg   an installer: it puts the app in the Applications folder and nothing anywhere else
    IG-Leads-Finder-mac-<arch>.dmg   the same app as a disk image (drag to Applications)
The app is not signed with a paid Apple certificate, so the first time the installer or the app is opened the person
right-clicks it and presses Open.

What the app does on a Mac (and nothing else): it writes its own files in ~/Library/Application Support/IG Leads Finder and
its results in ~/Documents/IG Leads Finder. It opens Chrome, Edge or Brave in an app window with its own separate profile,
so the person's normal browser, bookmarks and logins are never touched. It never runs code downloaded from the internet:
a new version is shown as a download button.
"""
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
WORK = HERE / "build_out"
ARCH = sys.argv[1] if len(sys.argv) > 1 else "arm64"
NAME = "IG Leads Finder"
SLUG = "IG-Leads-Finder"


def icns():
    from PIL import Image
    out = WORK / "icon.icns"
    WORK.mkdir(exist_ok=True)
    im = Image.open(HERE / "ui" / "logo.png").convert("RGBA")
    im.resize((512, 512)).save(out, format="ICNS")
    return out


def main():
    if WORK.exists():
        shutil.rmtree(WORK)
    WORK.mkdir()
    icon = icns()
    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--windowed", "--onedir", "--name", NAME,
           "--icon", str(icon), "--osx-bundle-identifier", "com.evansademilua.igleadsfinder",
           "--add-data", f"{HERE / 'app.py'}:code", "--add-data", f"{HERE / 'core'}:code/core",
           "--add-data", f"{HERE / 'ui'}:code/ui", "--collect-all", "playwright", "--collect-all", "reportlab",
           "--distpath", str(WORK / "dist"), "--workpath", str(WORK / "work"), "--specpath", str(WORK),
           str(HERE / "launcher_mac.py")]
    subprocess.run(cmd, check=True)
    app = WORK / "dist" / f"{NAME}.app"
    if not app.exists():
        raise SystemExit("The app was not built")

    # 1) the installer package: installs the app into /Applications only
    pkg = WORK / f"{SLUG}-mac-{ARCH}.pkg"
    subprocess.run(["pkgbuild", "--component", str(app), "--install-location", "/Applications",
                    "--identifier", "com.evansademilua.igleadsfinder.pkg", "--version", version(), str(pkg)], check=True)

    # 2) the disk image
    stage = WORK / "dmg"
    stage.mkdir()
    subprocess.run(["cp", "-R", str(app), str(stage / f"{NAME}.app")], check=True)
    (stage / "Applications").symlink_to("/Applications")
    out = WORK / f"{SLUG}-mac-{ARCH}.dmg"
    subprocess.run(["hdiutil", "create", "-volname", NAME, "-srcfolder", str(stage), "-ov", "-format", "UDZO", str(out)], check=True)
    print("built", pkg, out)


def version():
    import re
    return re.search(r'VERSION\s*=\s*"([\d.]+)"', (HERE / "core" / "version.py").read_text(encoding="utf-8")).group(1)


if __name__ == "__main__":
    main()
