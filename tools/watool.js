/* watool.js : WhatsApp click-to-chat link generator (wa.me). Runs entirely in the browser. */
(function () {
  'use strict';
  var root = document.getElementById('wa-tool');
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };

  /* ISO region : international dial code. Names come from Intl.DisplayNames. */
  var RAW = 'AF:93 AL:355 DZ:213 AD:376 AO:244 AR:54 AM:374 AU:61 AT:43 AZ:994 BS:1242 BH:973 BD:880 BB:1246 BY:375 BE:32 BZ:501 BJ:229 BT:975 BO:591 BA:387 BW:267 BR:55 BN:673 BG:359 BF:226 BI:257 KH:855 CM:237 CA:1 CV:238 CF:236 TD:235 CL:56 CN:86 CO:57 KM:269 CG:242 CD:243 CR:506 CI:225 HR:385 CU:53 CY:357 CZ:420 DK:45 DJ:253 DO:1809 EC:593 EG:20 SV:503 GQ:240 ER:291 EE:372 SZ:268 ET:251 FJ:679 FI:358 FR:33 GA:241 GM:220 GE:995 DE:49 GH:233 GR:30 GT:502 GN:224 GW:245 GY:592 HT:509 HN:504 HK:852 HU:36 IS:354 IN:91 ID:62 IR:98 IQ:964 IE:353 IL:972 IT:39 JM:1876 JP:81 JO:962 KZ:7 KE:254 KW:965 KG:996 LA:856 LV:371 LB:961 LS:266 LR:231 LY:218 LT:370 LU:352 MO:853 MG:261 MW:265 MY:60 MV:960 ML:223 MT:356 MR:222 MU:230 MX:52 MD:373 MC:377 MN:976 ME:382 MA:212 MZ:258 MM:95 NA:264 NP:977 NL:31 NZ:64 NI:505 NE:227 NG:234 MK:389 NO:47 OM:968 PK:92 PS:970 PA:507 PG:675 PY:595 PE:51 PH:63 PL:48 PT:351 PR:1787 QA:974 RO:40 RU:7 RW:250 SA:966 SN:221 RS:381 SC:248 SL:232 SG:65 SK:421 SI:386 SO:252 ZA:27 KR:82 SS:211 ES:34 LK:94 SD:249 SR:597 SE:46 CH:41 SY:963 TW:886 TJ:992 TZ:255 TH:66 TL:670 TG:228 TT:1868 TN:216 TR:90 TM:993 UG:256 UA:380 AE:971 GB:44 US:1 UY:598 UZ:998 VE:58 VN:84 YE:967 ZM:260 ZW:263';
  var PREFER = { '1': 'US', '7': 'RU', '44': 'GB' };
  var dn = null;
  try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { dn = null; }
  var COUNTRIES = RAW.split(' ').map(function (p) {
    var a = p.split(':'), name = a[0];
    try { if (dn) name = dn.of(a[0]) || a[0]; } catch (e) { /* keep code */ }
    return { iso: a[0], dial: a[1], name: name };
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });

  var sel = $('wa-country'), numEl = $('wa-number'), msgEl = $('wa-msg');
  COUNTRIES.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c.iso; o.textContent = c.name + ' (+' + c.dial + ')';
    sel.appendChild(o);
  });
  function byIso(iso) { for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].iso === iso) return COUNTRIES[i]; return null; }
  (function pickDefault() {
    var region = '';
    try { var m = /[-_]([A-Za-z]{2})\b/.exec((navigator.language || '')); if (m) region = m[1].toUpperCase(); } catch (e) { /* ignore */ }
    sel.value = byIso(region) ? region : 'NG';
  })();

  var TEMPLATES = {
    order: 'Hello, I would like to place an order.\n\nItem: [item name]\nQuantity: [number]\nDelivery address: [address]\n\nPlease confirm the total and how to pay. Thank you.',
    booking: 'Hello, I would like to book an appointment.\n\nService: [service]\nPreferred date: [date]\nPreferred time: [time]\n\nPlease let me know if it is available. Thank you.',
    support: 'Hello, I need help with my order or account.\n\nName: [your name]\nOrder or reference number: [number]\nProblem: [describe the problem]\n\nThank you.',
    quote: 'Hello, I would like a quote.\n\nWhat I need: [describe the product or service]\nQuantity or size: [details]\nLocation: [city]\n\nPlease send the price and how long it takes. Thank you.'
  };

  /* ---------------------------------------------------------- number handling */
  function bestCountryForDigits(d) {
    for (var len = 4; len >= 1; len--) {
      var p = d.slice(0, len);
      if (PREFER[p] && byIso(PREFER[p])) return byIso(PREFER[p]);
      for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].dial === p) return COUNTRIES[i];
    }
    return null;
  }
  /* Returns { digits, error, note }. digits is the full international number without +. */
  function normalise(raw, country) {
    var s = String(raw || '').trim();
    if (!s) return { digits: '', error: '', note: '' };
    if (/[^\d\s+\-().]/.test(s)) return { digits: '', error: 'Use digits only. Spaces, dashes, brackets and a leading + are fine.', note: '' };
    var intl = /^\s*(\+|00)/.test(s);
    var d = s.replace(/\D/g, '');
    var note = '';
    if (intl) {
      d = d.replace(/^00/, '');
      note = 'Read as an international number.';
    } else {
      var dial = country.dial;
      d = d.replace(/^0+/, '');
      if (d.indexOf(dial) === 0 && d.length >= dial.length + 7 && d.length <= 15) note = 'It already starts with +' + dial + ', so the country code was not added twice.';
      else d = dial + d;
    }
    if (d.length < 8) return { digits: d, error: 'That number is too short. Include the whole number.', note: note };
    if (d.length > 15) return { digits: d, error: 'That number is too long. Phone numbers have at most 15 digits including the country code.', note: note };
    return { digits: d, error: '', note: note };
  }

  /* ---------------------------------------------------------- link and outputs */
  function buildLink(digits, msg) {
    var m = String(msg || '').replace(/\s+$/, '');
    return 'https://wa.me/' + digits + (m.trim() ? '?text=' + encodeURIComponent(m) : '');
  }
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function bubbleHtml(msg) {
    var t = escHtml(msg);
    t = t.replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>');
    return t;
  }

  var cur = { link: '', digits: '' };
  var qrCanvas = $('wa-qr');

  function drawQR(text, canvas) {
    canvas = canvas || qrCanvas;
    var ctx = canvas.getContext('2d');
    var px = canvas.width;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, px, px);
    if (!text) return false;
    if (typeof qrcode === 'undefined') return false;
    try {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      var qr = qrcode(0, 'M'); qr.addData(text); qr.make();
      var n = qr.getModuleCount(), quiet = 4, cell = px / (n + quiet * 2);
      ctx.fillStyle = '#000000';
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(Math.floor((c + quiet) * cell), Math.floor((r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
      }
      return true;
    } catch (e) { return false; }
  }

  function setActions(on) { root.querySelectorAll('[data-needs-link]').forEach(function (b) { b.disabled = !on; }); }

  function update(fromNumber) {
    var country = byIso(sel.value) || byIso('NG');
    var raw = numEl.value;
    var r = normalise(raw, country);
    /* if an international number was typed, switch the selector to match */
    if (fromNumber === true && r.digits && /^\s*(\+|00)/.test(raw)) {
      var cc = bestCountryForDigits(r.digits);
      if (cc && cc.dial !== country.dial) sel.value = cc.iso;
    }
    var msg = msgEl.value;
    $('wa-error').textContent = r.error;
    $('wa-note').textContent = r.error ? '' : r.note;

    var bub = $('wa-bubble');
    if (msg.trim()) { bub.innerHTML = bubbleHtml(msg.replace(/\s+$/, '')) + '<span class="wa-time">now</span>'; bub.classList.remove('empty'); }
    else { bub.textContent = 'Your message appears here. Leave it empty to just open a chat.'; bub.classList.add('empty'); }

    if (!r.digits || r.error) {
      cur = { link: '', digits: '' };
      $('wa-link').textContent = r.error ? '' : 'Enter a number to see your link';
      setActions(false); drawQR(''); $('wa-qr-wrap').classList.add('empty');
      return;
    }
    var link = buildLink(r.digits, msg);
    cur = { link: link, digits: r.digits };
    $('wa-link').textContent = link;
    $('wa-len').textContent = link.length > 2000 ? 'This link is very long (' + link.length + ' characters). Shorten the message so it works everywhere.' : '';
    setActions(true);
    var ok = drawQR(link);
    $('wa-qr-wrap').classList.toggle('empty', !ok);
    if (!ok) $('wa-len').textContent = 'The message is too long to fit in a QR code. Shorten it.';
    var wl = $('wa-live'); if (wl) wl.textContent = link;
  }

  /* ---------------------------------------------------------- buttons */
  function flash(btn, text) {
    var old = btn.getAttribute('data-label') || btn.textContent; btn.setAttribute('data-label', old);
    btn.textContent = text; setTimeout(function () { btn.textContent = old; }, 1600);
  }
  function copy(text, btn) {
    if (!text) return;
    var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject();
    p.then(function () { flash(btn, 'Copied'); }, function () {
      /* fallback for blocked clipboard */
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove(); flash(btn, ok ? 'Copied' : 'Copy failed');
    });
  }
  $('wa-copy').addEventListener('click', function () { copy(cur.link, this); });
  $('wa-copy-html').addEventListener('click', function () {
    copy('<a href="' + escHtml(cur.link) + '" target="_blank" rel="noopener">Chat on WhatsApp</a>', this);
  });
  $('wa-copy-md').addEventListener('click', function () { copy('[Chat on WhatsApp](' + cur.link + ')', this); });
  $('wa-open').addEventListener('click', function () { if (cur.link) window.open(cur.link, '_blank', 'noopener'); });
  $('wa-png').addEventListener('click', function () {
    if (!cur.link) return;
    var px = 1024, c = document.createElement('canvas'); c.width = c.height = px;
    drawQR(cur.link, c);
    c.toBlob(function (b) {
      var a = document.createElement('a'), url = URL.createObjectURL(b);
      a.href = url; a.download = 'whatsapp-qr-' + cur.digits + '.png'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
    }, 'image/png');
  });

  root.querySelectorAll('[data-tpl]').forEach(function (b) {
    b.addEventListener('click', function () {
      msgEl.value = TEMPLATES[b.getAttribute('data-tpl')] || '';
      root.querySelectorAll('[data-tpl]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      update();
    });
  });
  $('wa-clear').addEventListener('click', function () {
    msgEl.value = '';
    root.querySelectorAll('[data-tpl]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
    update();
  });

  numEl.addEventListener('input', function () { update(true); });
  [msgEl, sel].forEach(function (el) { el.addEventListener('input', function () { update(); }); el.addEventListener('change', function () { update(); }); });
  update();
})();
