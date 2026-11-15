/* IG Leads Finder download: a Windows Setup program or a Mac .pkg installer (see appdl.js). */
(function () {
  'use strict';
  var b = document.getElementById('lf-dl'); if (!b || !window.AppDL) return;
  var dl = window.AppDL({
    name: 'IG Leads Finder',
    base: 'https://github.com/Evansrite1/portfolio/releases/download/leads-latest/',
    files: { win: 'IG-Leads-Finder-Setup.exe', macArm: 'IG-Leads-Finder-mac-arm64.pkg', macIntel: 'IG-Leads-Finder-mac-x64.pkg' }
  });
  dl.apply(b, 'lf-dl-other').then(function (os) { var t = document.getElementById('lf-dl-tip'); if (t) t.textContent = dl.tip(os); });
})();
