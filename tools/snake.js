/* Snake page: arrow keys, WASD or swipe. Speed, board size, walls, colours and a high score, kept in this browser. */
(function () {
  'use strict';
  var root = document.getElementById('snake'); if (!root || !window.SnakeCore) return;
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('sn-cv'), ctx = cv.getContext('2d');
  var OPT = { speed: 'normal', size: 'medium', walls: 'solid', skin: '#3ddc84', theme: 'dark', sound: 'on' };
  try { Object.assign(OPT, JSON.parse(localStorage.getItem('snake.opt') || '{}')); } catch (e) { /* ignore */ }
  var best = 0; try { best = Number(localStorage.getItem('snake.best') || 0); } catch (e) { /* ignore */ }
  var SPEEDS = { slow: 150, normal: 105, fast: 70, insane: 45 }, SIZES = { small: 12, medium: 18, large: 26 };
  var THEMES = { dark: ['#101214', '#171a1f', '#ff5b52'], light: ['#f4f5f7', '#e4e7eb', '#d9363e'], forest: ['#0f1f14', '#16291b', '#f5c542'], ocean: ['#0b1c2c', '#10283d', '#ffb347'] };
  var s, want = null, timer = null, paused = false, started = false, audio = null;

  function save() { try { localStorage.setItem('snake.opt', JSON.stringify(OPT)); } catch (e) { /* ignore */ } }
  function beep(f, d) {
    if (OPT.sound !== 'on') return;
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); var o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = f; g.gain.value = 0.05; o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + d); } catch (e) { /* ignore */ }
  }
  function size() { var n = SIZES[OPT.size]; var px = Math.min(560, Math.floor(Math.min(root.clientWidth, window.innerHeight * 0.7) / n) * n); cv.width = cv.height = px; return px / n; }
  function reset() {
    clearInterval(timer); var n = SIZES[OPT.size]; s = SnakeCore.create(n, n, OPT.walls === 'wrap'); want = null; started = false; paused = false;
    $('sn-score').textContent = '0'; $('sn-best').textContent = best; $('sn-msg').textContent = 'Press an arrow key, WASD or swipe to start.'; draw();
  }
  function start() { if (started) return; started = true; $('sn-msg').textContent = ''; clearInterval(timer); timer = setInterval(tick, SPEEDS[OPT.speed]); }
  function tick() {
    if (paused) return;
    var before = s.score; SnakeCore.step(s, want); want = null;
    if (s.score > before) { beep(660, 0.07); $('sn-score').textContent = s.score; if (s.score > best) { best = s.score; $('sn-best').textContent = best; try { localStorage.setItem('snake.best', best); } catch (e) { /* ignore */ } } }
    draw();
    if (!s.alive) { clearInterval(timer); beep(140, 0.35); var full = s.food === null; $('sn-msg').textContent = (full ? 'You filled the whole board. ' : 'Game over. ') + 'Score ' + s.score + '. Press Space or the button to play again.'; started = false; }
  }
  function draw() {
    var c = size(), n = SIZES[OPT.size], T = THEMES[OPT.theme] || THEMES.dark;
    ctx.fillStyle = T[0]; ctx.fillRect(0, 0, cv.width, cv.height);
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if ((x + y) % 2) { ctx.fillStyle = T[1]; ctx.fillRect(x * c, y * c, c, c); }
    if (OPT.walls === 'solid') { ctx.strokeStyle = T[2]; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, cv.width - 3, cv.height - 3); }
    if (s.food) { ctx.fillStyle = T[2]; ctx.beginPath(); ctx.arc((s.food.x + 0.5) * c, (s.food.y + 0.5) * c, c * 0.36, 0, 7); ctx.fill(); }
    s.snake.forEach(function (p, i) {
      ctx.globalAlpha = s.alive ? 1 : 0.5; ctx.fillStyle = OPT.skin;
      var pad = i === 0 ? 1 : 2; ctx.fillRect(p.x * c + pad, p.y * c + pad, c - pad * 2, c - pad * 2);
      if (i === 0) { ctx.fillStyle = '#101214'; var e = c * 0.14; ctx.fillRect(p.x * c + c * 0.25, p.y * c + c * 0.3, e, e); ctx.fillRect(p.x * c + c * 0.62, p.y * c + c * 0.3, e, e); }
    });
    ctx.globalAlpha = 1;
  }
  function dir(d) { if (!s.alive) return; want = d; start(); }
  window.addEventListener('keydown', function (e) {
    var m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' }[e.key];
    if (m) { if (/INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName)) return; e.preventDefault(); dir(m); }
    else if (e.key === ' ' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test((document.activeElement || {}).tagName)) { e.preventDefault(); if (!s.alive || !started) { reset(); } else { paused = !paused; $('sn-msg').textContent = paused ? 'Paused. Press Space to carry on.' : ''; } }
  });
  var sx = 0, sy = 0;
  cv.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener('touchend', function (e) { var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return; dir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); }, { passive: true });
  cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  [].forEach.call(document.querySelectorAll('[data-sd]'), function (b) { b.addEventListener('click', function () { dir(b.dataset.sd); }); });
  $('sn-new').addEventListener('click', reset);
  $('sn-pause').addEventListener('click', function () { if (started) { paused = !paused; $('sn-msg').textContent = paused ? 'Paused.' : ''; } });
  function bind(id, key, pretty) {
    var el = $(id); el.value = OPT[key];
    el.addEventListener('change', function () { OPT[key] = el.value; save(); if (key === 'speed' && started) { clearInterval(timer); timer = setInterval(tick, SPEEDS[OPT.speed]); } else reset(); });
  }
  bind('sn-speed', 'speed'); bind('sn-size', 'size'); bind('sn-walls', 'walls'); bind('sn-theme', 'theme'); bind('sn-sound', 'sound');
  $('sn-skin').value = OPT.skin; $('sn-skin').addEventListener('input', function () { OPT.skin = $('sn-skin').value; save(); draw(); });
  window.addEventListener('resize', draw);
  reset();
})();
