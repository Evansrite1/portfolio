/* Home page, round two: the circle of things I build (it picks one by itself and stops when you point at one), the phone menu, and the
   embedded systems button (expands once, shrinks to a circle, opens a full screen note). */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- the circle */
  var ITEMS = [
    { t: 'Browser games', c: '#ff5b52', p: 'Games that run right in the browser, with no download. I have built four so far: a live multiplayer quiz, tic-tac-toe with three levels of smartness, snake and a runner you can customise.', a: 'Play them', h: '/tools/tic-tac-toe/' },
    { t: 'Mini web apps', c: '#3f6fd1', p: 'Small, sharp tools that do one job very well. More than twenty are live and free to use, from a QR code maker to a weather page and a video trimmer.', a: 'Open the tools', h: '/tools/' },
    { t: 'Full web apps', c: '#9b6bff', p: 'Whole products with accounts, roles and data behind them: a client portal for a construction company and a membership platform with a learning journey.', a: 'See CareTRAC', h: '/work/caretrac.html' },
    { t: 'Dashboards', c: '#2fbf71', p: 'One screen that shows how the business is doing: live numbers, charts and the things that need you today. My outreach apps each ship with their own live statistics.', a: 'See a dashboard app', h: '/tools/mailer/' },
    { t: 'Business websites', c: '#ffb347', p: 'A website that explains what you do, looks like you mean it and turns visitors into enquiries. I have built live sites and concept builds for businesses before we talked.', a: 'See recent websites', h: '/work/' },
    { t: 'Landing pages', c: '#ff7ad9', p: 'One page, one goal. A fast, focused page for a launch, an offer or a campaign, written to make the next step obvious.', a: 'See a concept page', h: '/maisongray/' },
    { t: 'Everyday tools', c: '#22c4d6', p: 'The useful little things people reach for every day: invoices and receipts, currency conversion, PDF tools, a colour picker, a business card maker.', a: 'Try the everyday tools', h: '/tools/invoice-receipt-generator/' },
    { t: 'Entertainment apps', c: '#ff8a3d', p: 'Things people open for fun: quizzes you can host live with friends, games, a music keyboard and a video editor.', a: 'Try QuizBlast', h: '/tools/quiz-live/' },
    { t: 'Extensions and bots', c: '#e8d44d', p: 'Chrome extensions and chat bots that save a click or a conversation. The colour picker works on any pixel of your screen, and I build Slack and automation bots for clients.', a: 'See the extension', h: '/tools/color-picker/' },
    { t: 'Desktop and mobile apps', c: '#5fd3a0', p: 'Apps you install. Nine of mine are installable on Windows and Mac, and the web tools work well on a phone. Native phone apps are something we can plan together.', a: 'See the apps', h: '/tools/' },
    { t: 'Creative visual projects', c: '#c06cff', p: 'Design-led builds: an audio studio, a video editor with automatic captions, a digital business card, motion-rich concept sites.', a: 'See the video editor', h: '/tools/video-editor/' }
  ];
  var orbit = document.getElementById('orbit');
  if (orbit) {
    var core = document.getElementById('orbit-core'), ct = core.querySelector('h3'), cp = core.querySelector('p'), ca = core.querySelector('a');
    var spoke = orbit.querySelector('svg.spoke line'), nodes = [], cur = -1, timer = 0, held = false;
    ITEMS.forEach(function (it, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'orbit-node'; b.style.setProperty('--c', it.c);
      var ang = (i / ITEMS.length) * Math.PI * 2 - Math.PI / 2;
      b.dataset.x = (50 + 44 * Math.cos(ang)).toFixed(2); b.dataset.y = (50 + 44 * Math.sin(ang)).toFixed(2);
      b.innerHTML = '<i></i><span>' + it.t + '</span>';
      b.addEventListener('mouseenter', function () { held = true; show(i); });
      b.addEventListener('focus', function () { held = true; show(i); });
      b.addEventListener('click', function () { held = true; show(i); });
      orbit.appendChild(b); nodes.push(b);
    });
    function place() {
      var wide = window.innerWidth > 760;
      nodes.forEach(function (b) { if (wide) { b.style.left = b.dataset.x + '%'; b.style.top = b.dataset.y + '%'; } else { b.style.left = ''; b.style.top = ''; } });
    }
    function show(i) {
      if (i === cur) return; cur = i; var it = ITEMS[i];
      nodes.forEach(function (n, k) { n.classList.toggle('on', k === i); n.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
      core.classList.add('swap');
      setTimeout(function () { ct.textContent = it.t; cp.textContent = it.p; ca.textContent = it.a; ca.setAttribute('href', it.h); core.style.setProperty('--c', it.c); core.classList.remove('swap'); }, 160);
      if (spoke) { var n = nodes[i]; spoke.setAttribute('x2', n.dataset.x); spoke.setAttribute('y2', n.dataset.y); spoke.style.stroke = it.c; }
    }
    function next() { var i; do { i = Math.floor(Math.random() * ITEMS.length); } while (i === cur && ITEMS.length > 1); show(i); }
    function loop() { clearInterval(timer); if (reduced) return; timer = setInterval(function () { if (!held && !document.hidden) next(); }, 3200); }
    orbit.addEventListener('mouseleave', function () { held = false; });
    orbit.addEventListener('focusout', function () { setTimeout(function () { if (!orbit.contains(document.activeElement)) held = false; }, 50); });
    window.addEventListener('resize', place); place(); show(0); loop();
  }

  /* ---------------------------------------------------------------- phone menu */
  var tg = document.getElementById('nav-toggle'), nav = document.querySelector('nav.site');
  if (tg && nav) {
    function setNav(o) { nav.classList.toggle('open', o); tg.setAttribute('aria-expanded', o ? 'true' : 'false'); document.documentElement.style.overflow = o ? 'hidden' : ''; tg.innerHTML = o ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'; }
    tg.addEventListener('click', function () { setNav(!nav.classList.contains('open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setNav(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });
  }

  /* ---------------------------------------------------------------- embedded systems */
  var btn = document.getElementById('efab-btn'), full = document.getElementById('efab-full');
  if (btn && full) {
    setTimeout(function () { btn.classList.add('compact'); }, reduced ? 100 : 4200);
    function open(o) {
      full.classList.toggle('open', o); full.setAttribute('aria-hidden', o ? 'false' : 'true'); btn.setAttribute('aria-expanded', o ? 'true' : 'false');
      document.documentElement.style.overflow = o ? 'hidden' : ''; if (o) full.querySelector('.x').focus(); else btn.focus();
    }
    btn.addEventListener('click', function () { open(true); });
    full.querySelector('.x').addEventListener('click', function () { open(false); });
    full.addEventListener('click', function (e) { if (e.target === full) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && full.classList.contains('open')) open(false); });
    document.addEventListener('click', function (e) { var a = e.target.closest('a[href="#embedded"]'); if (a) { e.preventDefault(); open(true); } });
    if (location.hash === '#embedded') open(true);
  }
})();
