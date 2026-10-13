/* motion.js : shared motion and interaction layer.
   Preloader, split text, sticky header, cursor, magnetic buttons, tilt,
   booking-button scroll, build filters, solution filters.            */
(function () {
  'use strict';

  var doc = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------- Split text ---------- */
  function splitWords(el) {
    if (el.dataset.splitDone) return;
    var nodes = Array.prototype.slice.call(el.childNodes);
    var out = document.createDocumentFragment();
    var idx = 0;
    nodes.forEach(function (node) {
      var isEl = node.nodeType === 1;
      node.textContent.split(/(\s+)/).forEach(function (w) {
        if (!w) return;
        if (/^\s+$/.test(w)) { out.appendChild(document.createTextNode(' ')); return; }
        var outer = document.createElement('span'); outer.className = 'w';
        var inner = document.createElement('span'); inner.className = 'wi';
        inner.style.setProperty('--d', (idx * 0.07).toFixed(2));
        if (isEl) { var clone = node.cloneNode(false); clone.textContent = w; inner.appendChild(clone); }
        else inner.textContent = w;
        outer.appendChild(inner); out.appendChild(outer); idx++;
      });
    });
    el.innerHTML = ''; el.appendChild(out); el.dataset.splitDone = '1';
  }
  var splitEls = document.querySelectorAll('[data-split]');
  splitEls.forEach(splitWords);

  /* ---------- Book button: land on the booking section ---------- */
  function scrollToBook(smooth) {
    var sec = document.getElementById('book');
    if (!sec) return;
    var r = sec.getBoundingClientRect();
    var y = window.pageYOffset + r.top - Math.max(70, (window.innerHeight - r.height) / 2);
    window.scrollTo({ top: Math.max(0, y), behavior: (smooth && !reduced) ? 'smooth' : 'auto' });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#book"]');
    if (a && document.getElementById('book')) {
      e.preventDefault();
      scrollToBook(true);
      try { history.replaceState(null, '', '#book'); } catch (x) {}
    }
  });

  /* ---------- Preloader ---------- */
  var loader = document.getElementById('loader');
  var count = document.getElementById('loader-count');
  var heroH1 = document.querySelector('.hero h1[data-split]');
  var seen = false;
  try { seen = sessionStorage.getItem('evans-loaded') === '1'; } catch (e) {}

  function finishLoad() {
    doc.classList.remove('loading');
    doc.classList.add('loaded');
    if (heroH1) heroH1.classList.add('in');
    try { sessionStorage.setItem('evans-loaded', '1'); } catch (e) {}
    if (location.hash === '#book') { scrollToBook(false); setTimeout(function () { scrollToBook(false); }, 350); }
  }

  if (loader && !reduced && !seen) {
    doc.classList.add('loading');
    var start = performance.now(), dur = 1250;
    (function tick(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      var n = Math.round(e * 100);
      count.textContent = (n < 10 ? '0' : '') + n;
      loader.style.setProperty('--p', e.toFixed(3));
      if (t < 1) requestAnimationFrame(tick);
      else {
        loader.classList.add('done');
        setTimeout(finishLoad, 180);
        setTimeout(function () { loader.remove(); }, 1100);
      }
    })(start);
  } else {
    if (loader) loader.remove();
    finishLoad();
  }

  /* ---------- Section heading split on scroll ---------- */
  var headSplits = Array.prototype.filter.call(splitEls, function (el) { return el !== heroH1; });
  if ('IntersectionObserver' in window && !reduced) {
    var hio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); hio.unobserve(en.target); }
      });
    }, { threshold: 0.4 });
    headSplits.forEach(function (el) { hio.observe(el); });
  } else {
    headSplits.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Sticky header + active nav ---------- */
  var header = document.querySelector('header.site');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('nav.site a[href^="#"]:not(.nav-cta)'));
  var sections = navLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  var scrollY = 0, ticking = false;

  function onScroll() {
    scrollY = window.pageYOffset;
    if (!ticking) { requestAnimationFrame(frame); ticking = true; }
  }
  function frame() {
    ticking = false;
    if (header) header.classList.toggle('scrolled', scrollY > 40);
    var current = null, mid = scrollY + window.innerHeight * 0.4;
    sections.forEach(function (s) {
      if (!s) return;
      var top = s.getBoundingClientRect().top + scrollY;
      if (top <= mid) current = s;
    });
    var bookSec = document.getElementById('book');
    if (bookSec && bookSec.getBoundingClientRect().top + scrollY <= mid) current = null;
    navLinks.forEach(function (a) {
      var on = current && a.getAttribute('href') === '#' + current.id;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- Custom cursor ---------- */
  var cursor = document.getElementById('cursor');
  var mouse = { x: -100, y: -100 }, cur = { x: -100, y: -100 }, cursorOn = false;
  if (cursor && finePointer && !reduced) {
    var label = cursor.querySelector('.cursor-label');
    doc.classList.add('has-cursor');
    cursor.classList.add('is-hidden');
    document.addEventListener('mousemove', function (e) {
      mouse.x = e.clientX; mouse.y = e.clientY;
      if (!cursorOn) { cursorOn = true; cur.x = mouse.x; cur.y = mouse.y; cursor.classList.remove('is-hidden'); }
    }, { passive: true });
    document.addEventListener('mouseleave', function () { cursor.classList.add('is-hidden'); });
    document.addEventListener('mouseenter', function () { cursor.classList.remove('is-hidden'); });
    document.addEventListener('mouseover', function (e) {
      var t = e.target;
      if (!t.closest) return;
      var view = t.closest('.build-shot, .photo-full img, .about-photo');
      var link = t.closest('a, button, .chip, label, summary, .solution, .tx');
      var text = t.closest('input[type="text"], textarea');
      cursor.classList.toggle('is-view', !!view);
      cursor.classList.toggle('is-link', !!link && !view);
      cursor.classList.toggle('is-text', !!text && !link);
      if (view) label.textContent = view.classList.contains('build-shot') ? 'Open' : 'View';
    });
    (function loop() {
      cur.x = lerp(cur.x, mouse.x, 0.22); cur.y = lerp(cur.y, mouse.y, 0.22);
      cursor.style.transform = 'translate3d(' + cur.x.toFixed(1) + 'px,' + cur.y.toFixed(1) + 'px,0)';
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- Magnetic buttons ---------- */
  if (finePointer && !reduced) {
    document.querySelectorAll('.magnet').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = 'translate(' + (dx * 0.28).toFixed(1) + 'px,' + (dy * 0.38).toFixed(1) + 'px)';
      });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }

  /* ---------- Tilt cards ---------- */
  if (finePointer && !reduced) {
    document.querySelectorAll('.review-card, .fact-card').forEach(function (card) {
      card.setAttribute('data-tilt', '');
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        card.classList.add('tilting');
        card.style.transform = 'perspective(900px) rotateX(' + (-py * 6).toFixed(2) + 'deg) rotateY(' + (px * 8).toFixed(2) + 'deg) translateY(-3px)';
      });
      card.addEventListener('mouseleave', function () { card.classList.remove('tilting'); card.style.transform = ''; });
    });
  }

  /* ---------- Recent builds: filter + show all ---------- */
  var grid = document.getElementById('builds-grid');
  if (grid) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.build'));
    var more = document.getElementById('work-more');
    var bar = document.querySelector('.work-toolbar');
    var current = 'all', expanded = false;
    var applyBuilds = function () {
      var showAll = expanded || current !== 'all';
      cards.forEach(function (c) { c.hidden = !(current === 'all' || c.getAttribute('data-type') === current); });
      grid.classList.toggle('expanded', showAll);
      cards.forEach(function (c) { if (!c.hidden && (showAll || !c.classList.contains('is-extra'))) c.classList.add('in'); });
      if (more) more.hidden = showAll;
    };
    if (bar) bar.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      current = b.getAttribute('data-filter');
      bar.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      applyBuilds();
    });
    if (more) more.addEventListener('click', function () { expanded = true; applyBuilds(); });
    applyBuilds();
  }

  /* ---------- Solutions page: filter by goal ---------- */
  var solGrid = document.getElementById('sol-grid');
  var goalBar = document.querySelector('.goal-bar');
  if (solGrid && goalBar) {
    var sols = Array.prototype.slice.call(solGrid.querySelectorAll('.solution'));
    var empty = document.getElementById('sol-empty');
    goalBar.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      var g = b.getAttribute('data-goal'), shown = 0;
      goalBar.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      sols.forEach(function (s) {
        var ok = g === 'all' || (' ' + s.getAttribute('data-goals') + ' ').indexOf(' ' + g + ' ') > -1;
        s.hidden = !ok;
        if (ok) { s.classList.add('in'); shown++; }
      });
      if (empty) empty.hidden = shown > 0;
    });
  }
  /* ---------- Solutions page: open a card for the full detail ---------- */
  var modal = document.getElementById('sol-modal');
  if (modal && solGrid) {
    var mbody = document.getElementById('sol-modal-body');
    var lastFocus = null;
    var openModal = function (card) {
      var d = card.querySelector('.sol-detail');
      if (!d) return;
      mbody.innerHTML = d.innerHTML;
      modal.setAttribute('aria-label', (card.querySelector('h3') || {}).textContent || 'Solution details');
      modal.classList.add('open');
      doc.classList.add('modal-open');
      lastFocus = document.activeElement;
      var c = modal.querySelector('.modal-close'); if (c) c.focus();
    };
    var closeModal = function () {
      modal.classList.remove('open');
      doc.classList.remove('modal-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    solGrid.addEventListener('click', function (e) {
      var card = e.target.closest('.solution');
      if (!card || e.target.closest('a')) return;
      openModal(card);
    });
    solGrid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest && e.target.closest('.solution');
      if (!card || e.target !== card) return;
      e.preventDefault();
      openModal(card);
    });
    modal.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key === 'Tab') {
        var f = modal.querySelectorAll('a[href], button');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
})();
