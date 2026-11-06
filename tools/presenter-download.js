/* Presenter app download: picks the Windows or Mac file by itself (see appdl.js).
   The files live on the GitHub releases of this site's repository; the Presenter is always the "latest" release. */
(function () {
  'use strict';
  var dl = window.AppDL({
    name: 'The Presenter app',
    base: 'https://github.com/Evansrite1/portfolio/releases/latest/download/',
    files: { win: 'Presenter-Setup.exe', macArm: 'Presenter-mac-arm64.dmg', macIntel: 'Presenter-mac-x64.dmg' }
  });
  window.PresenterDownload = {
    detect: dl.detect,
    apply: function (el, extraId) { dl.apply(el, extraId); return dl.detect(); },
    tip: dl.tip
  };
})();
