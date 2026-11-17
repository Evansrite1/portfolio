/* "Get the app" cards: shows the right installer for the visitor's computer (see appdl.js). */
(function () {
  'use strict';
  if (!window.AppDL) return;
  document.querySelectorAll('.get-app').forEach(function (box) {
    var d = box.dataset, btn = box.querySelector('.ga-btn'), other = box.querySelector('.ga-other'), tip = box.querySelector('.ga-tip');
    var dl = window.AppDL({ name: d.name, base: d.base, files: { win: d.win, macArm: d.macarm, macIntel: d.macintel } });
    var id = 'ga-other-' + box.id; other.id = id;
    dl.apply(btn, id).then(function (os) { if (tip) tip.textContent = dl.tip(os); });
  });
})();
