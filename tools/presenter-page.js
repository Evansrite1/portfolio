/* Presenter landing page: the moving background, and the download tabs that pick your computer. */
(function () {
  'use strict';
  var BASE = 'https://github.com/Evansrite1/portfolio/releases/latest/download/';
  var FILES = { win: 'Presenter-Windows-Setup.zip', macArm: 'Presenter-Mac-Apple-chip.zip', macIntel: 'Presenter-Mac-Intel.zip' };
  var $$ = function (s, c) { return [].slice.call((c || document).querySelectorAll(s)); };

  /* background: the videos take turns, fading from one to the next; the rest load once the page is idle */
  var vids = $$('.bgv'), i = 0, reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function load(v) { if (!v.src && v.dataset.src) { v.src = v.dataset.src; v.load(); } }
  function show(n) { vids.forEach(function (v, k) { v.classList.toggle('on', k === n); if (k === n) { load(v); var p = v.play(); if (p && p.catch) p.catch(function () {}); } else if (!v.paused) setTimeout(function () { if (!v.classList.contains('on')) v.pause(); }, 2400); }); }
  if (vids.length && !reduce) {
    show(0);
    var ric = window.requestIdleCallback || function (f) { return setTimeout(f, 1500); };
    ric(function () { vids.forEach(load); });
    setInterval(function () { i = (i + 1) % vids.length; show(i); }, 8000);
  }

  /* downloads: the right computer is chosen for you */
  $$('.dl-btn').forEach(function (a) { a.href = BASE + FILES[a.dataset.file]; });
  var tabs = $$('.dl-tabs button'), panels = $$('.dl-panel');
  function pick(os) { tabs.forEach(function (t) { t.setAttribute('aria-selected', t.dataset.os === os); }); panels.forEach(function (p) { p.hidden = p.dataset.panel !== os; }); }
  tabs.forEach(function (t) { t.addEventListener('click', function () { pick(t.dataset.os); }); });
  var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '', ua = navigator.userAgent || '';
  if (/mac/i.test(plat) || /macintosh|mac os x/i.test(ua)) {
    pick('macArm');
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) navigator.userAgentData.getHighEntropyValues(['architecture']).then(function (v) { if (/x86/i.test(v.architecture || '')) pick('macIntel'); }).catch(function () {});
  } else pick('win');
})();
