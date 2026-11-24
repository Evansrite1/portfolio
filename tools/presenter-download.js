/* Presenter app download: picks the Windows or Mac file by itself (see appdl.js).
   The files live on the GitHub releases of this site's repository; the Presenter is always the "latest" release. */
(function () {
  'use strict';
  var dl = window.AppDL({
    name: 'The Presenter app',
    base: 'https://github.com/Evansrite1/portfolio/releases/latest/download/',
    files: { win: 'Presenter-Windows-Setup.zip', macArm: 'Presenter-mac-arm64.dmg', macIntel: 'Presenter-mac-x64.dmg' }
  });
  window.PresenterDownload = {
    detect: dl.detect,
    apply: function (el, extraId) { dl.apply(el, extraId); return dl.detect(); },
    tip: function (os) {
      if (os === 'win') return 'How to install: 1. Open the downloaded zip and press Extract all. 2. Open the new folder and double-click Presenter Setup. 3. If Windows says "Windows protected your PC", press More info, then Run anyway. 4. Press Install Presenter and wait one to two minutes. It opens by itself when it finishes.';
      if (os === 'mac') return 'How to install on a Mac:
1. Open the downloaded file and drag Presenter into the Applications folder.
2. Open Applications, right-click Presenter by Evans Large, press Open, then press Open again.
3. If your Mac says the app is damaged or cannot be checked, open Terminal (press Command and Space, type Terminal, press Enter), paste this line and press Enter:
xattr -cr "/Applications/Presenter by Evans Large.app"
4. Open Presenter again. After the first time it opens like any other app.
Not sure which download? Apple menu, About This Mac: Chip means Apple chip, Processor means Intel.';
      return dl.tip(os);
    }
  };
})();
