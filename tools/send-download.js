/* File Share by Evans Large download: a Windows Setup program, a Mac .pkg installer or a Linux .deb installer (see appdl.js). */
(function () {
  'use strict';
  var b = document.getElementById('fs-dl'); if (!b || !window.AppDL) return;
  var dl = window.AppDL({
    name: 'File Share by Evans Large',
    base: 'https://github.com/Evansrite1/portfolio/releases/download/send-v1.0.0/',
    files: { win: 'File-Share-Setup.exe', macArm: 'File-Share-mac-arm64.pkg', macIntel: 'File-Share-mac-x64.pkg', linux: 'File-Share-linux-x64.deb', linuxAlt: 'File-Share-linux-x64.AppImage' }
  });
  dl.apply(b, 'fs-dl-other').then(function (os) { var t = document.getElementById('fs-dl-tip'); if (t) t.textContent = dl.tip(os); });
})();
