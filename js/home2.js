/* Home page, round three: the oval of things I build (it picks one by itself, stops when you point at one, and opens examples when you
   click), the phone menu, and the embedded systems button. */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function svg(p) { return '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var ART = {
    game: svg('<rect x="6" y="20" width="52" height="28" rx="14"/><path d="M20 28v12M14 34h12"/><circle cx="42" cy="30" r="2.5"/><circle cx="48" cy="37" r="2.5"/>'),
    web: svg('<rect x="6" y="10" width="52" height="44" rx="5"/><path d="M6 22h52M14 16h.1M20 16h.1M26 16h.1M16 32h14v14H16zM36 32h12M36 38h12M36 44h8"/>'),
    dash: svg('<rect x="6" y="8" width="52" height="48" rx="5"/><path d="M14 44V34M24 44V24M34 44V30M44 44V18"/><path d="M12 50h40"/>'),
    site: svg('<rect x="6" y="8" width="52" height="48" rx="5"/><path d="M6 20h52M14 28h20v10H14zM40 28h10M40 34h10M14 46h36"/>'),
    tool: svg('<path d="M40 8a14 14 0 0 0-12 20L8 48l8 8 20-20a14 14 0 0 0 20-12l-9 9-8-2-2-8z"/>'),
    play: svg('<circle cx="32" cy="32" r="24"/><path d="M26 22l16 10-16 10z"/>'),
    ext: svg('<path d="M24 10h16v10a6 6 0 1 1 0 12v0h10v16H36v-6a6 6 0 1 0-12 0v6H10V32h10a6 6 0 1 0 0-12H10V10z" transform="translate(0 2) scale(.95)"/>'),
    app: svg('<rect x="4" y="12" width="40" height="30" rx="3"/><path d="M14 50h20M24 42v8"/><rect x="44" y="22" width="16" height="30" rx="3"/><path d="M50 47h4"/>'),
    art: svg('<path d="M32 6l5 15 15 5-15 5-5 15-5-15-15-5 15-5z"/><path d="M50 40l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>')
  };
  var ITEMS = [
    { t: 'Games', c: '#ff5b52', art: 'game', p: 'Proper games that run in the browser, with no download. A live multiplayer quiz, tic-tac-toe with three levels of smartness, snake and a runner you can customise.',
      ex: [['QuizBlast', 'Host a live quiz with a game PIN, teams and a podium', '/tools/quiz-live/'], ['Tic-tac-toe', 'Easy, hard and very hard, or two players', '/tools/tic-tac-toe/'], ['Snake', 'Speeds, boards, walls and your own colours', '/tools/snake/'], ['Offline runner', 'Jump and duck, and design everything about it', '/tools/offline-runner/']] },
    { t: 'Web apps', c: '#9b6bff', art: 'web', p: 'From a small tool that does one job well to a whole product with accounts, roles and data behind it. I have built both kinds.',
      ex: [['CareTRAC', 'A client portal for a construction company: progress, photos, approvals and messages', '/work/caretrac.html'], ['Billionaire Club', 'A membership platform with a Learn, Build, Lead journey', '/work/billionaire-club.html'], ['QuizBlast', 'A live quiz platform with a host screen and player screens', '/tools/quiz-live/'], ['Invoice and receipt generator', '51 designs, PDF download, no sign-up', '/tools/invoice-receipt-generator/'], ['Video editor', 'Cut, auto captions and export, all in the browser', '/tools/video-editor/'], ['Weather', 'Any place in the world, now and 7 days ahead', '/tools/weather/']] },
    { t: 'Dashboards', c: '#2fbf71', art: 'dash', p: 'One screen that shows how the business is doing: live numbers, charts and the things that need you today. Here is a sample, with made-up numbers.', sample: true,
      ex: [['Outreach Mailer', 'Live sent, opened, replied and bounced numbers for up to 25 mailboxes', '/tools/mailer/'], ['IG Outreach', 'Statistics for the whole outreach and for each Instagram account', '/tools/ig-outreach/'], ['Crypto prices', 'A live price table with charts and a watchlist', '/tools/crypto-prices/']] },
    { t: 'Websites and landing pages', c: '#ffb347', art: 'site', p: 'A site that explains what you do and brings in enquiries, or a single focused page for a launch, an offer or a campaign.',
      ex: [['Natasha Cadman', 'Photographer: filterable portfolio, quiz and booking flow', '/natashacadman/'], ['Dinero en Orden', 'A Spanish-language site for a financial educator', '/dineroenorden/'], ['Maison Gray', 'Luxury custom homes, Chicago', '/maisongray/'], ['More recent websites', 'All fifteen builds on one page', '/work/']] },
    { t: 'Everyday tools', c: '#22c4d6', art: 'tool', p: 'The useful little things people reach for every day, free and without a sign-up.',
      ex: [['Invoice and receipt generator', '', '/tools/invoice-receipt-generator/'], ['Currency calculator', '160 currencies', '/tools/currency-calculator/'], ['PDF converter', '', '/tools/pdf-converter/'], ['QR code generator', '', '/tools/qr-code-generator/'], ['Digital business card', '', '/tools/business-card/'], ['Weather and crypto prices', '', '/tools/weather/']] },
    { t: 'Entertainment apps', c: '#ff8a3d', art: 'play', p: 'Things people open for fun: quizzes, games, a music keyboard that finds the key of a song, and a video editor.',
      ex: [['QuizBlast', 'Live quizzes with friends or a class', '/tools/quiz-live/'], ['Choir Assistant', 'A keyboard, a key finder and a chord breakdown', '/tools/choir-assistant/'], ['Video editor', 'Auto edit with captions and transitions', '/tools/video-editor/'], ['Audio by Evans Large', 'A music studio for Windows and Mac', '/tools/audio-mastering/']] },
    { t: 'Extensions and bots', c: '#e8d44d', art: 'ext', p: 'Chrome extensions and chat bots that save a click or a conversation.',
      ex: [['Color Picker extension', 'Pick the colour of any pixel on your screen', '/tools/color-picker/'], ['Slack and automation bots', 'Built for clients, with n8n and custom code', '/solutions.html']] },
    { t: 'Desktop and mobile apps', c: '#5fd3a0', art: 'app', p: 'Apps you install. Nine of mine run on Windows and Mac, and the web tools work well on a phone. Native phone apps are something we can plan together.',
      ex: [['IG Outreach', 'Send Instagram messages from up to 10 accounts', '/tools/ig-outreach/'], ['Outreach Mailer', '25 Gmail accounts with a full inbox', '/tools/mailer/'], ['Large Lead Finder', 'Leads for 126 niches in any country', '/tools/large-lead-finder/'], ['Screen Recorder', 'Record any window, saved on your computer', '/tools/screen-recorder/'], ['Color Picker', 'Pick any pixel on the screen', '/tools/color-picker/'], ['Audio by Evans Large', 'A music studio', '/tools/audio-mastering/'], ['File Share', 'Send big files between computers', '/tools/send-app/']] },
    { t: 'Creative visual projects', c: '#c06cff', art: 'art', p: 'Design-led builds with motion: a video editor with automatic captions, a business card maker, an audio studio and concept sites.',
      ex: [['Video editor', 'Auto edit, 27 caption looks, transitions', '/tools/video-editor/'], ['Digital business card', 'Eight styles, QR code, PDF and share link', '/tools/business-card/'], ['Natasha Cadman concept site', 'Editorial photography, rebuilt', '/natashacadman/']] }
  ];

  /* ------------------------------------------------------------ the sample dashboard, with made-up numbers */
  function dashboard() {
    var pts = [14, 22, 18, 30, 26, 38, 34, 46, 42, 55, 49, 63], max = 70, w = 300, h = 90;
    var line = pts.map(function (v, i) { return (i / (pts.length - 1) * w).toFixed(1) + ',' + (h - v / max * h).toFixed(1); }).join(' ');
    var bars = [40, 62, 48, 80, 66, 90, 58].map(function (v, i) { return '<i style="height:' + v + '%;animation-delay:' + (i * 0.08) + 's"></i>'; }).join('');
    return '<div class="dsb"><div class="dsb-top"><b>Sample dashboard</b><span>Made-up numbers, to show what one can look like</span></div>' +
      '<div class="dsb-kpis"><div><span>Revenue</span><b data-n="48250" data-p="$">$0</b><em class="up">+12.4%</em></div><div><span>Orders</span><b data-n="1284" data-p="">0</b><em class="up">+8.1%</em></div><div><span>Visitors</span><b data-n="23910" data-p="">0</b><em class="up">+19.6%</em></div><div><span>Conversion</span><b data-n="54" data-p="" data-s="%" data-d="1">0%</b><em class="dn">-0.4%</em></div></div>' +
      '<div class="dsb-row"><div class="dsb-card"><span>Revenue, last 12 weeks</span><svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fbf71" stop-opacity=".35"/><stop offset="1" stop-color="#2fbf71" stop-opacity="0"/></linearGradient></defs>' +
      '<polygon points="0,' + h + ' ' + line + ' ' + w + ',' + h + '" fill="url(#dg)"/><polyline class="dsb-line" points="' + line + '" fill="none" stroke="#2fbf71" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg></div>' +
      '<div class="dsb-card"><span>Orders by day</span><div class="dsb-bars">' + bars + '</div></div>' +
      '<div class="dsb-card"><span>Latest activity</span><ul class="dsb-feed"><li><i></i>New order from Lagos</li><li><i></i>Invoice 0042 paid</li><li><i></i>Booking confirmed for Friday</li><li><i></i>Reply from a new lead</li></ul></div></div></div>';
  }
  function countUp(root) {
    [].forEach.call(root.querySelectorAll('[data-n]'), function (el) {
      var to = parseFloat(el.dataset.n), p = el.dataset.p || '', sfx = el.dataset.s || '', dec = Number(el.dataset.d || 0), t0 = performance.now();
      function f(t) { var k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3), v = to * e; el.textContent = p + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + sfx; if (k < 1) requestAnimationFrame(f); }
      if (reduced) el.textContent = p + (dec ? to.toFixed(dec) : to.toLocaleString()) + sfx; else requestAnimationFrame(f);
    });
  }

  /* ------------------------------------------------------------ the oval */
  var orbit = document.getElementById('orbit');
  if (orbit) {
    var core = document.getElementById('orbit-core'), ct = core.querySelector('h3'), cp = core.querySelector('p'), art = core.querySelector('.oc-art'), more = document.getElementById('orbit-more');
    var openBtn = document.getElementById('oc-more'), nodes = [], cur = -1, timer = 0, held = false, opened = -1;
    ITEMS.forEach(function (it, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'orbit-node'; b.style.setProperty('--c', it.c); b.textContent = it.t;
      var ang = (i / ITEMS.length) * Math.PI * 2 - Math.PI / 2;
      b.dataset.x = (50 + 47 * Math.cos(ang)).toFixed(2); b.dataset.y = (50 + 44 * Math.sin(ang)).toFixed(2);
      b.addEventListener('mouseenter', function () { held = true; show(i); });
      b.addEventListener('focus', function () { held = true; show(i); });
      b.addEventListener('click', function () { held = true; show(i); openMore(i); });
      orbit.appendChild(b); nodes.push(b);
    });
    function place() { var wide = window.innerWidth > 760; nodes.forEach(function (b) { b.style.left = wide ? b.dataset.x + '%' : ''; b.style.top = wide ? b.dataset.y + '%' : ''; }); }
    function show(i) {
      if (i === cur) return; cur = i; var it = ITEMS[i];
      nodes.forEach(function (n, k) { n.classList.toggle('on', k === i); n.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
      core.classList.add('swap'); core.style.setProperty('--c', it.c);
      setTimeout(function () { ct.textContent = it.t; cp.textContent = it.p; art.innerHTML = ART[it.art]; core.classList.remove('swap'); }, 150);
    }
    function openMore(i) {
      var it = ITEMS[i]; opened = i;
      more.innerHTML = '<div class="om-head"><div><span class="om-k">Examples</span><h3 style="color:' + it.c + '">' + esc(it.t) + '</h3><p>' + esc(it.p) + '</p></div><button type="button" class="om-x" aria-label="Close examples">Close</button></div>' +
        (it.sample ? dashboard() : '') + '<div class="om-grid">' + it.ex.map(function (e) { return '<a class="om-card" href="' + e[2] + '" style="--c:' + it.c + '"><b>' + esc(e[0]) + '</b>' + (e[1] ? '<span>' + esc(e[1]) + '</span>' : '') + '<em>Open &rarr;</em></a>'; }).join('') + '</div>';
      more.hidden = false; more.classList.remove('in'); void more.offsetWidth; more.classList.add('in');
      more.querySelector('.om-x').addEventListener('click', function () { more.hidden = true; opened = -1; held = false; });
      if (it.sample) countUp(more);
      setTimeout(function () { more.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' }); }, 60);
    }
    openBtn.addEventListener('click', function () { openMore(cur < 0 ? 0 : cur); });
    function next() { var i; do { i = Math.floor(Math.random() * ITEMS.length); } while (i === cur && ITEMS.length > 1); show(i); }
    function loop() { clearInterval(timer); if (reduced) return; timer = setInterval(function () { if (!held && opened < 0 && !document.hidden) next(); }, 3400); }
    orbit.addEventListener('mouseleave', function () { held = false; });
    orbit.addEventListener('focusout', function () { setTimeout(function () { if (!orbit.contains(document.activeElement)) held = false; }, 50); });
    window.addEventListener('resize', place); place(); show(0); loop();
  }

  /* ------------------------------------------------------------ phone menu */
  var tg = document.getElementById('nav-toggle'), nav = document.querySelector('nav.site');
  if (tg && nav) {
    var openIc = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>', shutIc = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    var setNav = function (o) { nav.classList.toggle('open', o); tg.setAttribute('aria-expanded', o ? 'true' : 'false'); document.documentElement.style.overflow = o ? 'hidden' : ''; tg.innerHTML = o ? openIc : shutIc; };
    tg.addEventListener('click', function () { setNav(!nav.classList.contains('open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setNav(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });
  }

  /* ------------------------------------------------------------ embedded systems */
  var btn = document.getElementById('efab-btn'), full = document.getElementById('efab-full');
  if (btn && full) {
    setTimeout(function () { btn.classList.add('compact'); }, reduced ? 100 : 4200);
    var open = function (o) {
      full.classList.toggle('open', o); full.setAttribute('aria-hidden', o ? 'false' : 'true'); btn.setAttribute('aria-expanded', o ? 'true' : 'false');
      document.documentElement.style.overflow = o ? 'hidden' : ''; if (o) full.querySelector('.x').focus(); else btn.focus();
    };
    btn.addEventListener('click', function () { open(true); });
    full.querySelector('.x').addEventListener('click', function () { open(false); });
    full.addEventListener('click', function (e) { if (e.target === full) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && full.classList.contains('open')) open(false); });
    document.addEventListener('click', function (e) { var a = e.target.closest('a[href="#embedded"]'); if (a) { e.preventDefault(); open(true); } });
    if (location.hash === '#embedded') open(true);
  }
})();
