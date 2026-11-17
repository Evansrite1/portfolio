/* Offline runner: jump over the pillars, duck under the flyers. Everything about it can be changed: the runner (shape, colour, name),
   the world (theme), how fast it gets, how high you jump, the obstacles and the sound. An original game, drawn with shapes. */
(function () {
  'use strict';
  var root = document.getElementById('runner'); if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('rn-cv'), ctx = cv.getContext('2d'), W = 800, H = 260, GROUND = 205;
  var OPT = { shape: 'block', color: '#ff5b52', name: 'Runner', theme: 'day', start: 'normal', accel: 'gentle', jump: 55, gravity: 50, pillars: true, flyers: true, coins: true, sound: true };
  try { Object.assign(OPT, JSON.parse(localStorage.getItem('runner.opt') || '{}')); } catch (e) { /* ignore */ }
  var best = 0; try { best = Number(localStorage.getItem('runner.best') || 0); } catch (e) { /* ignore */ }
  var THEMES = { day: { sky: '#cfe8ff', far: '#b7d3ee', ground: '#8a6d3b', line: '#5b4724', ink: '#223' }, night: { sky: '#0b1020', far: '#16203a', ground: '#232a3b', line: '#394258', ink: '#eaf0ff' },
    desert: { sky: '#ffe7b3', far: '#f3c987', ground: '#d9a45a', line: '#a8742f', ink: '#4a2f10' }, neon: { sky: '#12002b', far: '#2a0a52', ground: '#1b0040', line: '#00f0ff', ink: '#ffffff' },
    forest: { sky: '#cfeed6', far: '#9fd3ac', ground: '#5c8a4a', line: '#3b5f2d', ink: '#123' } };
  var SPEED0 = { easy: 300, normal: 380, fast: 470, crazy: 560 }, ACCEL = { none: 0, gentle: 6, steady: 11, wild: 18 };
  var S, last = 0, raf = 0, audio = null, keys = { duck: false };

  function save() { try { localStorage.setItem('runner.opt', JSON.stringify(OPT)); } catch (e) { /* ignore */ } }
  function beep(f, d, v) { if (!OPT.sound) return; try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); var o = audio.createOscillator(), g = audio.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = v || 0.04; o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + d); } catch (e) { /* ignore */ } }
  function reset() {
    S = { y: 0, vy: 0, duck: false, over: false, running: false, speed: SPEED0[OPT.start], dist: 0, coins: 0, obs: [], nextObs: 1.1, clouds: [{ x: 150, y: 40 }, { x: 480, y: 65 }, { x: 720, y: 30 }], t: 0, hills: 0 };
    $('rn-score').textContent = '0'; $('rn-best').textContent = Math.floor(best); $('rn-msg').textContent = 'Press Space or Up to jump, Down to duck. Tap the screen on a phone.'; draw();
  }
  function jump() {
    if (S.over) { reset(); S.running = true; return; }
    if (!S.running) { S.running = true; $('rn-msg').textContent = ''; }
    if (S.y === 0) { S.vy = 380 + OPT.jump * 6.2; beep(520, 0.08); }
  }
  function spawn() {
    var kinds = []; if (OPT.pillars) kinds.push('pillar', 'tall', 'double'); if (OPT.flyers) kinds.push('flyer'); if (!kinds.length) kinds.push('pillar');
    var k = kinds[Math.floor(Math.random() * kinds.length)], o = { x: W + 30, k: k };
    if (k === 'pillar') { o.w = 26; o.h = 44; } else if (k === 'tall') { o.w = 30; o.h = 66; } else if (k === 'double') { o.w = 58; o.h = 40; } else { o.w = 44; o.h = 24; o.y = Math.random() < 0.5 ? 40 : 14; }
    S.obs.push(o);
    if (OPT.coins && Math.random() < 0.55) S.obs.push({ x: W + 30 + 130 + Math.random() * 120, k: 'coin', w: 14, h: 14, y: 60 + Math.random() * 60 });
    S.nextObs = (0.75 + Math.random() * 0.95) * Math.max(0.55, 380 / S.speed) + 0.25;
  }
  function box() { var h = S.duck && S.y === 0 ? 24 : 42, w = S.duck && S.y === 0 ? 50 : 38; return { x: 70, y: GROUND - S.y - h, w: w, h: h }; }
  function hit(o) {
    var b = box(), ox = o.x, oh = o.h, oy = o.k === 'flyer' || o.k === 'coin' ? GROUND - o.y - o.h : GROUND - o.h;
    var pad = o.k === 'coin' ? 0 : 5;
    return b.x + pad < ox + o.w - pad && b.x + b.w - pad > ox + pad && b.y + pad < oy + oh - pad && b.y + b.h - pad > oy + pad;
  }
  function update(dt) {
    if (!S.running || S.over) return;
    S.t += dt; S.speed += ACCEL[OPT.accel] * dt; S.dist += S.speed * dt / 12;
    var g = 1100 + OPT.gravity * 14;
    if (S.y > 0 || S.vy > 0) { S.vy -= g * dt; S.y += S.vy * dt; if (S.y <= 0) { S.y = 0; S.vy = 0; } }
    S.duck = keys.duck && S.y === 0;
    if (keys.duck && S.y > 0) S.vy -= g * 0.9 * dt;                  /* pressing Down in the air drops faster */
    S.nextObs -= dt; if (S.nextObs <= 0) spawn();
    S.obs.forEach(function (o) { o.x -= S.speed * dt; });
    for (var i = S.obs.length - 1; i >= 0; i--) {
      var o = S.obs[i];
      if (o.x + o.w < -10) { S.obs.splice(i, 1); continue; }
      if (hit(o)) {
        if (o.k === 'coin') { S.coins++; S.dist += 25; S.obs.splice(i, 1); beep(880, 0.06); } else { gameOver(); return; }
      }
    }
    var sc = Math.floor(S.dist); $('rn-score').textContent = sc; if (sc > best) { best = sc; $('rn-best').textContent = best; }
    S.clouds.forEach(function (c) { c.x -= S.speed * dt * 0.15; if (c.x < -60) c.x = W + 40; });
  }
  function gameOver() {
    S.over = true; beep(130, 0.4, 0.07);
    try { localStorage.setItem('runner.best', Math.floor(best)); } catch (e) { /* ignore */ }
    $('rn-msg').textContent = 'Game over. ' + (OPT.name || 'Runner') + ' ran ' + Math.floor(S.dist) + ' and picked up ' + S.coins + ' coins. Press Space or tap to run again.';
  }
  function body(x, y, w, h) {
    ctx.fillStyle = OPT.color;
    if (OPT.shape === 'round') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7); ctx.fill(); }
    else if (OPT.shape === 'triangle') { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill(); }
    else if (OPT.shape === 'rocket') { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.2, y + h * 0.2); ctx.quadraticCurveTo(x + w / 2, y - h * 0.15, x + w * 0.8, y + h * 0.2); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill(); }
    else { ctx.fillRect(x, y, w, h); }
    ctx.fillStyle = '#fff'; ctx.fillRect(x + w * 0.62, y + h * 0.22, 7, 7); ctx.fillStyle = '#111'; ctx.fillRect(x + w * 0.62 + 3, y + h * 0.22 + 2, 4, 4);
  }
  function draw() {
    var T = THEMES[OPT.theme] || THEMES.day;
    ctx.fillStyle = T.sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = T.far; var off = (S.t * 20) % 200; for (var i = -1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(i * 200 - off, GROUND); ctx.lineTo(i * 200 + 90 - off, GROUND - 70); ctx.lineTo(i * 200 + 190 - off, GROUND); ctx.fill(); }
    ctx.fillStyle = OPT.theme === 'night' || OPT.theme === 'neon' ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.75)';
    S.clouds.forEach(function (c) { ctx.beginPath(); ctx.ellipse(c.x, c.y, 34, 12, 0, 0, 7); ctx.ellipse(c.x + 22, c.y - 6, 22, 10, 0, 0, 7); ctx.fill(); });
    ctx.fillStyle = T.ground; ctx.fillRect(0, GROUND, W, H - GROUND); ctx.fillStyle = T.line; ctx.fillRect(0, GROUND, W, 3);
    var gx = (S.t * S.speed) % 40; for (var j = 0; j < W / 40 + 1; j++) ctx.fillRect(j * 40 - gx, GROUND + 14 + (j % 3) * 9, 14, 2);
    S.obs.forEach(function (o) {
      if (o.k === 'coin') { var cy = GROUND - o.y - o.h; ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(o.x + 7, cy + 7, 7, 0, 7); ctx.fill(); ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke(); return; }
      ctx.fillStyle = OPT.theme === 'neon' ? '#00f0ff' : OPT.theme === 'night' ? '#8ea0c8' : '#3a3a3a';
      if (o.k === 'flyer') { var fy = GROUND - o.y - o.h; ctx.beginPath(); ctx.ellipse(o.x + 22, fy + 12, 22, 9, 0, 0, 7); ctx.fill(); var f = Math.sin(S.t * 18) * 9; ctx.beginPath(); ctx.moveTo(o.x + 14, fy + 8); ctx.lineTo(o.x + 4, fy - 6 - f); ctx.lineTo(o.x + 30, fy + 6); ctx.fill(); }
      else if (o.k === 'double') { ctx.fillRect(o.x, GROUND - o.h, 24, o.h); ctx.fillRect(o.x + 34, GROUND - o.h + 6, 24, o.h - 6); }
      else ctx.fillRect(o.x, GROUND - o.h, o.w, o.h);
    });
    var b = box(); body(b.x, b.y, b.w, b.h);
    ctx.fillStyle = T.ink; ctx.font = '700 13px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText(OPT.name || 'Runner', b.x - 4, Math.max(14, b.y - 8));
    if (S.over) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.font = '700 28px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Game over', W / 2, 110); }
  }
  function loop(ts) { var dt = Math.min(0.04, (ts - (last || ts)) / 1000); last = ts; update(dt); draw(); raf = requestAnimationFrame(loop); }
  window.addEventListener('keydown', function (e) {
    if (/INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName)) return;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); jump(); }
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); keys.duck = true; }
  });
  window.addEventListener('keyup', function (e) { if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.duck = false; });
  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); jump(); });
  $('rn-jump').addEventListener('click', jump);
  var dk = $('rn-duck'); dk.addEventListener('pointerdown', function () { keys.duck = true; }); ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { dk.addEventListener(ev, function () { keys.duck = false; }); });
  $('rn-new').addEventListener('click', reset);
  /* the settings */
  function bind(id, key, num) {
    var el = $(id); if (el.type === 'checkbox') el.checked = !!OPT[key]; else el.value = OPT[key];
    el.addEventListener('input', function () { OPT[key] = el.type === 'checkbox' ? el.checked : (num ? Number(el.value) : el.value); save(); if (['start'].indexOf(key) >= 0) reset(); else if (!S.running) draw(); });
  }
  bind('rn-shape', 'shape'); bind('rn-color', 'color'); bind('rn-name', 'name'); bind('rn-theme', 'theme'); bind('rn-start', 'start'); bind('rn-accel', 'accel');
  bind('rn-jumph', 'jump', true); bind('rn-grav', 'gravity', true); bind('rn-pillars', 'pillars'); bind('rn-flyers', 'flyers'); bind('rn-coins', 'coins'); bind('rn-sound', 'sound');
  $('rn-reset').addEventListener('click', function () { try { localStorage.removeItem('runner.opt'); } catch (e) { /* ignore */ } location.reload(); });
  reset(); raf = requestAnimationFrame(loop);
})();
