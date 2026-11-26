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


  /* moving geometric shapes behind the hero */
  (function () {
    var host = document.querySelector('.ph-bg'); if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cv = document.createElement('canvas'); cv.className = 'ph-geo'; host.insertBefore(cv, host.querySelector('.ph-stars')); var x = cv.getContext('2d'), W = 0, H = 0, D = Math.min(window.devicePixelRatio || 1, 1.5), shapes = [], run = true, last = 0;
    function size() { var r = host.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * D; cv.height = H * D; x.setTransform(D, 0, 0, D, 0, 0); }
    function make() { shapes = []; var n = W < 700 ? 14 : 28; for (var i = 0; i < n; i++) shapes.push({ x: Math.random() * W, y: Math.random() * H, r: 18 + Math.random() * 60, n: [3, 4, 6, 0][i % 4], a: Math.random() * 6.28, va: (Math.random() - .5) * .004, vx: (Math.random() - .5) * .22, vy: -.06 - Math.random() * .22, c: ['255,138,128', '150,130,255', '120,200,255', '255,255,255'][i % 4], f: Math.random() < .35 }); }
    function draw(t) {
      if (!run) return; requestAnimationFrame(draw); if (t - last < 33) return; last = t; x.clearRect(0, 0, W, H);
      shapes.forEach(function (s) {
        s.x += s.vx; s.y += s.vy; s.a += s.va; if (s.y < -s.r * 2) { s.y = H + s.r * 2; s.x = Math.random() * W; } if (s.x < -s.r * 2) s.x = W + s.r; if (s.x > W + s.r * 2) s.x = -s.r;
        x.save(); x.translate(s.x, s.y); x.rotate(s.a); x.beginPath();
        if (s.n === 0) x.arc(0, 0, s.r * .7, 0, 6.283); else for (var k = 0; k < s.n; k++) { var an = k / s.n * 6.283 - 1.5708; x[k ? 'lineTo' : 'moveTo'](Math.cos(an) * s.r, Math.sin(an) * s.r); }
        x.closePath(); x.lineWidth = 1.2; x.strokeStyle = 'rgba(' + s.c + ',.34)'; x.stroke(); if (s.f) { x.fillStyle = 'rgba(' + s.c + ',.07)'; x.fill(); } x.restore();
      });
    }
    size(); make(); requestAnimationFrame(draw);
    window.addEventListener('resize', function () { size(); make(); });
    document.addEventListener('visibilitychange', function () { var was = run; run = !document.hidden; if (run && !was) requestAnimationFrame(draw); });
  })();

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
