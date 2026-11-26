/* Faith Olufemi site. Connect her real links here. */
var CONFIG = {
  BOOK_URL: '',      /* her booking calendar (Calendly or similar). Every "Book a call" button opens it. Empty = the button scrolls to the contact details and form. */
  INSTAGRAM: '',     /* https://instagram.com/... shown in the footer when filled */
  LINKEDIN: ''       /* https://linkedin.com/in/... shown in the footer when filled */
};

(function () {
  'use strict';
  var doc = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); }, $$ = function (s, c) { return [].slice.call((c || document).querySelectorAll(s)); };

  /* light and dark: follows the device, with a manual switch that is remembered */
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function setTheme(t, save) { doc.dataset.theme = t; if (save) { try { localStorage.setItem('theme', t); } catch (e) {} } }
  $('#mode').addEventListener('click', function () { setTheme(doc.dataset.theme === 'dark' ? 'light' : 'dark', true); });
  if (mq.addEventListener) mq.addEventListener('change', function (e) { var saved = null; try { saved = localStorage.getItem('theme'); } catch (x) {} if (!saved) setTheme(e.matches ? 'dark' : 'light'); });

  /* real links */
  $$('[data-book]').forEach(function (a) { if (CONFIG.BOOK_URL) { a.href = CONFIG.BOOK_URL; a.target = '_blank'; a.rel = 'noopener'; } });
  $$('[data-social]').forEach(function (a) { var url = CONFIG[a.dataset.social.toUpperCase()]; if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; } else a.style.display = 'none'; });

  /* header */
  var top = $('#top'), nav = $('#nav'), burger = $('#burger'), lastY = 0;
  burger.addEventListener('click', function () { var o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
  $$('#nav a').forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }); });
  function onScroll(y) { top.classList.toggle('solid', y > 30); top.classList.toggle('hide', y > lastY && y > 500 && !nav.classList.contains('open')); lastY = y; }

  /* services: tap a row to open it, one at a time */
  var rows = $$('#svc .row');
  function openRow(r) { rows.forEach(function (x) { var on = x === r; x.classList.toggle('open', on); $('.row-h', x).setAttribute('aria-expanded', on); }); }
  rows.forEach(function (r) {
    $('.row-h', r).addEventListener('click', function () { openRow(r.classList.contains('open') ? null : r); setTimeout(function () { if (window.ScrollTrigger) ScrollTrigger.refresh(); }, 700); });
    if (window.matchMedia('(hover: hover)').matches) r.addEventListener('mouseenter', function () { openRow(r); });
  });

  /* projects: two to start, tap a card for the full story, view more for the rest */
  var dlg = $('#pdlg');
  $$('.pc').forEach(function (c) {
    function open() {
      $('#pidx').textContent = $('.idx', c).textContent; $('#ptitle').textContent = $('h3', c).textContent;
      $('#pbody').innerHTML = $('template', c).innerHTML;
      var l = $('.plink', c), b = $('#plinkbtn'); b.href = l.href; b.textContent = 'Visit ' + l.dataset.label;
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    }
    c.addEventListener('click', open); c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  $('#pclose').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  $('#viewMore').addEventListener('click', function () {
    var extra = $$('.pc.extra'), showing = extra[0].hidden === false;
    extra.forEach(function (c) { c.hidden = showing; });
    this.textContent = showing ? 'View more projects' : 'Show fewer';
    if (!showing && window.gsap) gsap.from(extra, { y: 40, opacity: 0, duration: .8, stagger: .12, ease: 'power3.out' });
    setTimeout(function () { if (window.ScrollTrigger) ScrollTrigger.refresh(); }, 300);
  });

  /* the statement under the photo: split into words that light up as you scroll */
  var st = $('#statement'); st.innerHTML = st.textContent.split(' ').map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');
  var words = $$('.w', st);

  function allVisible() {
    $$('[data-rise], .rv').forEach(function (e) { e.style.opacity = 1; e.style.transform = 'none'; });
    $('.arch').classList.add('in'); $('#closer').style.opacity = 1; words.forEach(function (w) { w.classList.add('on'); }); $$('.stars').forEach(function (s) { s.classList.add('lit'); });
  }

  /* the typed intro on black */
  var intro = $('#intro'), introDone = false, typer = null;
  function finishIntro(cb) {
    if (introDone) return; introDone = true; clearInterval(typer);
    try { sessionStorage.setItem('intro', '1'); } catch (e) {}
    intro.classList.add('out'); setTimeout(function () { doc.classList.remove('intro-on'); }, 950); setTimeout(cb, 350);
  }
  function runIntro(cb) {
    if (!doc.classList.contains('intro-on')) { cb(); return; }
    var parts = [['tA', 'I keep your business '], ['tB', 'running'], ['tC', ', so you can lead it.']], pi = 0, ci = 0;
    typer = setInterval(function () {
      var p = parts[pi]; if (!p) { clearInterval(typer); setTimeout(function () { finishIntro(cb); }, 1100); return; }
      $('#' + p[0]).textContent += p[1].charAt(ci++);
      if (ci >= p[1].length) { pi++; ci = 0; }
    }, 62);
    $('#skipi').addEventListener('click', function () { finishIntro(cb); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'Enter') finishIntro(cb); });
  }

  if (!window.gsap) {   /* the animation libraries did not load: show everything plainly */
    doc.classList.remove('intro-on'); allVisible();
    window.addEventListener('scroll', function () { onScroll(window.scrollY); }, { passive: true });
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  var lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ duration: 1.15, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); } });
    lenis.on('scroll', function (e) { ScrollTrigger.update(); onScroll(e.scroll); });
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); }); gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach(function (a) { a.addEventListener('click', function (e) { var id = a.getAttribute('href'); if (id.length > 1 && $(id)) { e.preventDefault(); lenis.scrollTo(id, { offset: -10, duration: 1.5 }); } }); });
    document.addEventListener('keydown', function () { /* keep keyboard scrolling working */ });
    if (doc.classList.contains('intro-on')) lenis.stop();
  } else window.addEventListener('scroll', function () { onScroll(window.scrollY); }, { passive: true });

  function hero() {
    if (lenis) lenis.start();
    $$('#h1 .ln').forEach(function (l) { l.innerHTML = '<span>' + l.innerHTML + '</span>'; });
    var tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    tl.from('#h1 .ln > span', { yPercent: 115, duration: 1.2, stagger: .13 }, 0)
      .to('.cta-row', { opacity: 1, y: 0, duration: 1 }, .5)
      .add(function () { $('.hero-art .arch').classList.add('in'); }, .55)
      .to('.hero-sub .eyebrow, .hero-sub .small', { opacity: 1, y: 0, duration: 1, stagger: 0 }, 1.2);
  }
  runIntro(hero);

  /* statement: words light up one by one with the scroll */
  ScrollTrigger.create({ trigger: '#statement', start: 'top 82%', end: 'bottom 48%', scrub: true, onUpdate: function (self) { var n = Math.round(self.progress * words.length); words.forEach(function (w, i) { w.classList.toggle('on', i < n); }); } });

  /* soft parallax */
  $$('.orb').forEach(function (o) { var s = parseFloat(o.dataset.speed || 0.2); gsap.to(o, { y: function () { return -s * 300; }, ease: 'none', scrollTrigger: { trigger: o.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } }); });
  gsap.to('.hero-art .arch img', { yPercent: 5, ease: 'none', scrollTrigger: { trigger: '.hero-art', start: 'top bottom', end: 'bottom top', scrub: true } });

  /* the messy week: the cards fall into order as you scroll, smooth and quick */
  var cards = $$('.mess'), shks = [], spots = [{ x: -60, y: 40, r: -9 }, { x: 50, y: -30, r: 7 }, { x: -30, y: 70, r: 6 }, { x: 60, y: -20, r: -8 }];
  function scatter(k) { cards.forEach(function (c, i) { var s = spots[i]; gsap.set(c, { x: s.x * k * (i % 2 ? -1 : 1), y: s.y * k, rotate: s.r * 1.4, scale: .95 }); }); }
  var mm = gsap.matchMedia();
  mm.add('(min-width: 821px)', function () {
    scatter(3.2);
    var tl = gsap.timeline({ scrollTrigger: { trigger: '#pin', start: 'top top', end: '+=900', scrub: .25, pin: true, anticipatePin: 1 } });
    tl.to(cards, { x: 0, y: 0, rotate: 0, scale: 1, duration: 1, stagger: .1, ease: 'power3.inOut' }).to('#closer', { opacity: 1, y: 0, duration: .6 }, '-=.05');
    return function () { gsap.set(cards, { clearProps: 'all' }); gsap.set(shks, { clearProps: 'all' }); };
  });
  mm.add('(max-width: 820px)', function () {
    scatter(.9);
    gsap.timeline({ scrollTrigger: { trigger: '.chaos', start: 'top 88%', end: 'bottom 60%', scrub: .25 } })
      .to(cards, { x: 0, y: 0, rotate: 0, scale: 1, duration: 1, stagger: .12, ease: 'power3.inOut' });
    gsap.to('#closer', { opacity: 1, duration: .8, scrollTrigger: { trigger: '#closer', start: 'top 92%' } });
    return function () { gsap.set(cards, { clearProps: 'all' }); gsap.set(shks, { clearProps: 'all' }); };
  });

  /* gentle reveals */
  ['.sec-head', '.row', '.offer', '.plain li', '.pc', '.logos li', '.feature', '.q', '.about-copy > *', '.about-art', '.contact-top > *', '.reach li', '.form'].forEach(function (sel) { $$(sel).forEach(function (el) { el.classList.add('rv'); }); });
  ScrollTrigger.batch('.rv', { start: 'top 92%', onEnter: function (els) { gsap.to(els, { opacity: 1, y: 0, duration: 1, stagger: .09, ease: 'power3.out', overwrite: true }); } });

  /* reviews: stars light up in turn, the big quote draws in */
  ScrollTrigger.batch('.stars', { start: 'top 92%', onEnter: function (els) { els.forEach(function (s, i) { setTimeout(function () { s.classList.add('lit'); }, i * 160); }); } });
  gsap.from('.feature blockquote', { clipPath: 'inset(0 100% 0 0)', duration: 1.4, ease: 'power3.inOut', scrollTrigger: { trigger: '.feature', start: 'top 78%' } });
  /* about: the arch grows up, the numbers count */
  gsap.from('.about-art .arch', { clipPath: 'inset(100% 0 0 0 round 999px 999px 28px 28px)', duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: '.about-art', start: 'top 82%' } });
  $$('.facts b[data-count]').forEach(function (b) {
    var end = +b.dataset.count, plus = /\+/.test(b.textContent), o = { v: 0 };
    ScrollTrigger.create({ trigger: b, start: 'top 92%', once: true, onEnter: function () { gsap.to(o, { v: end, duration: 1.6, ease: 'power2.out', onUpdate: function () { b.textContent = Math.round(o.v) + (plus ? '+' : ''); } }); } });
  });

  /* pointer effects on laptops */
  if (window.matchMedia('(hover: hover)').matches && !reduce) {
    $$('.pill').forEach(function (p) {
      p.addEventListener('pointermove', function (e) { var r = p.getBoundingClientRect(); gsap.to(p, { x: (e.clientX - r.left - r.width / 2) * .18, y: (e.clientY - r.top - r.height / 2) * .28, duration: .4 }); });
      p.addEventListener('pointerleave', function () { gsap.to(p, { x: 0, y: 0, duration: .7, ease: 'elastic.out(1,.5)' }); });
    });
  }

  var form = $('#form'); if (form) form.addEventListener('submit', function () { $('#formNote').textContent = 'Sending...'; });
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
