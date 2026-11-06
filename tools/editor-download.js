/* Video Editor app download: Windows installer or Mac disk image (see appdl.js). */
(function () {
  'use strict';
  var b = document.getElementById('ve-dl'); if (!b || !window.AppDL) return;
  var dl = window.AppDL({
    name: 'The Video Editor app',
    base: 'https://github.com/Evansrite1/portfolio/releases/download/editor-v1.0.0/',
    files: { win: 'Editor-Setup.exe', macArm: 'Editor-mac-arm64.dmg', macIntel: 'Editor-mac-x64.dmg' }
  });
  dl.apply(b, 've-dl-other').then(function (os) { var t = document.getElementById('ve-dl-tip'); if (t) t.textContent = dl.tip(os); });
})();
