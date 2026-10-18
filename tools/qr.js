/* qr.js : the QR code generator. Runs entirely in the browser.
   Content types: link, text, email, phone, SMS, WhatsApp, WiFi, vCard, location.
   Styling: colors, module shape, margin, error correction, logo.
   Output: live SVG preview, PNG (any size), SVG, copy image, print, .vcf.          */
(function () {
  'use strict';
  var root = document.getElementById('qr-tool');
  if (!root || typeof qrcode === 'undefined') return;
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

  var $ = function (id) { return document.getElementById(id); };
  var types = (root.getAttribute('data-types') || 'url').split(',');
  var state = { type: root.getAttribute('data-default') || types[0], logo: '', logoSource: null, logoAspect: 1 };

  /* ------------------------------------------------------------ content builders */
  function v(id) { var el = $(id); return el ? String(el.value).trim() : ''; }
  function raw(id) { var el = $(id); return el ? String(el.value) : ''; }
  function wifiEsc(s) { return s.replace(/([\\;,:"])/g, '\\$1'); }
  function vEsc(s) { return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
  function digits(s) { return s.replace(/[^\d]/g, ''); }

  var BUILD = {
    url: function () {
      var u = v('f-url'); if (!u) return '';
      if (!/^[a-z][a-z0-9+.\-]*:/i.test(u)) u = 'https://' + u;
      return u;
    },
    text: function () { return raw('f-text'); },
    email: function () {
      var to = v('f-email-to'); if (!to) return '';
      var q = [];
      if (v('f-email-subject')) q.push('subject=' + encodeURIComponent(v('f-email-subject')));
      if (raw('f-email-body').trim()) q.push('body=' + encodeURIComponent(raw('f-email-body').trim()));
      return 'mailto:' + to + (q.length ? '?' + q.join('&') : '');
    },
    phone: function () { var n = v('f-phone'); return n ? 'tel:' + n.replace(/[^\d+]/g, '') : ''; },
    sms: function () {
      var n = v('f-sms-number'); if (!n) return '';
      return 'SMSTO:' + n.replace(/[^\d+]/g, '') + ':' + raw('f-sms-text').trim();
    },
    whatsapp: function () {
      var n = digits(v('f-wa-number')); if (!n) return '';
      var m = raw('f-wa-text').trim();
      return 'https://wa.me/' + n + (m ? '?text=' + encodeURIComponent(m) : '');
    },
    wifi: function () {
      var ssid = v('f-wifi-ssid'); if (!ssid) return '';
      var enc = v('f-wifi-enc') || 'WPA';
      var pass = raw('f-wifi-pass');
      var s = 'WIFI:T:' + (enc === 'nopass' ? 'nopass' : enc) + ';S:' + wifiEsc(ssid) + ';';
      if (enc !== 'nopass' && pass) s += 'P:' + wifiEsc(pass) + ';';
      if ($('f-wifi-hidden') && $('f-wifi-hidden').checked) s += 'H:true;';
      return s + ';';
    },
    vcard: function () { return vcardText(); },
    geo: function () {
      var la = v('f-geo-lat'), lo = v('f-geo-lng');
      return la && lo ? 'geo:' + la + ',' + lo : '';
    }
  };

  function vcardText() {
    var first = v('f-vc-first'), last = v('f-vc-last');
    if (!first && !last) return '';
    var L = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + vEsc(last) + ';' + vEsc(first) + ';;;', 'FN:' + vEsc((first + ' ' + last).trim())];
    if (v('f-vc-org')) L.push('ORG:' + vEsc(v('f-vc-org')));
    if (v('f-vc-title')) L.push('TITLE:' + vEsc(v('f-vc-title')));
    if (v('f-vc-phone')) L.push('TEL;TYPE=CELL:' + v('f-vc-phone').replace(/[^\d+]/g, ''));
    if (v('f-vc-email')) L.push('EMAIL:' + v('f-vc-email'));
    if (v('f-vc-web')) L.push('URL:' + v('f-vc-web'));
    if (v('f-vc-street') || v('f-vc-city') || v('f-vc-country')) {
      L.push('ADR;TYPE=WORK:;;' + vEsc(v('f-vc-street')) + ';' + vEsc(v('f-vc-city')) + ';;;' + vEsc(v('f-vc-country')));
    }
    if (v('f-vc-note')) L.push('NOTE:' + vEsc(v('f-vc-note')));
    L.push('END:VCARD');
    return L.join('\n');
  }

  /* ------------------------------------------------------------ QR matrix */
  function makeMatrix(text, ec) {
    var qr = qrcode(0, ec);
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount(), m = [];
    for (var r = 0; r < n; r++) { m[r] = []; for (var c = 0; c < n; c++) m[r][c] = qr.isDark(r, c); }
    return m;
  }

  /* ------------------------------------------------------------ SVG renderer */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function rr(x, y, w, h, r) {
    return 'M' + (x + r) + ' ' + y + 'h' + (w - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'v' + (h - 2 * r) +
           'a' + r + ' ' + r + ' 0 0 1 ' + (-r) + ' ' + r + 'h' + (-(w - 2 * r)) + 'a' + r + ' ' + r + ' 0 0 1 ' + (-r) + ' ' + (-r) +
           'v' + (-(h - 2 * r)) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + (-r) + 'z';
  }
  function buildSVG(m, o, px) {
    var n = m.length, mar = o.margin, S = n + mar * 2, fg = o.fg;
    var size = px ? ' width="' + px + '" height="' + px + '"' : '';
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + S + ' ' + S + '"' + size +
              ' role="img" aria-label="QR code"' + (o.shape === 'square' ? ' shape-rendering="crispEdges"' : '') + '>'];
    if (!o.transparent) out.push('<rect width="' + S + '" height="' + S + '" fill="' + esc(o.bg) + '"/>');

    var logoBox = null;
    if (o.logo) {
      var asp = Math.max(0.2, Math.min(5, o.logoAspect || 1)), area = 0.062 * n * n;
      var LW = Math.sqrt(area * asp), LH = LW / asp, cap = n * 0.34;
      if (LW > cap) { LW = cap; LH = LW / asp; }
      if (LH > cap) { LH = cap; LW = LH * asp; }
      LW = Math.max(LW, n * 0.12); LH = Math.max(LH, n * 0.12);
      logoBox = { x: (n - LW) / 2, y: (n - LH) / 2, w: LW, h: LH };
    }
    function inFinder(r, c) { return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7); }
    function underLogo(r, c) {
      return logoBox && c + 0.5 > logoBox.x - 0.8 && c + 0.5 < logoBox.x + logoBox.w + 0.8 && r + 0.5 > logoBox.y - 0.8 && r + 0.5 < logoBox.y + logoBox.h + 0.8;
    }

    var d = '';
    for (var r = 0; r < n; r++) {
      var runStart = -1;
      for (var c = 0; c <= n; c++) {
        var dark = c < n && m[r][c] && !inFinder(r, c) && !underLogo(r, c);
        if (o.shape === 'square') {
          if (dark && runStart < 0) runStart = c;
          if (!dark && runStart >= 0) { d += 'M' + (runStart + mar) + ' ' + (r + mar) + 'h' + (c - runStart) + 'v1h' + (runStart - c) + 'z'; runStart = -1; }
        } else if (dark) {
          if (o.shape === 'dots') {
            var cx = c + mar + 0.5, cy = r + mar + 0.5, rad = 0.46;
            d += 'M' + (cx - rad) + ' ' + cy + 'a' + rad + ' ' + rad + ' 0 1 0 ' + (2 * rad) + ' 0a' + rad + ' ' + rad + ' 0 1 0 ' + (-2 * rad) + ' 0z';
          } else {
            d += rr(c + mar + 0.04, r + mar + 0.04, 0.92, 0.92, 0.3);
          }
        }
      }
    }
    if (d) out.push('<path fill="' + esc(fg) + '" d="' + d + '"/>');

    var rad = o.shape === 'square' ? 0 : 1.7;
    [[mar, mar], [mar + n - 7, mar], [mar, mar + n - 7]].forEach(function (p) {
      out.push('<rect x="' + (p[0] + 0.5) + '" y="' + (p[1] + 0.5) + '" width="6" height="6" rx="' + rad + '" fill="none" stroke="' + esc(fg) + '" stroke-width="1"/>');
      out.push('<rect x="' + (p[0] + 2) + '" y="' + (p[1] + 2) + '" width="3" height="3" rx="' + (rad ? 0.9 : 0) + '" fill="' + esc(fg) + '"/>');
    });

    if (logoBox) {
      var x = logoBox.x + mar, y = logoBox.y + mar, bw = logoBox.w, bh = logoBox.h, pad = 0.4;
      out.push('<rect x="' + (x - pad) + '" y="' + (y - pad) + '" width="' + (bw + 2 * pad) + '" height="' + (bh + 2 * pad) + '" rx="1.2" fill="' + (o.transparent ? '#ffffff' : esc(o.bg)) + '"/>');
      out.push('<image x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" preserveAspectRatio="xMidYMid meet" xlink:href="' + o.logo + '" href="' + o.logo + '"/>');
    }
    out.push('</svg>');
    return out.join('');
  }

  /* ------------------------------------------------------------ options and state */
  function opts() {
    var logo = state.logo;
    var ec = logo ? 'H' : ($('o-ec') ? $('o-ec').value : 'M');
    return {
      fg: $('o-fg').value, bg: $('o-bg').value, transparent: $('o-transparent').checked,
      shape: $('o-shape').value, margin: Math.max(0, Math.min(10, parseInt($('o-margin').value, 10) || 0)),
      ec: ec, logo: logo, logoAspect: state.logoAspect || 1
    };
  }
  function lum(hex) {
    var n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (x) {
      x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var l1 = lum(a), l2 = lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }

  var current = { text: '', svg: '', o: null };

  function update() {
    var text = BUILD[state.type] ? BUILD[state.type]() : '';
    var o = opts();
    var box = $('qr-preview'), msg = $('qr-msg'), warn = $('qr-warn'), data = $('qr-data');
    var actions = root.querySelectorAll('[data-needs-code]');
    warn.textContent = '';
    if (!text) {
      box.innerHTML = '<div class="qr-empty">Fill in the details to see your QR code</div>';
      msg.textContent = ''; data.textContent = ''; current = { text: '', svg: '', o: o };
      actions.forEach(function (b) { b.disabled = true; });
      return;
    }
    try {
      var m = makeMatrix(text, o.ec);
      var svg = buildSVG(m, o, 0);
      box.innerHTML = svg;
      current = { text: text, svg: svg, o: o, m: m };
      msg.textContent = '';
      data.textContent = text.length > 220 ? text.slice(0, 217) + '...' : text;
      actions.forEach(function (b) { b.disabled = false; });
      var ratio = contrast(o.fg, o.transparent ? '#ffffff' : o.bg);
      if (ratio < 3) warn.textContent = 'Low contrast. Dark code on a light background scans most reliably.';
      else if (!o.transparent && lum(o.fg) > lum(o.bg)) warn.textContent = 'Light code on a dark background does not scan on every app. Test before you print.';
    } catch (e) {
      box.innerHTML = '<div class="qr-empty">Too much data for one QR code</div>';
      msg.textContent = 'That is more than a QR code can hold. Shorten the text or lower the error correction level.';
      data.textContent = ''; current = { text: '', svg: '', o: o };
      actions.forEach(function (b) { b.disabled = true; });
    }
    hints();
  }

  function hints() {
    if (state.type === 'whatsapp') {
      var n = v('f-wa-number'), h = $('wa-hint');
      if (h) h.textContent = n && /^(0|\+0)/.test(n) ? 'Use the international format without a leading 0, for example 2347012345678 for Nigeria.' : '';
      var link = $('wa-link'); if (link) link.textContent = current.text || '';
    }
  }

  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(update, 90); }

  /* ------------------------------------------------------------ tabs */
  function showType(t) {
    state.type = t;
    root.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== t; });
    root.querySelectorAll('[data-type]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-type') === t ? 'true' : 'false'); });
    var vcf = $('btn-vcf'); if (vcf) vcf.hidden = t !== 'vcard';
    var link = $('wa-link-box'); if (link) link.hidden = t !== 'whatsapp';
    update();
  }
  root.querySelectorAll('[data-type]').forEach(function (b) {
    b.addEventListener('click', function () { showType(b.getAttribute('data-type')); });
  });

  /* ------------------------------------------------------------ downloads */
  function pxSize() { var s = parseInt($('o-size').value, 10); return Math.max(128, Math.min(4096, s || 1024)); }
  function save(blob, name) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function toPNG(cb) {
    if (!current.svg) return;
    var px = pxSize(), svg = buildSVG(current.m, current.o, px), img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = c.height = px;
      var ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, px, px);
      c.toBlob(cb, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function flash(btn, text) {
    var old = btn.getAttribute('data-label') || btn.textContent; btn.setAttribute('data-label', old);
    btn.textContent = text; setTimeout(function () { btn.textContent = old; }, 1600);
  }
  $('btn-png').addEventListener('click', function () { toPNG(function (b) { save(b, 'qr-code.png'); }); });
  $('btn-svg').addEventListener('click', function () {
    if (!current.svg) return;
    save(new Blob([buildSVG(current.m, current.o, pxSize())], { type: 'image/svg+xml' }), 'qr-code.svg');
  });
  $('btn-copy').addEventListener('click', function () {
    var btn = this;
    if (!navigator.clipboard || !window.ClipboardItem) { flash(btn, 'Not supported here'); return; }
    toPNG(function (b) {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () { flash(btn, 'Copied'); }, function () { flash(btn, 'Blocked by browser'); });
    });
  });
  $('btn-print').addEventListener('click', function () {
    if (!current.svg) return;
    var sheet = $('print-sheet');
    var cap = state.type === 'wifi' ? 'Scan to join WiFi: ' + v('f-wifi-ssid') : (state.type === 'url' ? v('f-url') : '');
    sheet.innerHTML = buildSVG(current.m, current.o, 0) + (cap ? '<p>' + esc(cap) + '</p>' : '');
    window.print();
  });
  if ($('btn-vcf')) $('btn-vcf').addEventListener('click', function () {
    var t = vcardText(); if (!t) return;
    save(new Blob([t.replace(/\n/g, '\r\n')], { type: 'text/vcard' }), (v('f-vc-first') || 'contact') + '.vcf');
  });
  if ($('btn-copy-link')) $('btn-copy-link').addEventListener('click', function () {
    var btn = this;
    if (!current.text) return;
    (navigator.clipboard ? navigator.clipboard.writeText(current.text) : Promise.reject()).then(function () { flash(btn, 'Copied'); }, function () { flash(btn, 'Copy failed'); });
  });

  /* ------------------------------------------------------------ logo: any image, background removed automatically */
  var logoJob = 0;
  function processLogo() {
    var src = state.logoSource; if (!src) return;
    var st = $('logo-status'), job = ++logoJob, rm = $('o-logo-rm').checked;
    st.hidden = false;
    function done(canvas, note) {
      if (job !== logoJob) return;
      var t = window.BGRemove ? BGRemove.fitMax(BGRemove.trim(canvas, 0.03), 512) : canvas;
      state.logo = t.toDataURL('image/png'); state.logoAspect = t.width / t.height;
      st.textContent = note; $('logo-clear').hidden = false; $('logo-note').hidden = false; update();
    }
    if (!rm || !window.BGRemove) { done(src, 'Using your image as it is.'); return; }
    st.textContent = 'Checking the image...';
    BGRemove.removeAuto(src, { onStatus: function (t) { if (job === logoJob) st.textContent = t; } }).then(function (r) {
      done(r.canvas, r.method === 'color' ? 'Background removed. A plain background was detected.' :
                     r.method === 'ai' ? 'Background removed with the AI cutout.' : 'Already transparent, kept as it is.');
    }, function () { done(src, 'Could not remove the background, so your image is used as it is.'); });
  }
  $('o-logo').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { $('qr-warn').textContent = 'Choose a logo under 8 MB.'; this.value = ''; return; }
    if (!window.BGRemove) { $('qr-warn').textContent = 'The logo tool did not load. Refresh the page.'; return; }
    BGRemove.fileToCanvas(f, 1024).then(function (c) { state.logoSource = c; processLogo(); },
      function (e) { $('qr-warn').textContent = e.message; });
  });
  $('o-logo-rm').addEventListener('change', processLogo);
  $('logo-clear').addEventListener('click', function () {
    logoJob++; state.logo = ''; state.logoSource = null; state.logoAspect = 1; $('o-logo').value = '';
    this.hidden = true; $('logo-note').hidden = true; $('logo-status').hidden = true; update();
  });

  /* ------------------------------------------------------------ wiring */
  root.querySelectorAll('input, select, textarea').forEach(function (el) {
    if (el.type === 'file') return;
    el.addEventListener('input', schedule); el.addEventListener('change', schedule);
  });
  var pw = $('f-wifi-show');
  if (pw) pw.addEventListener('change', function () { $('f-wifi-pass').type = this.checked ? 'text' : 'password'; });
  var enc = $('f-wifi-enc');
  if (enc) enc.addEventListener('change', function () { $('wifi-pass-row').hidden = this.value === 'nopass'; });

  showType(state.type);
})();
