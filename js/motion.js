/* motion.js : expressive layer for the home page.
   Preloader, split text, cursor, magnetic buttons, tilt, parallax,
   marquee, sticky header, drafts hover preview, booking panel.      */
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
      var text = node.textContent;
      var words = text.split(/(\s+)/);
      words.forEach(function (w) {
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

  /* ---------- Scroll progress + sticky header + active nav ---------- */
  var progress = document.getElementById('progress');
  var header = document.querySelector('header.site');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('nav.site a[href^="#"]'));
  var sections = navLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); }).filter(Boolean);
  var scrollY = 0, ticking = false;

  function onScroll() {
    scrollY = window.scrollY || window.pageYOffset;
    if (!ticking) { requestAnimationFrame(frame); ticking = true; }
  }
  function frame() {
    ticking = false;
    var h = doc.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = 'scaleX(' + (h > 0 ? scrollY / h : 0) + ')';
    if (header) header.classList.toggle('scrolled', scrollY > 40);
    var current = null, mid = scrollY + window.innerHeight * 0.4;
    sections.forEach(function (s) { if (s.offsetTop <= mid) current = s; });
    navLinks.forEach(function (a) {
      var on = current && a.getAttribute('href') === '#' + current.id;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    if (banner && bannerImg && !reduced) {
      var r = banner.getBoundingClientRect();
      var p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      bannerImg.style.transform = 'scale(1.15) translateY(' + (p * -10).toFixed(2) + '%)';
    }
  }
  var banner = document.querySelector('[data-parallax]');
  var bannerImg = banner ? banner.querySelector('img') : null;
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
      var view = t.closest && t.closest('.draft-row, .work-card, .work-feature, .banner-shot, .about-photo');
      var link = t.closest && t.closest('a, button, .chip, .day, label');
      var text = t.closest && t.closest('input[type="text"], textarea');
      cursor.classList.toggle('is-view', !!view);
      cursor.classList.toggle('is-link', !!link && !view);
      cursor.classList.toggle('is-text', !!text && !link);
      if (view) label.textContent = view.classList.contains('draft-row') ? 'Open' : 'View';
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
      var raf = null;
      function move(e) {
        var r = btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = 'translate(' + (dx * 0.28).toFixed(1) + 'px,' + (dy * 0.38).toFixed(1) + 'px)';
      }
      btn.addEventListener('mousemove', move);
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }

  /* ---------- Tilt cards ---------- */
  if (finePointer && !reduced) {
    document.querySelectorAll('.work-card, .review-card, .fact-card, .work-feature').forEach(function (card) {
      card.setAttribute('data-tilt', '');
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        card.classList.add('tilting');
        card.style.transform = 'perspective(900px) rotateX(' + (-py * 7).toFixed(2) + 'deg) rotateY(' + (px * 9).toFixed(2) + 'deg) translateY(-4px)';
      });
      card.addEventListener('mouseleave', function () { card.classList.remove('tilting'); card.style.transform = ''; });
    });
  }

  /* ---------- Hero mouse parallax ---------- */
  var hero = document.getElementById('hero');
  if (hero && finePointer && !reduced) {
    var avatar = hero.querySelector('.avatar'), body = hero.querySelector(':scope > div');
    var hx = 0, hy = 0, tx = 0, ty = 0;
    hero.addEventListener('mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5;
    });
    hero.addEventListener('mouseleave', function () { tx = 0; ty = 0; });
    (function hl() {
      hx = lerp(hx, tx, 0.08); hy = lerp(hy, ty, 0.08);
      if (avatar) avatar.style.transform = 'translate(' + (hx * 18).toFixed(1) + 'px,' + (hy * 18).toFixed(1) + 'px)';
      if (body) body.style.transform = 'translate(' + (hx * -8).toFixed(1) + 'px,' + (hy * -8).toFixed(1) + 'px)';
      requestAnimationFrame(hl);
    })();
  }

  /* ---------- Drafts hover preview ---------- */
  var preview = document.getElementById('draft-preview');
  if (preview && finePointer && !reduced) {
    var pimg = preview.querySelector('img'), px = 0, py = 0, pvx = 0, pvy = 0, pOn = false, lastSrc = '';
    document.querySelectorAll('.draft-row[data-preview]').forEach(function (row) {
      row.addEventListener('mouseenter', function (e) {
        var src = row.getAttribute('data-preview');
        if (src !== lastSrc) { pimg.src = src; lastSrc = src; preview.classList.remove('pulse'); void preview.offsetWidth; preview.classList.add('pulse'); }
        if (!pOn) { pvx = e.clientX; pvy = e.clientY; }
        pOn = true; preview.classList.add('show');
      });
      row.addEventListener('mouseleave', function () { pOn = false; preview.classList.remove('show'); });
    });
    document.addEventListener('mousemove', function (e) { px = e.clientX; py = e.clientY; }, { passive: true });
    (function pl() {
      if (pOn || preview.classList.contains('show')) {
        pvx = lerp(pvx, px, 0.14); pvy = lerp(pvy, py, 0.14);
        var lx = Math.max(190, Math.min(window.innerWidth - 190, pvx + 40)); /* keep inside the viewport */
        preview.style.left = lx.toFixed(1) + 'px';
        preview.style.top = pvy.toFixed(1) + 'px';
        var vx = (px - pvx);
        preview.style.transform = 'translate(-50%,-50%) rotate(' + (vx * 0.04).toFixed(2) + 'deg) scale(' + (preview.classList.contains('show') ? 1 : 0.85) + ')';
      }
      requestAnimationFrame(pl);
    })();
  }

  /* ---------- Booking panel ---------- */
  var form = document.getElementById('book-form');
  if (form) {
    var state = { topic: '', day: '', slot: '' };
    var topics = document.getElementById('book-topics');
    var days = document.getElementById('book-days');
    var slots = document.getElementById('book-slots');
    var nameIn = document.getElementById('book-name');
    var noteIn = document.getElementById('book-note');
    var sumBox = document.getElementById('book-summary');
    var sumText = document.getElementById('book-summary-text');
    var waBtn = document.getElementById('book-wa');
    var mailBtn = document.getElementById('book-mail');
    var steps = form.querySelectorAll('.book-step');
    var WA = '2347035940200', MAIL = 'ademiluaolufemi2@gmail.com';
    var DW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    /* next six working days starting tomorrow, Sundays skipped */
    var d = new Date(); d.setHours(12, 0, 0, 0); var added = 0;
    while (added < 6) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 0) continue;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'day';
      var labelFull = DW[d.getDay()] + ' ' + d.getDate() + ' ' + MN[d.getMonth()];
      b.setAttribute('data-day', labelFull);
      b.innerHTML = '<span class="dw">' + DW[d.getDay()] + '</span><span class="dn">' + d.getDate() + '</span><span class="dm">' + MN[d.getMonth()] + '</span>';
      days.appendChild(b); added++;
    }

    function pick(group, btn, key, attr) {
      group.querySelectorAll('[aria-pressed="true"]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      btn.setAttribute('aria-pressed', 'true');
      state[key] = btn.getAttribute(attr);
      render();
    }
    topics.addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) pick(topics, b, 'topic', 'data-topic'); });
    days.addEventListener('click', function (e) { var b = e.target.closest('.day'); if (b) pick(days, b, 'day', 'data-day'); });
    slots.addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) pick(slots, b, 'slot', 'data-slot'); });
    nameIn.addEventListener('input', render); noteIn.addEventListener('input', render);

    function render() {
      var ready = state.topic && state.day && state.slot;
      steps[0].classList.toggle('done', !!state.topic);
      steps[1].classList.toggle('done', !!(state.day && state.slot));
      steps[2].classList.toggle('done', !!nameIn.value.trim());
      var who = nameIn.value.trim();
      var parts = [];
      if (state.topic) parts.push(state.topic);
      if (state.day) parts.push(state.day + (state.slot ? ', ' + state.slot : ''));
      else if (state.slot) parts.push('any day, ' + state.slot);
      var text = parts.length ? parts.join(' · ') + (who ? ' · ' + who : '') : 'Pick a topic, a day and a window to build your request.';
      if (sumText.textContent !== text) {
        sumText.textContent = text;
        sumText.classList.remove('flash'); void sumText.offsetWidth; sumText.classList.add('flash');
      }
      sumBox.classList.toggle('ready', !!ready);
      waBtn.classList.toggle('is-off', !ready); mailBtn.classList.toggle('is-off', !ready);
      waBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');
      mailBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');
      if (!ready) return;
      var lines = [
        'Hi Evans, I’d like to book a twenty minute call.',
        'Topic: ' + state.topic,
        'When: ' + state.day + ', ' + state.slot + ' (Lagos time)',
        who ? 'Name: ' + who : null,
        noteIn.value.trim() ? 'About the business: ' + noteIn.value.trim() : null,
        'Sent from evansademilua.vercel.app'
      ].filter(Boolean);
      var body = lines.join('\n');
      waBtn.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(body);
      mailBtn.href = 'mailto:' + MAIL + '?subject=' + encodeURIComponent('Meeting request: ' + state.topic + ', ' + state.day) + '&body=' + encodeURIComponent(body);
    }
    render();
    form.addEventListener('submit', function (e) { e.preventDefault(); });
  }
})();
