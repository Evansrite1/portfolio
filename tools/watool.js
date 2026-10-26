/* watool.js : WhatsApp link and QR code generator (wa.me). Runs entirely in the browser. */
(function () {
  'use strict';
  var root = document.getElementById('wa-tool');
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };

  /* ISO region : international dial code. Names come from Intl.DisplayNames when available. */
  var RAW = 'AF:93 AL:355 DZ:213 AD:376 AO:244 AR:54 AM:374 AU:61 AT:43 AZ:994 BS:1242 BH:973 BD:880 BB:1246 BY:375 BE:32 BZ:501 BJ:229 BT:975 BO:591 BA:387 BW:267 BR:55 BN:673 BG:359 BF:226 BI:257 KH:855 CM:237 CA:1 CV:238 CF:236 TD:235 CL:56 CN:86 CO:57 KM:269 CG:242 CD:243 CR:506 CI:225 HR:385 CU:53 CY:357 CZ:420 DK:45 DJ:253 DO:1809 EC:593 EG:20 SV:503 GQ:240 ER:291 EE:372 SZ:268 ET:251 FJ:679 FI:358 FR:33 GA:241 GM:220 GE:995 DE:49 GH:233 GR:30 GT:502 GN:224 GW:245 GY:592 HT:509 HN:504 HK:852 HU:36 IS:354 IN:91 ID:62 IR:98 IQ:964 IE:353 IL:972 IT:39 JM:1876 JP:81 JO:962 KZ:7 KE:254 KW:965 KG:996 LA:856 LV:371 LB:961 LS:266 LR:231 LY:218 LT:370 LU:352 MO:853 MG:261 MW:265 MY:60 MV:960 ML:223 MT:356 MR:222 MU:230 MX:52 MD:373 MC:377 MN:976 ME:382 MA:212 MZ:258 MM:95 NA:264 NP:977 NL:31 NZ:64 NI:505 NE:227 NG:234 MK:389 NO:47 OM:968 PK:92 PS:970 PA:507 PG:675 PY:595 PE:51 PH:63 PL:48 PT:351 PR:1787 QA:974 RO:40 RU:7 RW:250 SA:966 SN:221 RS:381 SC:248 SL:232 SG:65 SK:421 SI:386 SO:252 ZA:27 KR:82 SS:211 ES:34 LK:94 SD:249 SR:597 SE:46 CH:41 SY:963 TW:886 TJ:992 TZ:255 TH:66 TL:670 TG:228 TT:1868 TN:216 TR:90 TM:993 UG:256 UA:380 AE:971 GB:44 US:1 UY:598 UZ:998 VE:58 VN:84 YE:967 ZM:260 ZW:263';
  var FALLBACK = { NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', GB: 'United Kingdom', US: 'United States', CA: 'Canada', AE: 'United Arab Emirates', KW: 'Kuwait', SA: 'Saudi Arabia', QA: 'Qatar', IN: 'India' };
  /* Usual number of digits after the country code (mobile numbers). Only a gentle hint. */
  var LEN = { NG: [10, 10], GH: [9, 9], KE: [9, 9], ZA: [9, 9], UG: [9, 9], TZ: [9, 9], RW: [9, 9], CM: [9, 9], SN: [9, 9], CI: [10, 10], BJ: [10, 10], EG: [10, 10], MA: [9, 9], DZ: [9, 9], ET: [9, 9], ZM: [9, 9], ZW: [9, 9], GB: [10, 10], US: [10, 10], CA: [10, 10], AE: [9, 9], KW: [8, 8], SA: [9, 9], QA: [8, 8], BH: [8, 8], OM: [8, 8], IN: [10, 10], PK: [10, 10], FR: [9, 9], ES: [9, 9], NL: [9, 9], AU: [9, 9], BR: [10, 11], CN: [11, 11], PH: [10, 10], SG: [8, 8], MX: [10, 10], TR: [10, 10], DE: [10, 11], IT: [9, 10], IE: [9, 9] };
  /* Countries where the leading 0 is part of the number and must stay. */
  var KEEP_ZERO = { CI: 1, BJ: 1, IT: 1, SM: 1 };
  var PREFER = { '1': 'US', '7': 'RU', '44': 'GB' };
  var TZ = { 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA', 'Africa/Kampala': 'UG', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kigali': 'RW', 'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Douala': 'CM', 'Africa/Dakar': 'SN', 'Africa/Abidjan': 'CI', 'Africa/Addis_Ababa': 'ET', 'Africa/Lusaka': 'ZM', 'Africa/Harare': 'ZW', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Asia/Dubai': 'AE', 'Asia/Kuwait': 'KW', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Karachi': 'PK', 'Asia/Manila': 'PH', 'Asia/Singapore': 'SG', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX', 'Europe/Istanbul': 'TR' };

  var dn = null;
  try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { dn = null; }
  var COUNTRIES = RAW.split(' ').map(function (p) {
    var a = p.split(':'), name = FALLBACK[a[0]] || a[0];
    try { if (dn) name = dn.of(a[0]) || name; } catch (e) { /* keep fallback */ }
    return { iso: a[0], dial: a[1], name: name };
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  function byIso(iso) { for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].iso === iso) return COUNTRIES[i]; return null; }

  function guessCountry() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (TZ[tz] && byIso(TZ[tz])) return TZ[tz];
      if (/^America\//.test(tz) && !/Sao_Paulo|Mexico|Argentina|Bogota|Lima|Santiago|Caracas/.test(tz)) return 'US';
    } catch (e) { /* ignore */ }
    try {
      var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
      for (var i = 0; i < langs.length; i++) {
        var m = /[-_]([A-Za-z]{2})\b/.exec(langs[i] || '');
        /* en-US is the default on many browsers everywhere, so it is not trusted */
        if (m && m[1].toUpperCase() !== 'US' && byIso(m[1].toUpperCase())) return m[1].toUpperCase();
      }
    } catch (e) { /* ignore */ }
    return 'NG';
  }
  var country = byIso(guessCountry()) || byIso('NG');

  /* ---------------------------------------------------------- templates */
  var TEMPLATES = [
    ['order', 'Hello, I want to order', 'Hello, I want to order.\n\nItem: [item name]\nQuantity: [number]\nDelivery address: [address]\n\nPlease tell me the total and how to pay. Thank you.'],
    ['price', 'Price enquiry', 'Hello, how much is [product or service]? Is it available now?'],
    ['booking', 'Booking an appointment', 'Hello, I would like to book an appointment.\n\nService: [service]\nDate: [date]\nTime: [time]\n\nPlease let me know if it is free. Thank you.'],
    ['support', 'Customer support', 'Hello, I need help.\n\nName: [your name]\nOrder number: [number]\nProblem: [describe the problem]\n\nThank you.'],
    ['delivery', 'Delivery update', 'Hello, I would like an update on my delivery.\n\nOrder number: [number]\nName: [your name]\n\nWhen will it arrive? Thank you.'],
    ['property', 'Real estate enquiry', 'Hello, I saw your property at [location or listing]. Is it still available? I would like to know the price and arrange a viewing.'],
    ['church', 'Church or event information', 'Hello, I would like more information about [service or event name]. What is the date, time and address? Thank you.'],
    ['custom', 'Custom message', '']
  ];
  function tplText(key) { for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i][0] === key) return TEMPLATES[i][2]; return ''; }

  /* ---------------------------------------------------------- number handling */
  function bestCountryForDigits(d) {
    for (var len = 4; len >= 1; len--) {
      var p = d.slice(0, len);
      if (PREFER[p] && byIso(PREFER[p])) return byIso(PREFER[p]);
      for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].dial === p) return COUNTRIES[i];
    }
    return null;
  }
  /* Returns { digits, national, error, note, intl }. digits is the full international number without +. */
  function normalise(raw, c) {
    var s = String(raw || '').trim();
    if (!s) return { digits: '', national: '', error: '', note: '', intl: false };
    if (/[^\d\s+\-().\/]/.test(s)) return { digits: '', national: '', error: 'Use digits only. Spaces, dashes, brackets and a leading + are fine.', note: '', intl: false };
    var intl = /^(\+|00)/.test(s);
    var d = s.replace(/\D/g, ''), note = '';
    if (intl) {
      d = d.replace(/^00/, '');
      note = 'Read as an international number.';
    } else {
      if (!KEEP_ZERO[c.iso]) d = d.replace(/^0+/, '');
      if (d.indexOf(c.dial) === 0 && d.length >= c.dial.length + 7 && d.length <= 15 && !(LEN[c.iso] && d.length <= LEN[c.iso][1])) note = 'It already starts with ' + c.dial + ', so the country code was not added twice.';
      else d = c.dial + d;
    }
    if (d.length < 8) return { digits: d, national: '', error: 'That number looks too short. Type the whole number.', note: note, intl: intl };
    if (d.length > 15) return { digits: d, national: '', error: 'That number is too long. Phone numbers have at most 15 digits with the country code.', note: note, intl: intl };
    return { digits: d, national: '', error: '', note: note, intl: intl };
  }
  function lengthHint(digits, c) {
    var r = LEN[c.iso];
    if (!r || digits.indexOf(c.dial) !== 0) return '';
    var n = digits.length - c.dial.length;
    if (n >= r[0] && n <= r[1]) return '';
    var want = r[0] === r[1] ? r[0] : r[0] + ' or ' + r[1];
    return 'Numbers in ' + c.name + ' usually have ' + want + ' digits after +' + c.dial + '. This one has ' + n + '. Check it, then use Open to test.';
  }
  function pretty(digits, c) {
    var dial = c && digits.indexOf(c.dial) === 0 ? c.dial : ((bestCountryForDigits(digits) || {}).dial || '');
    var nat = digits.slice(dial.length), parts = [];
    while (nat.length > 4) { parts.push(nat.slice(0, 3)); nat = nat.slice(3); }
    if (nat) parts.push(nat);
    return '+' + dial + ' ' + parts.join(' ');
  }

  /* ---------------------------------------------------------- link */
  function buildLink(digits, msg) {
    var m = String(msg || '').replace(/\s+$/, '');
    return 'https://wa.me/' + digits + (m.trim() ? '?text=' + encodeURIComponent(m) : '');
  }
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ---------------------------------------------------------- QR matrix */
  function makeMatrix(text) {
    if (!text || typeof qrcode === 'undefined') return null;
    try {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      var qr = qrcode(0, 'M'); qr.addData(text); qr.make();
      var n = qr.getModuleCount(), rows = [];
      for (var r = 0; r < n; r++) { var row = []; for (var c = 0; c < n; c++) row.push(qr.isDark(r, c)); rows.push(row); }
      return { n: n, m: rows };
    } catch (e) { return null; }
  }
  /* draws the modules into a square at x,y of size s (no quiet zone) */
  function paintQR(ctx, mx, x, y, s, color) {
    var cell = s / mx.n;
    ctx.fillStyle = color || '#000000';
    for (var r = 0; r < mx.n; r++) for (var c = 0; c < mx.n; c++) {
      if (mx.m[r][c]) ctx.fillRect(x + Math.floor(c * cell), y + Math.floor(r * cell), Math.ceil(cell) + 0.5, Math.ceil(cell) + 0.5);
    }
  }
  function svgFor(mx) {
    var q = 4, size = mx.n + q * 2, d = '';
    for (var r = 0; r < mx.n; r++) for (var c = 0; c < mx.n; c++) if (mx.m[r][c]) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="1024" height="1024" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path fill="#000000" d="' + d + '"/></svg>\n';
  }

  /* ---------------------------------------------------------- card styles */
  var GREEN = '#25d366', DARK = '#075e54', FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function text(ctx, t, x, y, size, weight, color, maxW, align) {
    var s = size;
    ctx.font = weight + ' ' + s + 'px ' + FONT;
    if (maxW && ctx.measureText) { while (s > 12 && ctx.measureText(t).width > maxW) { s -= 2; ctx.font = weight + ' ' + s + 'px ' + FONT; } }
    ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
  }
  var STYLES = [
    { key: 'plain', name: 'Plain', w: 1000, h: 1000, draw: function (ctx, mx) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1000, 1000);
      paintQR(ctx, mx, 80, 80, 840);
    } },
    { key: 'rounded', name: 'Rounded with caption', w: 1000, h: 1180, draw: function (ctx, mx, o) {
      ctx.fillStyle = GREEN; rrect(ctx, 0, 0, 1000, 1180, 80); ctx.fill();
      ctx.fillStyle = '#ffffff'; rrect(ctx, 70, 70, 860, 860, 50); ctx.fill();
      paintQR(ctx, mx, 130, 130, 740);
      text(ctx, o.caption || 'Chat with us on WhatsApp', 500, 1025, 66, '700', '#ffffff', 880);
      text(ctx, o.phone, 500, 1110, 44, '500', '#ffffff', 880);
    } },
    { key: 'table', name: 'Table sign', w: 1240, h: 1754, draw: function (ctx, mx, o) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1240, 1754);
      ctx.strokeStyle = '#111111'; ctx.lineWidth = 6; rrect(ctx, 40, 40, 1160, 1674, 40); ctx.stroke();
      text(ctx, o.name || 'Scan to chat with us', 620, 200, 92, '800', '#111111', 1060);
      text(ctx, o.name ? 'Scan to chat with us on WhatsApp' : 'on WhatsApp', 620, 320, 60, '600', DARK, 1060);
      paintQR(ctx, mx, 220, 420, 800);
      text(ctx, 'Point your phone camera at the code', 620, 1330, 46, '500', '#444444', 1060);
      ctx.fillStyle = GREEN; rrect(ctx, 140, 1440, 960, 160, 80); ctx.fill();
      text(ctx, o.phone, 620, 1520, 64, '700', '#ffffff', 900);
    } },
    { key: 'card', name: 'Business card', w: 1050, h: 600, draw: function (ctx, mx, o) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1050, 600);
      ctx.fillStyle = GREEN; ctx.fillRect(0, 0, 24, 600);
      text(ctx, o.name || 'Chat with us', 80, 200, 64, '800', '#111111', 500, 'left');
      text(ctx, o.phone, 80, 300, 44, '600', DARK, 500, 'left');
      text(ctx, 'Message us on WhatsApp', 80, 390, 34, '500', '#444444', 500, 'left');
      text(ctx, 'Scan the code to start a chat', 80, 445, 30, '400', '#666666', 500, 'left');
      paintQR(ctx, mx, 610, 80, 440);
    } },
    { key: 'sticker', name: 'Window sticker', w: 1000, h: 1000, draw: function (ctx, mx, o) {
      ctx.fillStyle = GREEN; ctx.beginPath(); ctx.arc(500, 500, 500, 0, Math.PI * 2); ctx.fill();
      text(ctx, 'SCAN ME', 500, 150, 84, '800', '#ffffff', 600);
      ctx.fillStyle = '#ffffff'; rrect(ctx, 220, 220, 560, 560, 40); ctx.fill();
      paintQR(ctx, mx, 255, 255, 490);
      text(ctx, 'Chat with us on WhatsApp', 500, 850, 50, '700', '#ffffff', 600);
    } }
  ];
  function renderStyle(canvas, st, mx, opts, scale) {
    canvas.width = Math.round(st.w * scale); canvas.height = Math.round(st.h * scale);
    var ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, st.w, st.h);
    if (!mx) { ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0, 0, st.w, st.h); return false; }
    st.draw(ctx, mx, opts);
    return true;
  }

  /* ---------------------------------------------------------- country picker */
  var ccBtn = $('wa-cc-btn'), ccPop = $('wa-cc-pop'), ccSearch = $('wa-cc-search'), ccList = $('wa-cc-list');
  var shown = [], active = 0;
  function label(c) { return c.name + ' +' + c.dial; }
  function showCountry() {
    $('wa-cc-flag').textContent = country.iso;
    $('wa-cc-name').textContent = label(country);
  }
  function fillList() {
    var q = ccSearch.value.trim().toLowerCase().replace(/^\+/, '');
    shown = COUNTRIES.filter(function (c) {
      return !q || c.name.toLowerCase().indexOf(q) !== -1 || c.iso.toLowerCase() === q || c.dial.indexOf(q) === 0;
    });
    active = 0;
    ccList.innerHTML = '';
    if (!shown.length) { var li0 = document.createElement('li'); li0.className = 'wa-cc-none'; li0.textContent = 'No country found'; ccList.appendChild(li0); return; }
    shown.forEach(function (c, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option'); li.id = 'wa-cc-o-' + c.iso; li.setAttribute('data-iso', c.iso);
      li.setAttribute('aria-selected', c.iso === country.iso ? 'true' : 'false');
      li.innerHTML = '<span class="wa-flag">' + c.iso + '</span><span>' + escHtml(c.name) + '</span><span class="wa-dial">+' + c.dial + '</span>';
      if (i === 0) li.classList.add('on');
      ccList.appendChild(li);
    });
    ccSearch.setAttribute('aria-activedescendant', 'wa-cc-o-' + shown[0].iso);
  }
  function setActive(i) {
    if (!shown.length) return;
    active = (i + shown.length) % shown.length;
    var items = ccList.querySelectorAll('[role="option"]');
    items.forEach(function (li, k) { li.classList.toggle('on', k === active); });
    var el = items[active];
    if (el) { ccSearch.setAttribute('aria-activedescendant', el.id); if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
  }
  function openCC() { ccPop.hidden = false; ccBtn.setAttribute('aria-expanded', 'true'); ccSearch.value = ''; fillList(); ccSearch.focus(); }
  function closeCC(focusBtn) { ccPop.hidden = true; ccBtn.setAttribute('aria-expanded', 'false'); if (focusBtn) ccBtn.focus(); }
  function chooseCountry(iso) { var c = byIso(iso); if (!c) return; country = c; showCountry(); closeCC(true); update(); }
  ccBtn.addEventListener('click', function () { if (ccPop.hidden) openCC(); else closeCC(); });
  ccSearch.addEventListener('input', fillList);
  ccSearch.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) chooseCountry(shown[active].iso); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCC(true); }
  });
  ccList.addEventListener('click', function (e) {
    var li = e.target.closest ? e.target.closest('[data-iso]') : null;
    if (li) chooseCountry(li.getAttribute('data-iso'));
  });
  document.addEventListener('click', function (e) { if (!ccPop.hidden && !e.target.closest('.wa-cc')) closeCC(); });

  /* ---------------------------------------------------------- template chips */
  var numEl = $('wa-number'), msgEl = $('wa-msg'), nameEl = $('wa-name'), chips = $('wa-tpls');
  TEMPLATES.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('data-tpl', t[0]); b.setAttribute('aria-pressed', 'false'); b.textContent = t[1];
    chips.appendChild(b);
  });
  function pickTemplate(key) {
    msgEl.value = tplText(key);
    chips.querySelectorAll('[data-tpl]').forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-tpl') === key ? 'true' : 'false'); });
    update();
  }
  chips.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-tpl]') : null;
    if (!b) return;
    pickTemplate(b.getAttribute('data-tpl'));
    if (b.getAttribute('data-tpl') === 'custom') msgEl.focus();
  });

  /* ---------------------------------------------------------- style thumbnails */
  var stylesEl = $('wa-styles');
  STYLES.forEach(function (st) {
    var fig = document.createElement('figure');
    fig.className = 'wa-style';
    fig.innerHTML = '<canvas data-style="' + st.key + '" role="img" aria-label="' + st.name + ' QR card preview"></canvas><figcaption>' + st.name + '</figcaption><button type="button" class="btn" data-needs-link data-dl-style="' + st.key + '" disabled>Download PNG</button>';
    stylesEl.appendChild(fig);
  });

  /* ---------------------------------------------------------- update */
  var cur = { link: '', digits: '', mx: null };
  function cardOpts() { return { phone: cur.digits ? pretty(cur.digits, country) : '', name: (nameEl.value || '').trim() }; }
  function setActions(on) { root.querySelectorAll('[data-needs-link]').forEach(function (b) { b.disabled = !on; }); }
  function drawPreviews() {
    var qc = $('wa-qr');
    var ctx = qc.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, qc.width, qc.height);
      if (cur.mx) { var pad = Math.round(qc.width * 4 / (cur.mx.n + 8)); paintQR(ctx, cur.mx, pad, pad, qc.width - pad * 2); }
    }
    var o = cardOpts();
    STYLES.forEach(function (st) {
      var cv = stylesEl.querySelector('canvas[data-style="' + st.key + '"]');
      if (cv) renderStyle(cv, st, cur.mx, o, 0.3);
    });
  }
  function update() {
    var raw = numEl.value;
    var r = normalise(raw, country);
    if (r.intl && r.digits && !r.error) {
      var cc = bestCountryForDigits(r.digits);
      if (cc && cc.dial !== country.dial) { country = cc; showCountry(); }
    }
    var msg = msgEl.value;
    $('wa-error').textContent = r.error;
    var hint = r.digits && !r.error ? lengthHint(r.digits, country) : '';
    $('wa-note').textContent = r.error ? '' : [r.note, hint].filter(Boolean).join(' ');

    if (!r.digits || r.error) {
      cur = { link: '', digits: '', mx: null };
      $('wa-link').textContent = 'Type your number to see your link';
      $('wa-len').textContent = '';
      $('wa-snippet').value = '';
      setActions(false); $('wa-out').classList.add('empty');
      drawPreviews();
      return;
    }
    var link = buildLink(r.digits, msg);
    var mx = makeMatrix(link);
    cur = { link: link, digits: r.digits, mx: mx };
    $('wa-link').textContent = link;
    $('wa-len').textContent = !mx ? 'The message is too long to fit in a QR code. Shorten it.' : (link.length > 1500 ? 'This link is long (' + link.length + ' characters). A shorter message makes a QR code that is easier to scan.' : '');
    $('wa-snippet').value = '<a href="' + escHtml(link) + '" target="_blank" rel="noopener" style="display:inline-block;background:#25d366;color:#ffffff;font:600 16px Arial,sans-serif;padding:12px 22px;border-radius:999px;text-decoration:none">Chat with us on WhatsApp</a>';
    setActions(true);
    $('wa-out').classList.toggle('empty', !mx);
    drawPreviews();
  }

  /* ---------------------------------------------------------- buttons */
  function flash(btn, t) {
    var old = btn.getAttribute('data-label') || btn.textContent; btn.setAttribute('data-label', old);
    btn.textContent = t; setTimeout(function () { btn.textContent = old; }, 1600);
  }
  function copy(t, btn) {
    if (!t) return;
    var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject();
    p.then(function () { flash(btn, 'Copied'); }, function () {
      var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove(); flash(btn, ok ? 'Copied' : 'Copy failed');
    });
  }
  function save(blob, name) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }
  function savePng(styleKey) {
    if (!cur.mx) return;
    var st = STYLES.filter(function (s) { return s.key === styleKey; })[0];
    var c = document.createElement('canvas');
    renderStyle(c, st, cur.mx, cardOpts(), styleKey === 'plain' ? 1.024 : 1);
    if (c.toBlob) c.toBlob(function (b) { if (b) save(b, 'whatsapp-qr-' + styleKey + '-' + cur.digits + '.png'); }, 'image/png');
  }
  $('wa-copy').addEventListener('click', function () { copy(cur.link, this); });
  $('wa-open').addEventListener('click', function () { if (cur.link) window.open(cur.link, '_blank', 'noopener'); });
  $('wa-png').addEventListener('click', function () { savePng('plain'); });
  $('wa-svg').addEventListener('click', function () { if (cur.mx) save(new Blob([svgFor(cur.mx)], { type: 'image/svg+xml' }), 'whatsapp-qr-' + cur.digits + '.svg'); });
  $('wa-copy-snippet').addEventListener('click', function () { copy($('wa-snippet').value, this); });
  stylesEl.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-dl-style]') : null;
    if (b) savePng(b.getAttribute('data-dl-style'));
  });

  numEl.addEventListener('input', update);
  msgEl.addEventListener('input', update);
  nameEl.addEventListener('input', function () { drawPreviews(); });

  showCountry();
  pickTemplate('order');

  window.waTool = { normalise: normalise, buildLink: buildLink, pretty: pretty, country: function () { return country; } };
})();
