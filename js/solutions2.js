/* Solutions page: the nine circles scroll to their section, the sections fade in one after another as you scroll, and the dashboard
   section shows a sample dashboard with made-up numbers. */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var secs = [].slice.call(document.querySelectorAll('.ssec')), cirs = [].slice.call(document.querySelectorAll('.cir'));

  function mark(id) {
    cirs.forEach(function (c) { c.classList.toggle('on', c.dataset.k === id); });
    secs.forEach(function (s) { s.classList.toggle('focus', s.id === 's-' + id); });
  }
  cirs.forEach(function (c) {
    c.addEventListener('click', function (e) {
      var t = document.getElementById('s-' + c.dataset.k); if (!t) return;
      e.preventDefault(); mark(c.dataset.k); t.classList.add('in');
      t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      try { history.replaceState(null, '', '#s-' + c.dataset.k); } catch (x) { /* ignore */ }
    });
  });
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); var k = e.target.id.replace('s-', ''); if (e.intersectionRatio > 0.35) cirs.forEach(function (c) { c.classList.toggle('on', c.dataset.k === k); }); } });
    }, { threshold: [0.1, 0.4] });
    secs.forEach(function (s) { io.observe(s); });
  } else secs.forEach(function (s) { s.classList.add('in'); });
  if (location.hash && document.getElementById(location.hash.slice(1))) {
    var h = document.getElementById(location.hash.slice(1)); h.classList.add('in'); mark(h.id.replace('s-', ''));
    setTimeout(function () { h.scrollIntoView(); }, 120);
  }

  /* the sample dashboard */
  var host = document.getElementById('sample-dash');
  if (host) {
    var pts = [14, 22, 18, 30, 26, 38, 34, 46, 42, 55, 49, 63], max = 70, w = 300, h2 = 90;
    var line = pts.map(function (v, i) { return (i / (pts.length - 1) * w).toFixed(1) + ',' + (h2 - v / max * h2).toFixed(1); }).join(' ');
    var bars = [40, 62, 48, 80, 66, 90, 58].map(function (v, i) { return '<i style="height:' + v + '%;animation-delay:' + (i * 0.08) + 's"></i>'; }).join('');
    host.innerHTML = '<div class="dsb"><div class="dsb-top"><b>Sample dashboard</b><span>Made-up numbers, to show what one can look like</span></div>' +
      '<div class="dsb-kpis"><div><span>Revenue</span><b data-n="48250" data-p="$">$0</b><em class="up">+12.4%</em></div><div><span>Orders</span><b data-n="1284" data-p="">0</b><em class="up">+8.1%</em></div><div><span>Visitors</span><b data-n="23910" data-p="">0</b><em class="up">+19.6%</em></div><div><span>Conversion</span><b data-n="54" data-p="" data-s="%" data-d="1">0%</b><em class="dn">-0.4%</em></div></div>' +
      '<div class="dsb-row"><div class="dsb-card"><span>Revenue, last 12 weeks</span><svg viewBox="0 0 ' + w + ' ' + h2 + '" preserveAspectRatio="none"><defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fbf71" stop-opacity=".35"/><stop offset="1" stop-color="#2fbf71" stop-opacity="0"/></linearGradient></defs><polygon points="0,' + h2 + ' ' + line + ' ' + w + ',' + h2 + '" fill="url(#dg)"/><polyline class="dsb-line" points="' + line + '" fill="none" stroke="#2fbf71" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg></div>' +
      '<div class="dsb-card"><span>Orders by day</span><div class="dsb-bars">' + bars + '</div></div><div class="dsb-card"><span>Latest activity</span><ul class="dsb-feed"><li>New order from Lagos</li><li>Invoice 0042 paid</li><li>Booking confirmed for Friday</li><li>Reply from a new lead</li></ul></div></div></div>';
    var run = function () {
      [].forEach.call(host.querySelectorAll('[data-n]'), function (el) {
        var to = parseFloat(el.dataset.n), p = el.dataset.p || '', sfx = el.dataset.s || '', dec = Number(el.dataset.d || 0), t0 = performance.now();
        (function f(t) { var k = Math.min(1, (t - t0) / 1200), v = to * (1 - Math.pow(1 - k, 3)); el.textContent = p + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + sfx; if (k < 1) requestAnimationFrame(f); })(t0);
      });
    };
    if ('IntersectionObserver' in window) { var o = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { run(); o.disconnect(); } }, { threshold: 0.3 }); o.observe(host); } else run();
  }
})();
