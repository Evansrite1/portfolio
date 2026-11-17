/* Crypto prices from CoinGecko (free, no key): top coins, search any coin, watchlist, sorting, 7 day charts, 60 second refresh. Prices are
   for information only and are not advice. */
(function () {
  'use strict';
  var root = document.getElementById('cr'); if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ST = { cur: 'usd', watch: ['bitcoin', 'ethereum'], sort: 'market_cap', dir: -1, tab: 'top', extra: [] };
  try { var sv = JSON.parse(localStorage.getItem('cr.v1') || 'null'); if (sv) ST = Object.assign(ST, sv); } catch (e) { /* ignore */ }
  function save() { try { localStorage.setItem('cr.v1', JSON.stringify({ cur: ST.cur, watch: ST.watch, sort: ST.sort, dir: ST.dir, tab: ST.tab, extra: ST.extra })); } catch (e) { /* ignore */ } }
  var CUR = { usd: 'US dollar', eur: 'Euro', gbp: 'British pound', ngn: 'Nigerian naira', kes: 'Kenyan shilling', ghs: 'Ghanaian cedi', zar: 'South African rand', inr: 'Indian rupee', aed: 'UAE dirham', kwd: 'Kuwaiti dinar', sar: 'Saudi riyal', cad: 'Canadian dollar', aud: 'Australian dollar', jpy: 'Japanese yen', cny: 'Chinese yuan', brl: 'Brazilian real', try: 'Turkish lira', btc: 'Bitcoin' };
  var rows = [], timer = 0, left = 60, fetched = 0, busy = false;
  var sel = $('cr-cur'); Object.keys(CUR).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = k.toUpperCase() + ' ' + CUR[k]; sel.appendChild(o); }); sel.value = ST.cur;

  function money(v) {
    if (v == null) return '-';
    var d = v >= 100 ? 2 : v >= 1 ? 3 : v >= 0.01 ? 5 : 8;
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: ST.cur.toUpperCase(), maximumFractionDigits: d, minimumFractionDigits: v >= 100 ? 2 : 0 }).format(v); } catch (e) { return v.toFixed(d) + ' ' + ST.cur.toUpperCase(); }
  }
  function big(v) { if (v == null) return '-'; var a = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]; for (var i = 0; i < a.length; i++) if (v >= a[i][0]) return (v / a[i][0]).toFixed(2) + a[i][1]; return String(Math.round(v)); }
  function pct(v) { if (v == null) return '<span class="cr-na">-</span>'; return '<span class="' + (v >= 0 ? 'cr-up' : 'cr-dn') + '">' + (v >= 0 ? '+' : '') + v.toFixed(2) + '%</span>'; }
  function spark(a) {
    if (!a || a.length < 2) return ''; var mn = Math.min.apply(null, a), mx = Math.max.apply(null, a), w = 110, h = 32, p = a.map(function (v, i) { return (i / (a.length - 1) * w).toFixed(1) + ',' + (h - 2 - (v - mn) / (mx - mn || 1) * (h - 4)).toFixed(1); });
    return '<svg class="cr-sp ' + (a[a.length - 1] >= a[0] ? 'up' : 'dn') + '" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline fill="none" stroke-width="2" points="' + p.join(' ') + '"/></svg>';
  }
  function status(t, bad) { var e = $('cr-status'); e.textContent = t; e.className = 'help' + (bad ? ' err' : ''); }
  function get(url) { return fetch(url).then(function (r) { if (r.status === 429) throw new Error('rate'); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }); }
  function load() {
    if (busy) return; busy = true; status('Loading prices...');
    var base = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=' + ST.cur + '&sparkline=true&price_change_percentage=1h,24h,7d&per_page=';
    var urls = [base + '100&page=1&order=market_cap_desc'];
    var want = ST.watch.concat(ST.extra).filter(function (x, i, a) { return a.indexOf(x) === i; });
    if (want.length) urls.push(base + '250&ids=' + want.join(',') + '&order=market_cap_desc');
    Promise.all(urls.map(get)).then(function (res) {
      var map = {}; res.forEach(function (list) { list.forEach(function (c) { map[c.id] = c; }); }); rows = Object.keys(map).map(function (k) { return map[k]; });
      fetched = Date.now(); left = 60; busy = false; render(); status('Updated ' + new Date(fetched).toLocaleTimeString() + '. Refreshes every minute.');
    }).catch(function (e) { busy = false; status(e.message === 'rate' ? 'The free price service asked us to slow down. It will try again in a minute.' : 'Could not load prices. Check your internet connection. It will try again.', true); });
  }
  function render() {
    var q = $('cr-q').value.trim().toLowerCase(), list = rows.slice();
    if (ST.tab === 'watch') list = list.filter(function (c) { return ST.watch.indexOf(c.id) >= 0; }); else list = list.filter(function (c) { return c.market_cap_rank && c.market_cap_rank <= 100 || ST.watch.indexOf(c.id) >= 0 || ST.extra.indexOf(c.id) >= 0; });
    if (q) list = list.filter(function (c) { return c.name.toLowerCase().indexOf(q) >= 0 || c.symbol.toLowerCase().indexOf(q) >= 0; });
    var k = ST.sort; list.sort(function (a, b) { var x = a[k], y = b[k]; if (k === 'name') return ST.dir * String(x).localeCompare(y); return ST.dir * ((x == null ? -Infinity : x) - (y == null ? -Infinity : y)); });
    var th = [['market_cap_rank', '#'], ['name', 'Coin'], ['current_price', 'Price'], ['price_change_percentage_1h_in_currency', '1h'], ['price_change_percentage_24h_in_currency', '24h'], ['price_change_percentage_7d_in_currency', '7d'], ['market_cap', 'Market cap'], ['', '7 day chart']];
    var h = '<thead><tr><th scope="col" aria-label="Watch"></th>' + th.map(function (t) { return t[0] ? '<th scope="col"><button type="button" class="cr-sort" data-k="' + t[0] + '">' + t[1] + (ST.sort === t[0] ? (ST.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>' : '<th scope="col">' + t[1] + '</th>'; }).join('') + '</tr></thead>';
    var b = list.map(function (c) {
      var on = ST.watch.indexOf(c.id) >= 0;
      return '<tr><td><button type="button" class="cr-star' + (on ? ' on' : '') + '" data-id="' + esc(c.id) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remove ' : 'Watch ') + esc(c.name) + '">' + (on ? '★' : '☆') + '</button></td><td>' + (c.market_cap_rank || '-') + '</td>' +
        '<td class="cr-coin"><img src="' + esc(c.image) + '" alt="" width="22" height="22" loading="lazy"> <b>' + esc(c.name) + '</b> <small>' + esc(c.symbol.toUpperCase()) + '</small></td><td class="num"><b>' + money(c.current_price) + '</b></td>' +
        '<td class="num">' + pct(c.price_change_percentage_1h_in_currency) + '</td><td class="num">' + pct(c.price_change_percentage_24h_in_currency) + '</td><td class="num">' + pct(c.price_change_percentage_7d_in_currency) + '</td><td class="num">' + big(c.market_cap) + '</td><td>' + spark(c.sparkline_in_7d && c.sparkline_in_7d.price) + '</td></tr>';
    }).join('');
    $('cr-table').innerHTML = h + '<tbody>' + (b || '<tr><td colspan="9" class="cr-none">' + (ST.tab === 'watch' ? 'Your watchlist is empty. Press a star next to a coin.' : 'No coin matches that.') + '</td></tr>') + '</tbody>';
  }
  $('cr-table').addEventListener('click', function (e) {
    var s = e.target.closest('.cr-star'), k = e.target.closest('.cr-sort');
    if (s) { var id = s.dataset.id, i = ST.watch.indexOf(id); if (i >= 0) ST.watch.splice(i, 1); else ST.watch.push(id); save(); render(); }
    if (k) { if (ST.sort === k.dataset.k) ST.dir = -ST.dir; else { ST.sort = k.dataset.k; ST.dir = k.dataset.k === 'name' || k.dataset.k === 'market_cap_rank' ? 1 : -1; } save(); render(); }
  });
  $('cr-cur').addEventListener('change', function () { ST.cur = $('cr-cur').value; save(); load(); });
  $('cr-q').addEventListener('input', function () { render(); clearTimeout(timer); var q = $('cr-q').value.trim(); if (q.length < 2) return; timer = setTimeout(function () {   /* a coin outside the top 100 */
    if (rows.some(function (c) { return c.name.toLowerCase().indexOf(q.toLowerCase()) >= 0 || c.symbol.toLowerCase() === q.toLowerCase(); })) return;
    get('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(q)).then(function (j) { var ids = (j.coins || []).slice(0, 5).map(function (c) { return c.id; }); if (!ids.length) return; ST.extra = ids.concat(ST.extra).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 20); save(); load(); }).catch(function () { /* ignore */ });
  }, 600); });
  [].forEach.call(document.querySelectorAll('[data-ct]'), function (b) { b.classList.toggle('on', b.dataset.ct === ST.tab); b.addEventListener('click', function () { ST.tab = b.dataset.ct; [].forEach.call(document.querySelectorAll('[data-ct]'), function (x) { x.classList.toggle('on', x.dataset.ct === ST.tab); }); save(); render(); }); });
  $('cr-refresh').addEventListener('click', load);
  setInterval(function () { if (document.hidden) return; left--; if (left <= 0) load(); $('cr-count').textContent = Math.max(0, left) + 's'; }, 1000);
  load();
})();
