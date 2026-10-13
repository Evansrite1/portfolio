/* ambient.js : a quiet moving background.
   - tiny twinkling stars, with a shooting star every so often
   - slow drifting icons that a client would recognise: AI, Next.js, React, Vercel,
     cloud, sales, payments, bookings, reviews
   - small "payment received" style notifications rising at the sides on wide screens
   Everything is faint, sits behind the content, and stops for reduced motion.      */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var anchor = document.querySelector('.bg-anim');
  var parent = document.body;

  /* ------------------------------------------------------------ icons (simplified marks, not official logo files) */
  var ICONS = {
    ai: '<g>' + [0, 60, 120, 180, 240, 300].map(function (a) { return '<rect x="9.2" y="2.4" width="5.6" height="10.6" rx="2.8" transform="rotate(' + a + ' 12 12)"/>'; }).join('') + '</g>',
    next: '<circle cx="12" cy="12" r="10"/><path d="M8.6 16.6V7.4l7.2 9.9"/><path d="M15.4 7.4v5"/>',
    react: '<ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/><circle class="fill" cx="12" cy="12" r="1.7"/>',
    vercel: '<path class="fill" d="M12 4 22 20H2z"/>',
    cloud: '<path d="M7 19a4.5 4.5 0 0 1-.6-8.96A6.5 6.5 0 0 1 19 9.5 4.8 4.8 0 0 1 18 19z"/>',
    dollar: '<circle cx="12" cy="12" r="10"/><path d="M15 9.2c-.4-1-1.6-1.7-3-1.7-1.7 0-3 .9-3 2.2s1.1 1.9 3 2.3 3 1 3 2.4-1.3 2.2-3 2.2c-1.5 0-2.7-.7-3.2-1.8M12 5.5v13"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    chart: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>',
    mail: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    ring: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    rocket: '<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2M12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2zM9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
    receipt: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>'; }

  /* name, left %, top %, size px, opacity, drift x, drift y, rotation from, rotation to, seconds, accent colour?, scroll depth */
  var FLOATS = [
    ['ai', 7, 14, 56, 0.16, 26, 34, -8, 14, 34, 0, 0.6],
    ['next', 90, 17, 50, 0.15, -22, 28, 6, -10, 38, 0, 0.9],
    ['cloud', 14, 62, 70, 0.11, 40, -20, 0, 6, 46, 0, 0.5],
    ['dollar', 82, 56, 46, 0.17, -18, -34, -10, 12, 30, 1, 1.1],
    ['cart', 5, 84, 42, 0.13, 22, -26, 8, -8, 36, 0, 0.7],
    ['chart', 93, 79, 54, 0.15, -26, -22, 0, -8, 32, 1, 0.8],
    ['calendar', 24, 30, 36, 0.1, 18, 22, -6, 10, 40, 0, 1.3],
    ['chat', 76, 33, 42, 0.12, -20, 26, 5, -9, 35, 0, 0.6],
    ['mail', 47, 9, 34, 0.1, 30, 16, -14, 6, 44, 0, 0.4],
    ['card', 66, 89, 42, 0.11, -24, -18, 6, -6, 37, 0, 1.0],
    ['bell', 34, 91, 30, 0.1, 14, -30, -12, 12, 28, 1, 0.8],
    ['tag', 88, 41, 38, 0.12, -16, 30, 10, -4, 33, 0, 0.5],
    ['react', 40, 71, 48, 0.09, 26, 20, 0, 24, 52, 0, 1.2],
    ['vercel', 56, 51, 28, 0.08, -18, -14, 0, 8, 41, 0, 0.7],
    ['zap', 10, 41, 36, 0.12, 12, 34, -8, 8, 29, 1, 1.0],
    ['star', 70, 12, 32, 0.12, -14, 24, 0, 30, 31, 1, 0.6],
    ['ring', 20, 8, 42, 0.1, 22, 18, 0, 0, 39, 0, 0.4],
    ['lock', 60, 30, 28, 0.07, 14, -20, 4, -6, 45, 0, 1.2],
    ['code', 29, 54, 34, 0.08, -22, 16, -4, 8, 43, 0, 0.9],
    ['rocket', 78, 70, 42, 0.1, -20, -36, 0, -6, 34, 0, 1.1]
  ];

  var stars = document.createElement('canvas');
  stars.className = 'bg-stars'; stars.setAttribute('aria-hidden', 'true');
  var layer = document.createElement('div');
  layer.className = 'bg-float'; layer.setAttribute('aria-hidden', 'true');

  FLOATS.forEach(function (f, i) {
    var el = document.createElement('div');
    el.className = 'fi' + (f[10] ? ' hot' : '');
    el.style.setProperty('--x', f[1] + '%'); el.style.setProperty('--y', f[2] + '%');
    el.style.setProperty('--s', f[3] + 'px'); el.style.setProperty('--o', f[4]);
    el.style.setProperty('--dx', f[5] + 'px'); el.style.setProperty('--dy', f[6] + 'px');
    el.style.setProperty('--r0', f[7] + 'deg'); el.style.setProperty('--r1', f[8] + 'deg');
    el.style.setProperty('--t', f[9] + 's'); el.style.setProperty('--dp', f[11]);
    el.style.setProperty('--dl', (-i * 2.3).toFixed(1) + 's');
    el.innerHTML = svg(f[0]);
    layer.appendChild(el);
  });

  if (anchor && anchor.nextSibling) { parent.insertBefore(stars, anchor.nextSibling); parent.insertBefore(layer, stars.nextSibling); }
  else { parent.insertBefore(layer, parent.firstChild); parent.insertBefore(stars, parent.firstChild); }

  /* ------------------------------------------------------------ gentle scroll drift */
  if (!reduced) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        layer.style.setProperty('--sy', (-window.pageYOffset * 0.07).toFixed(1) + 'px');
        ticking = false;
      });
    }, { passive: true });
  }

  /* ------------------------------------------------------------ stars */
  var ctx = stars.getContext('2d');
  var W = 0, H = 0, dpr = 1, field = [], shoot = null, nextShoot = 0, rgb = '255,255,255';

  function readColor() {
    var c = (getComputedStyle(document.documentElement).getPropertyValue('--ink') || '').trim();
    var m = /^#([0-9a-f]{6})$/i.exec(c);
    if (m) { var n = parseInt(m[1], 16); rgb = ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255); }
  }
  function seed() {
    var n = Math.round(Math.min(150, (W * H) / 9500));
    field = [];
    for (var i = 0; i < n; i++) {
      field.push({
        x: Math.random() * W, y: Math.random() * H,
        r: 0.4 + Math.random() * 1.1, a: 0.25 + Math.random() * 0.55,
        t: Math.random() * 6.28, s: 0.5 + Math.random() * 1.5,
        vx: (Math.random() - 0.5) * 0.06, vy: (Math.random() - 0.5) * 0.04
      });
    }
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    stars.width = Math.round(W * dpr); stars.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed(); readColor();
    if (reduced) draw(0, 0);
  }

  function draw(dt, now) {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < field.length; i++) {
      var s = field[i];
      s.t += s.s * dt; s.x += s.vx; s.y += s.vy;
      if (s.x < -2) s.x = W + 2; else if (s.x > W + 2) s.x = -2;
      if (s.y < -2) s.y = H + 2; else if (s.y > H + 2) s.y = -2;
      var a = s.a * (0.55 + 0.45 * Math.sin(s.t));
      ctx.fillStyle = 'rgba(' + rgb + ',' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
      if (s.r > 1.2) {
        ctx.strokeStyle = 'rgba(' + rgb + ',' + (a * 0.5).toFixed(3) + ')';
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(s.x - 3, s.y); ctx.lineTo(s.x + 3, s.y); ctx.moveTo(s.x, s.y - 3); ctx.lineTo(s.x, s.y + 3); ctx.stroke();
      }
    }
    if (!reduced) {
      if (!shoot && now > nextShoot) {
        shoot = { x: Math.random() * W * 0.8, y: Math.random() * H * 0.35, life: 0 };
        nextShoot = now + 7000 + Math.random() * 7000;
      }
      if (shoot) {
        shoot.life += dt; shoot.x += 520 * dt; shoot.y += 280 * dt;
        var fade = Math.max(0, 1 - shoot.life / 0.9);
        var g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - 120, shoot.y - 65);
        g.addColorStop(0, 'rgba(' + rgb + ',' + (0.85 * fade).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - 120, shoot.y - 65); ctx.stroke();
        if (shoot.life > 0.9) shoot = null;
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { setTimeout(readColor, 50); });
  } catch (e) {}

  if (!reduced) {
    var last = performance.now();
    nextShoot = last + 4000;
    (function loop(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!document.hidden) draw(dt, now);
      requestAnimationFrame(loop);
    })(last);
  }

  /* ------------------------------------------------------------ sales notifications (wide screens only) */
  var TOASTS = [
    ['New booking confirmed', 'calendar'], ['Invoice paid', 'receipt'], ['New lead replied in seconds', 'zap'],
    ['5-star review received', 'star'], ['Order received', 'cart'], ['Payment received', 'dollar'],
    ['Client portal login', 'lock'], ['Follow-up sent automatically', 'mail']
  ];
  if (!reduced) {
    var live = 0, n = 0;
    setInterval(function () {
      if (document.hidden || live >= 3) return;
      var gutter = (window.innerWidth - 1080) / 2;
      if (gutter < 190) return;
      var t = TOASTS[n++ % TOASTS.length];
      var el = document.createElement('div');
      el.className = 'bg-toast';
      el.innerHTML = '<i>' + svg(t[1]) + '</i>' + t[0];
      var left = (n % 2 === 0);
      var pos = 12 + Math.random() * Math.max(0, gutter - 215);
      if (left) el.style.left = pos + 'px'; else el.style.right = pos + 'px';
      layer.appendChild(el); live++;
      el.addEventListener('animationend', function () { if (el.parentNode) el.parentNode.removeChild(el); live--; });
    }, 5200);
  }
})();
