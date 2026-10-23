/* fxtool.js : currency calculator. The only network request is the exchange-rate download. */
(function () {
  'use strict';
  var root = document.getElementById('fx-tool');
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };

  /* Approximate offline table: a copy of open.er-api.com rates (per 1 USD) taken on 23 October 2026. */
  var BUNDLED_DATE = Date.UTC(2026, 9, 23, 0, 2, 31);
  var BUNDLED = {AED:3.6725,AFN:64.9736,ALL:80.8221,AMD:361.594,ANG:1.79,AOA:930.694,ARS:1527.85,AUD:1.42531,AWG:1.79,AZN:1.70053,BAM:1.74373,BBD:2,BDT:123.71,BGN:1.74373,BHD:0.376,BIF:3001.54,BMD:1,BND:1.27736,BOB:11.7389,BRL:5.04276,BSD:1,BTN:94.8959,BWP:14.0008,BYN:2.95877,BZD:2,CAD:1.40135,CDF:2308.58,CHF:0.821251,CLF:0.02482,CLP:981.059,CNH:6.67298,CNY:6.68823,COP:3183.99,CRC:456.141,CUP:24,CVE:98.3072,CZK:21.6349,DJF:177.721,DKK:6.66782,DOP:61.4189,DZD:134.671,EGP:55.2156,ERN:15,ETB:162.528,EUR:0.891529,FJD:2.25111,FKP:0.746684,FOK:6.66539,GBP:0.746661,GEL:2.59709,GGP:0.746684,GHS:11.6593,GIP:0.746684,GMD:74.6504,GNF:8839.09,GTQ:7.64538,GYD:209.318,HKD:7.8372,HNL:26.8589,HRK:6.71742,HTG:131.031,HUF:326.192,IDR:18082.5,ILS:3.11065,IMP:0.746684,INR:94.9013,IQD:1517.43,IRR:1.76324e+06,ISK:121.438,JEP:0.746684,JMD:158.776,JOD:0.709,JPY:156.921,KES:129.867,KGS:87.5044,KHR:4060.15,KID:1.42538,KMF:438.616,KRW:1324.95,KWD:0.31006,KYD:0.833333,KZT:448.771,LAK:22358.5,LBP:89500,LKR:332.006,LRD:170.624,LSL:16.496,LYD:6.41756,MAD:9.81064,MDL:17.9759,MGA:4572.14,MKD:54.9806,MMK:2099.78,MNT:3585.4,MOP:8.07292,MRU:40.1271,MUR:47.2716,MVR:15.447,MWK:1741.6,MXN:18.734,MYR:4.08304,MZN:63.7186,NAD:16.496,NGN:1324.6,NIO:36.8194,NOK:9.34399,NPR:151.833,NZD:1.75959,OMR:0.384497,PAB:1,PEN:3.44094,PGK:4.47419,PHP:63.5266,PKR:276.986,PLN:3.89935,PYG:5741.85,QAR:3.64,RON:4.76494,RSD:104.765,RUB:81.5205,RWF:1477.88,SAR:3.75,SBD:7.9518,SCR:14.0286,SDG:511.873,SEK:9.91021,SGD:1.27731,SHP:0.746684,SLE:22.9714,SLL:22971.4,SOS:571.708,SRD:37.6789,SSP:5750.31,STN:21.8431,SYP:121.817,SZL:16.496,THB:33.7291,TJS:9.22396,TMT:3.50102,TND:2.99873,TOP:2.38641,TRY:49.6802,TTD:6.76814,TVD:1.42538,TWD:32.5918,TZS:2644.92,UAH:45.0666,UGX:4126.43,USD:1,UYU:40.1664,UZS:11901.2,VES:886.227,VND:25831.2,VUV:118.619,WST:2.73121,XAF:584.821,XCD:2.7,XCG:1.79,XDR:0.737403,XOF:584.821,XPF:106.391,YER:236.225,ZAR:16.4953,ZMW:20.1522,ZWG:26.5821,ZWL:26.5821};
  var SRC_A = 'https://open.er-api.com/v6/latest/USD';
  var SRC_B = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';
  var DEFAULT_PINS = ['NGN', 'USD', 'EUR', 'GBP', 'KES', 'GHS', 'ZAR', 'AED', 'KWD'];
  var MAX_PINS = 10;
  var KEYS = { cache: 'lt-fx-rates-v1', pins: 'lt-fx-pins-v1', pair: 'lt-fx-pair-v1' };

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  var CODES = Object.keys(BUNDLED);
  var dn = null;
  try { dn = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch (e) { dn = null; }
  var meta = {};
  CODES.forEach(function (c) {
    var name = c, sym = c;
    try { if (dn) name = dn.of(c) || c; } catch (e) { /* keep */ }
    try {
      var parts = new Intl.NumberFormat('en', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' }).formatToParts(1);
      for (var i = 0; i < parts.length; i++) if (parts[i].type === 'currency') sym = parts[i].value;
    } catch (e) { /* keep */ }
    var digits = 2;
    try { digits = new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits; } catch (e) { digits = 2; }
    meta[c] = { code: c, name: name, sym: sym, digits: digits };
  });
  CODES.sort();

  var state = { rates: BUNDLED, updated: BUNDLED_DATE, source: 'bundled', kind: 'bundled', fetchedAt: 0, from: 'USD', to: 'NGN', pins: DEFAULT_PINS.slice() };

  /* ---------------------------------------------------------- rates */
  function withTimeout(url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms);
    return fetch(url, { cache: 'no-cache', signal: ctl ? ctl.signal : undefined }).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) { clearTimeout(t); throw e; });
  }
  function fromA(j) {
    if (!j || j.result !== 'success' || !j.rates) throw new Error('bad data');
    return { rates: j.rates, updated: (j.time_last_update_unix || 0) * 1000, source: 'open.er-api.com (ExchangeRate-API)' };
  }
  function fromB(j) {
    if (!j || !j.usd) throw new Error('bad data');
    var r = {};
    Object.keys(j.usd).forEach(function (k) { var u = k.toUpperCase(); if (BUNDLED[u] !== undefined) r[u] = j.usd[k]; });
    r.USD = 1;
    return { rates: r, updated: j.date ? Date.parse(j.date + 'T00:00:00Z') : Date.now(), source: 'fawazahmed0 currency-api (jsDelivr)' };
  }
  function loadCache() {
    var raw = lsGet(KEYS.cache); if (!raw) return null;
    try {
      var c = JSON.parse(raw);
      if (c && c.rates && c.rates.USD === 1 && c.updated && c.fetchedAt) return c;
    } catch (e) { /* ignore */ }
    return null;
  }
  function apply(x, fetchedAt, kind) {
    state.rates = x.rates; state.updated = x.updated; state.source = x.source; state.fetchedAt = fetchedAt; state.kind = kind;
  }
  function loadRates(force) {
    setBusy(true);
    var cache = loadCache();
    if (!force && cache && Date.now() - cache.fetchedAt < 3600000) {
      apply(cache, cache.fetchedAt, 'cache'); setBusy(false); render(); return Promise.resolve();
    }
    return withTimeout(SRC_A, 9000).then(fromA).catch(function () { return withTimeout(SRC_B, 9000).then(fromB); }).then(function (x) {
      apply(x, Date.now(), 'live');
      lsSet(KEYS.cache, JSON.stringify({ rates: x.rates, updated: x.updated, source: x.source, fetchedAt: state.fetchedAt }));
    }).catch(function () {
      if (cache) { apply(cache, cache.fetchedAt, 'cache-old'); }
      else { state.rates = BUNDLED; state.updated = BUNDLED_DATE; state.source = 'bundled'; state.kind = 'bundled'; state.fetchedAt = 0; }
    }).then(function () { setBusy(false); render(); });
  }
  function setBusy(b) { $('fx-refresh').disabled = b; if (b) { $('fx-src').textContent = 'Loading exchange rates...'; $('fx-src').className = 'fx-src'; } }

  /* ---------------------------------------------------------- formatting and maths */
  function rate(from, to) {
    var a = state.rates[from], b = state.rates[to];
    if (!a || !b) return NaN;
    return b / a;
  }
  function fmtNum(v, code) {
    if (!isFinite(v)) return '-';
    var d = (meta[code] ? meta[code].digits : 2);
    var min = d, max = d;
    if (v !== 0 && Math.abs(v) < Math.pow(10, -d)) { min = 2; max = 6; }
    try { return new Intl.NumberFormat(undefined, { minimumFractionDigits: min, maximumFractionDigits: max }).format(v); }
    catch (e) { return v.toFixed(max); }
  }
  function fmtRate(v) {
    if (!isFinite(v)) return '-';
    var d = v >= 100 ? 2 : v >= 1 ? 4 : 6;
    try { return new Intl.NumberFormat(undefined, { maximumFractionDigits: d, minimumFractionDigits: 2 }).format(v); } catch (e) { return v.toFixed(d); }
  }
  function parseAmount(s) {
    s = String(s || '').replace(/[\s ']/g, '');
    if (!s) return NaN;
    if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
    if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN;
    return parseFloat(s);
  }
  function when(ms) {
    try { return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'; }
    catch (e) { return new Date(ms).toISOString(); }
  }
  function whenDay(ms) {
    try { return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }
    catch (e) { return new Date(ms).toISOString().slice(0, 10); }
  }
  function feePct() { var v = parseFloat(String($('fx-fee').value).replace(',', '.')); return isFinite(v) && v > 0 ? Math.min(v, 50) : 0; }

  /* ---------------------------------------------------------- searchable picker */
  function makePicker(id, onChange) {
    var input = $(id), list = $(id + '-list'), active = -1, items = [], value = '';
    function label(c) { var m = meta[c]; return c + ' - ' + m.name + (m.sym && m.sym !== c ? ' (' + m.sym + ')' : ''); }
    function open() { list.hidden = false; input.setAttribute('aria-expanded', 'true'); }
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); input.value = value ? label(value) : ''; }
    function fill(q) {
      q = (q || '').toLowerCase().trim();
      items = CODES.filter(function (c) {
        if (!q) return true;
        var m = meta[c];
        return c.toLowerCase().indexOf(q) === 0 || m.name.toLowerCase().indexOf(q) >= 0 || (m.sym && m.sym.toLowerCase() === q);
      });
      list.innerHTML = '';
      items.forEach(function (c, i) {
        var li = document.createElement('li');
        li.id = id + '-o' + i; li.setAttribute('role', 'option'); li.dataset.code = c; li.textContent = label(c);
        if (c === value) li.setAttribute('aria-selected', 'true');
        list.appendChild(li);
      });
      if (!items.length) { var e = document.createElement('li'); e.className = 'none'; e.textContent = 'No currency found'; list.appendChild(e); }
      active = items.length ? 0 : -1; mark();
    }
    function mark() {
      Array.prototype.forEach.call(list.children, function (li, i) { li.classList.toggle('on', i === active); });
      if (active >= 0 && list.children[active]) { input.setAttribute('aria-activedescendant', list.children[active].id); list.children[active].scrollIntoView({ block: 'nearest' }); }
    }
    function choose(c) { value = c; close(); if (onChange) onChange(c); }
    input.addEventListener('focus', function () { input.select(); fill(''); open(); });
    input.addEventListener('input', function () { fill(input.value); open(); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) { fill(''); open(); } active = Math.min(items.length - 1, active + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
      else if (e.key === 'Enter') { if (!list.hidden && active >= 0) { e.preventDefault(); choose(items[active]); input.blur(); } }
      else if (e.key === 'Escape') { close(); }
    });
    list.addEventListener('mousedown', function (e) { var li = e.target.closest('li'); if (li && li.dataset.code) { e.preventDefault(); choose(li.dataset.code); input.blur(); } });
    return { set: function (c) { value = c; input.value = c ? label(c) : ''; }, get: function () { return value; } };
  }

  /* ---------------------------------------------------------- render */
  var out = { text: '' };
  function render() {
    var amt = parseAmount($('fx-amount').value), from = state.from, to = state.to;
    var r = rate(from, to), pct = feePct();
    var res = $('fx-result'), line = $('fx-rateline'), err = $('fx-err');
    err.textContent = '';
    res.innerHTML = '';
    if (isNaN(amt)) {
      res.textContent = '-'; line.textContent = '';
      if ($('fx-amount').value.trim()) err.textContent = 'Type the amount as a number, for example 1500 or 1,500.75.';
      out.text = ''; $('fx-copy').disabled = true;
    } else {
      var mid = amt * r, net = mid * (1 - pct / 100);
      var big = document.createElement('span'); big.className = 'fx-big'; big.id = 'fx-big'; big.textContent = fmtNum(net, to) + ' ' + to;
      var small = document.createElement('span'); small.className = 'fx-small'; small.textContent = fmtNum(amt, from) + ' ' + from + ' =';
      res.appendChild(small); res.appendChild(big);
      var txt = '1 ' + from + ' = ' + fmtRate(r) + ' ' + to + ' and 1 ' + to + ' = ' + fmtRate(1 / r) + ' ' + from + '.';
      if (pct > 0) txt += ' Mid-market value: ' + fmtNum(mid, to) + ' ' + to + '. After the ' + pct + '% margin you receive about ' + fmtNum(net, to) + ' ' + to + ' (' + fmtNum(mid - net, to) + ' ' + to + ' less).';
      line.textContent = txt;
      out.text = fmtNum(amt, from) + ' ' + from + ' = ' + fmtNum(net, to) + ' ' + to + (pct > 0 ? ' (after ' + pct + '% margin)' : '') + ' at ' + fmtRate(r) + ' ' + to + ' per ' + from + ', rates of ' + when(state.updated);
      $('fx-copy').disabled = false;
    }
    var s = $('fx-src'), k = state.kind;
    if (state.source === 'bundled') {
      s.textContent = 'Offline: using the approximate table built into this page, copied on ' + whenDay(BUNDLED_DATE) + '. These numbers can be far out of date. Press Refresh rates when you are online.';
      s.className = 'fx-src warn';
    } else {
      s.className = 'fx-src';
      s.textContent = 'Rates from ' + state.source + ', published ' + when(state.updated) + '. ' +
        (k === 'cache-old' ? 'Could not reach the rate service, so this is a saved copy from ' + when(state.fetchedAt) + '.' :
         k === 'cache' ? 'Saved in your browser at ' + when(state.fetchedAt) + '.' : 'Downloaded just now.');
      if (k === 'cache-old') s.className = 'fx-src warn';
    }
    renderTable(amt, pct);
  }

  function renderTable(amt, pct) {
    var tb = $('fx-rows'); tb.innerHTML = '';
    state.pins.forEach(function (c) {
      var tr = document.createElement('tr');
      var v = amt * rate(state.from, c) * (1 - pct / 100);
      var td1 = document.createElement('td'); td1.innerHTML = '<b></b><small></small>'; td1.firstChild.textContent = c; td1.lastChild.textContent = meta[c] ? meta[c].name : '';
      var td2 = document.createElement('td'); td2.className = 'num'; td2.textContent = isNaN(amt) ? '-' : fmtNum(v, c);
      var td3 = document.createElement('td'); td3.className = 'num rt'; td3.textContent = fmtRate(rate(state.from, c));
      var td4 = document.createElement('td'); var b = document.createElement('button'); b.type = 'button'; b.className = 'fx-x'; b.setAttribute('aria-label', 'Remove ' + c + ' from the table'); b.textContent = 'x';
      b.addEventListener('click', function () { state.pins = state.pins.filter(function (x) { return x !== c; }); savePins(); render(); });
      td4.appendChild(b);
      [td1, td2, td3, td4].forEach(function (t) { tr.appendChild(t); });
      tb.appendChild(tr);
    });
    $('fx-table-from').textContent = state.from;
    $('fx-pin-help').textContent = state.pins.length >= MAX_PINS ? 'The table is full (' + MAX_PINS + ' currencies). Remove one to add another.' : '';
    $('fx-pin-add').disabled = state.pins.length >= MAX_PINS;
  }
  function savePins() { lsSet(KEYS.pins, JSON.stringify(state.pins)); }
  function savePair() { lsSet(KEYS.pair, JSON.stringify({ from: state.from, to: state.to })); }

  /* ---------------------------------------------------------- wiring */
  var pendingPin = '';
  var pFrom = makePicker('fx-from', function (c) { state.from = c; savePair(); render(); });
  var pTo = makePicker('fx-to', function (c) { state.to = c; savePair(); render(); });
  var pPin = makePicker('fx-pin', function (c) { pendingPin = c; });

  $('fx-swap').addEventListener('click', function () {
    var f = state.from; state.from = state.to; state.to = f;
    pFrom.set(state.from); pTo.set(state.to); savePair(); render();
  });
  $('fx-pin-add').addEventListener('click', function () {
    var c = pendingPin || pPin.get();
    if (!c) { $('fx-pin-help').textContent = 'Choose a currency first.'; return; }
    if (state.pins.indexOf(c) >= 0) { $('fx-pin-help').textContent = c + ' is already in the table.'; return; }
    if (state.pins.length >= MAX_PINS) return;
    state.pins.push(c); savePins(); pPin.set(''); pendingPin = ''; render();
  });
  $('fx-refresh').addEventListener('click', function () { loadRates(true); });
  $('fx-amount').addEventListener('input', render);
  $('fx-fee').addEventListener('input', render);
  $('fx-copy').addEventListener('click', function () {
    var btn = this, t = out.text; if (!t) return;
    function flash(m) { var old = btn.getAttribute('data-label') || btn.textContent; btn.setAttribute('data-label', old); btn.textContent = m; setTimeout(function () { btn.textContent = old; }, 1600); }
    var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject();
    p.then(function () { flash('Copied'); }, function () {
      var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); flash(ok ? 'Copied' : 'Copy failed');
    });
  });

  (function restore() {
    try {
      var p = JSON.parse(lsGet(KEYS.pins) || 'null');
      if (Array.isArray(p)) state.pins = p.filter(function (c) { return meta[c]; }).slice(0, MAX_PINS);
      var q = JSON.parse(lsGet(KEYS.pair) || 'null');
      if (q && meta[q.from] && meta[q.to]) { state.from = q.from; state.to = q.to; }
    } catch (e) { /* ignore */ }
    pFrom.set(state.from); pTo.set(state.to);
  })();
  window.fxState = state;
  render();
  loadRates(false);
})();
