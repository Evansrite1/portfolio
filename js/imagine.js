/* imagine.js : the word "imagine." in the hero headline keeps changing style.
   27 animations, many of them driven letter by letter: letters flying together,
   spiralling in, twinkling stars, standing up as capitals, scrambling, floating
   away from your cursor, and more. Click the word for the next one.            */
(function () {
  'use strict';

  var h1 = document.querySelector('.hero h1');
  var em = h1 && h1.querySelector('em');
  if (!em) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var WORD = (em.textContent || 'imagine.').trim();
  var FX = ['assemble', 'sparkle', 'glitch', 'neon', 'aurora', 'wave', 'mixed', 'spiral', 'caps', 'flip',
            'shimmer', 'bounce', 'liquid', 'jelly', 'magnet', 'blur', 'outline', 'scramble', 'spin', 'spread',
            'extrude', 'sign', 'rise', 'pop', 'rainbow', 'type', 'rumble'];
  if (!finePointer) FX = FX.filter(function (n) { return n !== 'magnet'; });

  /* split the word into letters so each one can animate on its own */
  em.className = 'tx';
  em.setAttribute('aria-label', WORD);
  em.setAttribute('data-text', WORD);
  em.setAttribute('title', 'Click for another style');
  em.setAttribute('tabindex', '0');
  em.innerHTML = '';
  var letters = [];
  function rnd(a, b) { return a + Math.random() * (b - a); }
  WORD.split('').forEach(function (ch, i) {
    var s = document.createElement('span');
    s.className = 'ch'; s.setAttribute('aria-hidden', 'true');
    s.style.setProperty('--i', i);
    /* random start positions for the "assemble" style */
    s.style.setProperty('--x', rnd(-3.2, 3.2).toFixed(2) + 'em');
    s.style.setProperty('--y', rnd(-2.2, 2.2).toFixed(2) + 'em');
    s.style.setProperty('--r', rnd(-220, 220).toFixed(0) + 'deg');
    s.textContent = ch;
    em.appendChild(s); letters.push(s);
  });
  /* little stars for the "sparkle" style */
  for (var k = 0; k < 14; k++) {
    var sp = document.createElement('i');
    sp.className = 'spk'; sp.setAttribute('aria-hidden', 'true');
    sp.style.left = rnd(-6, 100).toFixed(1) + '%';
    sp.style.top = rnd(-30, 100).toFixed(1) + '%';
    sp.style.setProperty('--d', rnd(0, 1.7).toFixed(2));
    var sz = rnd(0.12, 0.3).toFixed(2) + 'em'; sp.style.width = sz; sp.style.height = sz;
    em.appendChild(sp);
  }

  /* keep the headline from reflowing while styles change */
  function lockWidth() {
    em.style.minWidth = '';
    var w = em.getBoundingClientRect().width;
    if (w) em.style.minWidth = Math.ceil(w) + 'px';
  }
  function freeOverflow() {
    var box = em.closest('.w');
    if (box) box.style.overflow = 'visible';
  }

  /* ---------- scramble: letters flicker through random characters, then settle ---------- */
  var POOL = 'abcdefghijklmnopqrstuvwxyz!?#%&*';
  var scrambleTimer = null;
  function resetText() { letters.forEach(function (l, i) { l.textContent = WORD.charAt(i); }); }
  function startScramble() {
    var t0 = Date.now();
    scrambleTimer = setInterval(function () {
      var t = Date.now() - t0;
      letters.forEach(function (l, i) {
        l.textContent = t > 500 + i * 130 ? WORD.charAt(i) : POOL.charAt(Math.floor(Math.random() * POOL.length));
      });
      if (t > 500 + letters.length * 130 + 200) { clearInterval(scrambleTimer); scrambleTimer = null; }
    }, 55);
  }

  /* ---------- capitals: letters stand up one at a time ---------- */
  var capTimers = [];
  function stopCaps() {
    capTimers.forEach(clearTimeout); capTimers = [];
    letters.forEach(function (l) { l.classList.remove('up'); });
  }
  function startCaps() {
    letters.forEach(function (l, i) {
      capTimers.push(setTimeout(function () { l.classList.add('up'); }, 250 + i * 170));
      capTimers.push(setTimeout(function () { l.classList.remove('up'); }, 2000 + i * 110));
    });
  }

  /* ---------- magnet: letters move away from the cursor ---------- */
  function resetMagnet() { letters.forEach(function (l) { l.style.setProperty('--mx', '0px'); l.style.setProperty('--my', '0px'); }); }
  document.addEventListener('mousemove', function (e) {
    if (em.getAttribute('data-tx') !== 'magnet') return;
    letters.forEach(function (l) {
      var r = l.getBoundingClientRect();
      var dx = r.left + r.width / 2 - e.clientX, dy = r.top + r.height / 2 - e.clientY;
      var d = Math.sqrt(dx * dx + dy * dy) || 1, R = 170;
      if (d < R) {
        var push = (1 - d / R) * 46;
        l.style.setProperty('--mx', (dx / d * push).toFixed(1) + 'px');
        l.style.setProperty('--my', (dy / d * push).toFixed(1) + 'px');
      } else { l.style.setProperty('--mx', '0px'); l.style.setProperty('--my', '0px'); }
    });
  }, { passive: true });

  /* ---------- cycling ---------- */
  var idx = 0, timer = null, paused = false;
  function show(n) {
    idx = (n + FX.length) % FX.length;
    if (scrambleTimer) { clearInterval(scrambleTimer); scrambleTimer = null; }
    stopCaps(); resetText(); resetMagnet();
    var name = FX[idx];
    em.setAttribute('data-tx', name);
    if (reduced) return;
    if (name === 'scramble') startScramble();
    if (name === 'caps') startCaps();
  }
  function next() { show(idx + 1); restart(); }
  function restart() {
    if (timer) clearInterval(timer);
    if (reduced) return;
    timer = setInterval(function () { if (!paused && !document.hidden) show(idx + 1); }, 3400);
  }

  em.addEventListener('click', next);
  em.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); }
  });
  em.addEventListener('mouseenter', function () { paused = true; });
  em.addEventListener('mouseleave', function () { paused = false; });

  /* start once the headline has finished its entrance */
  var delay = document.documentElement.classList.contains('loading') ? 3200 : 1700;
  setTimeout(function () {
    lockWidth();
    freeOverflow();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(lockWidth);
    show(0);
    restart();
  }, delay);
  window.addEventListener('resize', lockWidth);
})();
