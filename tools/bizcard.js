/* Digital business card: fill in your details, pick a design, add a photo and logo, then download it as a picture or PDF, save it as a
   phone contact (.vcf), show a QR code that saves your contact, or share a link that opens your card. Nothing is uploaded. */
(function () {
  'use strict';
  var root = document.getElementById('bc'); if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var FIELDS = ['name', 'title', 'company', 'phone', 'email', 'website', 'address', 'tagline', 'instagram', 'linkedin', 'x', 'facebook', 'whatsapp'];
  var D = { name: 'Ada Okafor', title: 'Founder and Designer', company: 'Bright Path Studio', phone: '+234 803 123 4567', email: 'ada@brightpath.ng', website: 'brightpath.ng', address: '12 Admiralty Way, Lekki, Lagos', tagline: 'Brands that people remember', instagram: '', linkedin: '', x: '', facebook: '', whatsapp: '' };
  var DS = { tpl: 'split', orient: 'h', c1: '#ff5b52', c2: '#1d2433', bg: '#ffffff', ink: '#1b1f24', font: 'sans', shape: 'circle', qr: true, side: 'front' };
  var IMG = { photo: null, logo: null }, viewing = false;
  var FONTS = { sans: 'system-ui, "Segoe UI", Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'Consolas, "Courier New", monospace', round: '"Trebuchet MS", "Segoe UI", Arial, sans-serif', display: 'Impact, "Arial Black", sans-serif' };
  var TPLS = [['split', 'Split'], ['classic', 'Classic'], ['minimal', 'Minimal'], ['bold', 'Bold block'], ['dark', 'Dark'], ['gradient', 'Gradient'], ['elegant', 'Elegant'], ['stripe', 'Stripe']];
  var PRESETS = [['#ff5b52', '#1d2433', '#ffffff', '#1b1f24'], ['#2563eb', '#0f172a', '#ffffff', '#111827'], ['#16a34a', '#052e16', '#f7fff9', '#0b1f10'], ['#7c3aed', '#1e1b4b', '#ffffff', '#1f1a33'], ['#f59e0b', '#1c1917', '#fffbeb', '#1c1917'], ['#0f766e', '#042f2e', '#f0fdfa', '#042f2e'], ['#111111', '#444444', '#ffffff', '#111111'], ['#e11d48', '#4c0519', '#fff1f2', '#2a0a12']];
  try { var sv = JSON.parse(localStorage.getItem('bc.v1') || 'null'); if (sv) { D = Object.assign(D, sv.D || {}); DS = Object.assign(DS, sv.DS || {}); IMG = Object.assign(IMG, sv.IMG || {}); } } catch (e) { /* ignore */ }
  function save() { try { localStorage.setItem('bc.v1', JSON.stringify({ D: D, DS: DS, IMG: IMG })); } catch (e) { /* the pictures may be too big to keep; the card still works */ try { localStorage.setItem('bc.v1', JSON.stringify({ D: D, DS: DS, IMG: {} })); } catch (e2) { /* ignore */ } } }
  var cv = $('bc-cv'), ctx = cv.getContext('2d'), cache = {};

  function img(src, cb) { if (!src) return cb(null); if (cache[src]) return cb(cache[src]); var i = new Image(); i.onload = function () { cache[src] = i; cb(i); }; i.onerror = function () { cb(null); }; i.src = src; }
  function lum(hex) { var n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; }
  function on(c) { return lum(c) > 0.6 ? '#111111' : '#ffffff'; }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function text(s, x, y, size, weight, color, align, maxW) {
    if (!s) return 0; ctx.font = weight + ' ' + size + 'px ' + FONTS[DS.font]; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    var t = String(s); while (maxW && ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2) + '...'; ctx.fillText(t, x, y); return size * 1.35;
  }
  function photo(pi, cx, cy, r, ring) {
    if (DS.shape === 'none' || !pi) return false;
    ctx.save(); if (DS.shape === 'circle') { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); } else rr(cx - r, cy - r, r * 2, r * 2, r * 0.16); ctx.clip();
    var s = Math.max(2 * r / pi.width, 2 * r / pi.height), w = pi.width * s, h = pi.height * s; ctx.drawImage(pi, cx - w / 2, cy - h / 2, w, h); ctx.restore();
    if (ring) { ctx.lineWidth = 6; ctx.strokeStyle = ring; if (DS.shape === 'circle') { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); } else { rr(cx - r, cy - r, r * 2, r * 2, r * 0.16); ctx.stroke(); } }
    return true;
  }
  function logo(li, x, y, maxW, maxH, align) { if (!li) return 0; var s = Math.min(maxW / li.width, maxH / li.height), w = li.width * s, h = li.height * s; ctx.drawImage(li, align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, y, w, h); return h; }
  function contacts() {
    var out = []; if (D.phone) out.push(['Tel', D.phone]); if (D.email) out.push(['Email', D.email]); if (D.website) out.push(['Web', D.website.replace(/^https?:\/\//, '')]); if (D.address) out.push(['Address', D.address]);
    [['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['x', 'X'], ['facebook', 'Facebook'], ['whatsapp', 'WhatsApp']].forEach(function (p) { if (D[p[0]]) out.push([p[1], D[p[0]]]); }); return out;
  }
  function lines(x, y, size, color, label, maxW, gap, align) {
    var c = contacts(), yy = y; c.forEach(function (p) { ctx.font = '700 ' + (size * 0.78) + 'px ' + FONTS[DS.font]; ctx.fillStyle = DS.c1 === color ? color : color; text(p[1], x, yy, size, 500, color, align, maxW); yy += gap || size * 1.55; }); return yy;
  }
  function front(pi, li) {
    var H = DS.orient === 'h', W = cv.width, Hh = cv.height, P = DS.c1, S2 = DS.c2, bg = DS.bg, ink = DS.ink;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, Hh);
    if (!H) return vertical(pi, li);
    var t = DS.tpl;
    if (t === 'split') {
      ctx.fillStyle = P; ctx.fillRect(0, 0, 360, Hh);
      var has = photo(pi, 180, 200, 105, on(P)); if (!has) text((D.name || '?').charAt(0).toUpperCase(), 180, 250, 150, 800, on(P), 'center');
      logo(li, 180, 350, 220, 110, 'center'); text(D.company, 180, 540, 30, 700, on(P), 'center', 320);
      text(D.name, 410, 140, 58, 800, ink, 'left', 600); text(D.title, 410, 190, 30, 500, P, 'left', 600); text(D.tagline, 410, 235, 24, 400, ink, 'left', 600);
      ctx.fillStyle = P; ctx.fillRect(410, 262, 70, 5); lines(410, 320, 27, ink, '', 600, 46);
    } else if (t === 'classic') {
      ctx.fillStyle = S2; ctx.fillRect(0, 0, 30, Hh); ctx.fillStyle = P; ctx.fillRect(30, 0, 12, Hh);
      text(D.name, 90, 130, 62, 800, ink, 'left', 640); text(D.title, 90, 180, 30, 500, P, 'left', 640); text(D.company, 90, 222, 28, 700, ink, 'left', 640);
      lines(90, 320, 27, ink, '', 640, 46); photo(pi, 880, 170, 100, P); logo(li, 880, 330, 200, 100, 'center');
    } else if (t === 'minimal') {
      ctx.fillStyle = ink; ctx.fillRect(80, 150, 90, 5); text(D.name, 80, 120, 58, 700, ink, 'left', 700); text(D.title + (D.company ? '  |  ' + D.company : ''), 80, 205, 28, 400, ink, 'left', 800);
      lines(80, 330, 26, ink, '', 620, 44); photo(pi, 880, 170, 90, null); logo(li, 880, 300, 180, 90, 'center'); text(D.tagline, 80, 555, 22, 400, P, 'left', 800);
    } else if (t === 'bold') {
      ctx.fillStyle = P; ctx.fillRect(0, 0, W, Hh); var tc = on(P);
      text(D.name.toUpperCase(), 70, 180, 82, 900, tc, 'left', 900); text(D.title, 70, 240, 34, 600, tc, 'left', 800); ctx.fillStyle = tc; ctx.fillRect(70, 275, 120, 6);
      lines(70, 360, 28, tc, '', 560, 48); photo(pi, 860, 400, 120, tc); logo(li, 860, 70, 200, 90, 'center'); text(D.company, 70, 560, 30, 700, tc, 'left', 800);
    } else if (t === 'dark') {
      ctx.fillStyle = S2; ctx.fillRect(0, 0, W, Hh); var tx = on(S2); ctx.fillStyle = P; ctx.fillRect(0, 0, W, 14);
      photo(pi, 190, 230, 110, P); logo(li, 190, 380, 200, 90, 'center'); text(D.name, 380, 150, 60, 800, tx, 'left', 620); text(D.title, 380, 200, 30, 500, P, 'left', 620); text(D.company, 380, 242, 26, 400, tx, 'left', 620);
      lines(380, 330, 26, tx, '', 620, 44);
    } else if (t === 'gradient') {
      var g = ctx.createLinearGradient(0, 0, W, Hh); g.addColorStop(0, P); g.addColorStop(1, S2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; rr(50, 50, W - 100, Hh - 100, 30); ctx.fill(); var wc = '#ffffff';
      photo(pi, 190, 210, 95, wc); logo(li, 190, 340, 180, 90, 'center'); text(D.name, 340, 150, 58, 800, wc, 'left', 640); text(D.title, 340, 198, 28, 500, wc, 'left', 640); text(D.company, 340, 238, 26, 400, wc, 'left', 640);
      lines(340, 320, 25, wc, '', 620, 42);
    } else if (t === 'elegant') {
      ctx.strokeStyle = P; ctx.lineWidth = 3; ctx.strokeRect(36, 36, W - 72, Hh - 72); ctx.lineWidth = 1; ctx.strokeRect(50, 50, W - 100, Hh - 100);
      var ly = logo(li, W / 2, 70, 150, 70, 'center'); text(D.name, W / 2, 190 + (ly ? 20 : 0), 60, 700, ink, 'center', 800); text(D.title, W / 2, 238 + (ly ? 20 : 0), 28, 400, P, 'center', 800); text(D.company, W / 2, 278 + (ly ? 20 : 0), 24, 400, ink, 'center', 800);
      ctx.fillStyle = P; ctx.fillRect(W / 2 - 40, 300 + (ly ? 20 : 0), 80, 3); var yy = 350 + (ly ? 20 : 0), c = contacts(); c.slice(0, 5).forEach(function (p) { text(p[1], W / 2, yy, 24, 400, ink, 'center', 800); yy += 38; });
      photo(pi, 130, 300, 70, P);
    } else {  /* stripe */
      ctx.fillStyle = P; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 120); ctx.lineTo(0, 260); ctx.closePath(); ctx.fill(); ctx.fillStyle = S2; ctx.beginPath(); ctx.moveTo(0, 260); ctx.lineTo(W, 120); ctx.lineTo(W, 150); ctx.lineTo(0, 290); ctx.closePath(); ctx.fill();
      photo(pi, 130, 135, 80, on(P)); text(D.name, 250, 100, 56, 800, on(P), 'left', 700); text(D.title, 250, 150, 28, 500, on(P), 'left', 700); logo(li, W - 60, 30, 170, 70, 'right');
      lines(80, 360, 26, ink, '', 600, 44); text(D.company, W - 70, 560, 28, 700, P, 'right', 520); text(D.tagline, W - 70, 520, 22, 400, ink, 'right', 520);
    }
  }
  function vertical(pi, li) {
    var W = cv.width, H = cv.height, P = DS.c1, S2 = DS.c2;
    ctx.fillStyle = DS.tpl === 'dark' ? S2 : DS.tpl === 'bold' ? P : DS.bg; ctx.fillRect(0, 0, W, H);
    var head = DS.tpl === 'dark' || DS.tpl === 'bold' ? null : (DS.tpl === 'gradient' ? (function () { var g = ctx.createLinearGradient(0, 0, W, 330); g.addColorStop(0, P); g.addColorStop(1, S2); return g; })() : P);
    var tc = DS.tpl === 'dark' ? on(S2) : DS.tpl === 'bold' ? on(P) : DS.ink;
    if (head) { ctx.fillStyle = head; ctx.fillRect(0, 0, W, 330); }
    photo(pi, W / 2, head ? 250 : 200, 110, head ? '#ffffff' : P); logo(li, W / 2, 20, 170, 70, 'center');
    text(D.name, W / 2, head ? 440 : 400, 50, 800, tc, 'center', 540); text(D.title, W / 2, head ? 486 : 446, 26, 500, DS.tpl === 'dark' || DS.tpl === 'bold' ? tc : P, 'center', 540); text(D.company, W / 2, head ? 524 : 484, 24, 600, tc, 'center', 540);
    ctx.fillStyle = DS.tpl === 'bold' ? tc : P; ctx.fillRect(W / 2 - 36, head ? 548 : 508, 72, 4);
    var yy = head ? 612 : 572; contacts().forEach(function (p) { text(p[1], W / 2, yy, 23, 500, tc, 'center', 540); yy += 46; });
    text(D.tagline, W / 2, H - 50, 21, 400, tc, 'center', 540);
  }
  function qrData() {
    var v = vcard(false); try { var qr = qrcode(0, 'L'); qr.addData(v); qr.make(); return qr; } catch (e) { try { var q2 = qrcode(0, 'L'); q2.addData('MECARD:N:' + D.name + ';TEL:' + D.phone + ';EMAIL:' + D.email + ';;'); q2.make(); return q2; } catch (e2) { return null; } }
  }
  function back(li) {
    var W = cv.width, H = cv.height, P = DS.c1, tc = on(P);
    ctx.fillStyle = P; ctx.fillRect(0, 0, W, H);
    var qr = DS.qr ? qrData() : null, size = Math.min(W, H) * (DS.orient === 'h' ? 0.56 : 0.6), x = (W - size) / 2, y = DS.orient === 'h' ? 70 : 150;
    if (qr) { ctx.fillStyle = '#fff'; rr(x - 18, y - 18, size + 36, size + 36, 18); ctx.fill(); var n = qr.getModuleCount(), cs = size / n; ctx.fillStyle = '#111'; for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(x + c * cs, y + r * cs, Math.ceil(cs), Math.ceil(cs)); text('Scan to save my contact', W / 2, y + size + 62, 26, 600, tc, 'center', W - 80); }
    else { var lh = logo(li, W / 2 - 150, H / 2 - 80, 300, 160, null); if (!lh) text(D.company || D.name, W / 2, H / 2, 54, 800, tc, 'center', W - 80); }
    text(D.name, W / 2, H - (DS.orient === 'h' ? 60 : 90), 30, 700, tc, 'center', W - 80);
  }
  function render() {
    var h = DS.orient === 'h'; cv.width = h ? 1050 : 600; cv.height = h ? 600 : 1050; cv.setAttribute('aria-label', 'Business card, ' + (DS.side === 'front' ? 'front' : 'back'));
    img(IMG.photo, function (pi) { img(IMG.logo, function (li) { if (DS.side === 'front') front(pi, li); else back(li); }); });
  }
  function vcard(withPhoto) {
    var n = (D.name || '').trim().split(/\s+/), last = n.length > 1 ? n.pop() : '', first = n.join(' ');
    var v = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + last + ';' + first + ';;;', 'FN:' + D.name]; if (D.company) v.push('ORG:' + D.company); if (D.title) v.push('TITLE:' + D.title); if (D.phone) v.push('TEL;TYPE=CELL:' + D.phone); if (D.email) v.push('EMAIL;TYPE=INTERNET:' + D.email);
    if (D.website) v.push('URL:' + (/^https?:/.test(D.website) ? D.website : 'https://' + D.website)); if (D.address) v.push('ADR;TYPE=WORK:;;' + D.address + ';;;;');
    [['instagram', 'https://instagram.com/'], ['linkedin', 'https://linkedin.com/in/'], ['x', 'https://x.com/'], ['facebook', 'https://facebook.com/']].forEach(function (p) { if (D[p[0]]) v.push('URL;TYPE=' + p[0] + ':' + (/^https?:/.test(D[p[0]]) ? D[p[0]] : p[1] + D[p[0]].replace(/^@/, ''))); });
    if (D.tagline) v.push('NOTE:' + D.tagline);
    if (withPhoto && IMG.photo) { try { var c = document.createElement('canvas'); c.width = c.height = 160; var x = c.getContext('2d'), i = cache[IMG.photo]; if (i) { var s = Math.max(160 / i.width, 160 / i.height); x.drawImage(i, (160 - i.width * s) / 2, (160 - i.height * s) / 2, i.width * s, i.height * s); v.push('PHOTO;ENCODING=b;TYPE=JPEG:' + c.toDataURL('image/jpeg', 0.8).split(',')[1]); } } catch (e) { /* ignore */ } }
    v.push('END:VCARD'); return v.join('\r\n');
  }
  function download(name, blob) { var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 3000); }
  function both(cb) { var keep = DS.side; DS.side = 'front'; render(); setTimeout(function () { var f = cv.toDataURL('image/png'); DS.side = 'back'; render(); setTimeout(function () { var b = cv.toDataURL('image/png'); DS.side = keep; render(); cb(f, b); }, 80); }, 80); }
  function slug() { return (D.name || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card'; }
  function shareLink() { var data = {}; FIELDS.forEach(function (k) { if (D[k]) data[k] = D[k]; }); data.d = { tpl: DS.tpl, c1: DS.c1, c2: DS.c2, bg: DS.bg, ink: DS.ink, font: DS.font, orient: DS.orient, shape: 'none' }; var s = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); return location.origin + location.pathname + '#c=' + s; }
  function fromHash() {
    var m = /[#&]c=([A-Za-z0-9_-]+)/.exec(location.hash); if (!m) return false;
    try { var j = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); FIELDS.forEach(function (k) { D[k] = j[k] || ''; }); Object.assign(DS, j.d || {}); IMG = { photo: null, logo: null }; return true; } catch (e) { return false; }
  }
  /* form */
  FIELDS.forEach(function (k) { var el = $('bc-' + k); if (!el) return; el.value = D[k] || ''; el.addEventListener('input', function () { D[k] = el.value; save(); render(); }); });
  function seg(id, key) { var box = $(id); [].forEach.call(box.querySelectorAll('button'), function (b) { var set = function () { [].forEach.call(box.querySelectorAll('button'), function (x) { x.classList.toggle('on', x.dataset.v === String(DS[key])); x.setAttribute('aria-pressed', x.dataset.v === String(DS[key])); }); }; set(); b.addEventListener('click', function () { DS[key] = b.dataset.v; set(); save(); render(); if (key === 'side') $('bc-flip').textContent = DS.side === 'front' ? 'Show the back' : 'Show the front'; }); }); }
  var tb = $('bc-tpls'); TPLS.forEach(function (t) { var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.v = t[0]; b.textContent = t[1]; tb.appendChild(b); }); seg('bc-tpls', 'tpl'); seg('bc-orient', 'orient'); seg('bc-font', 'font'); seg('bc-shape', 'shape');
  var pb = $('bc-presets'); PRESETS.forEach(function (p) { var b = document.createElement('button'); b.type = 'button'; b.className = 'bc-sw'; b.style.background = 'linear-gradient(135deg,' + p[0] + ' 50%,' + p[1] + ' 50%)'; b.setAttribute('aria-label', 'Colour set ' + p[0]); b.onclick = function () { DS.c1 = p[0]; DS.c2 = p[1]; DS.bg = p[2]; DS.ink = p[3]; ['c1', 'c2', 'bg', 'ink'].forEach(function (k) { $('bc-' + k + 'c').value = DS[k]; }); save(); render(); }; pb.appendChild(b); });
  ['c1', 'c2', 'bg', 'ink'].forEach(function (k) { var el = $('bc-' + k + 'c'); el.value = DS[k]; el.addEventListener('input', function () { DS[k] = el.value; save(); render(); }); });
  $('bc-qr').checked = !!DS.qr; $('bc-qr').addEventListener('change', function () { DS.qr = $('bc-qr').checked; save(); render(); });
  function pick(id, key, size) { $(id).addEventListener('change', function () { var f = $(id).files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { var i = new Image(); i.onload = function () { var s = Math.min(1, size / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = Math.round(i.width * s); c.height = Math.round(i.height * s); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); IMG[key] = c.toDataURL(key === 'logo' ? 'image/png' : 'image/jpeg', 0.88); cache[IMG[key]] = null; save(); render(); }; i.src = r.result; }; r.readAsDataURL(f); }); }
  pick('bc-photo', 'photo', 600); pick('bc-logo', 'logo', 500);
  $('bc-rmphoto').addEventListener('click', function () { IMG.photo = null; save(); render(); }); $('bc-rmlogo').addEventListener('click', function () { IMG.logo = null; save(); render(); });
  $('bc-flip').addEventListener('click', function () { DS.side = DS.side === 'front' ? 'back' : 'front'; $('bc-flip').textContent = DS.side === 'front' ? 'Show the back' : 'Show the front'; render(); });
  $('bc-png').addEventListener('click', function () { cv.toBlob(function (b) { download('business-card-' + slug() + '-' + DS.side + '.png', b); }); });
  $('bc-pdf').addEventListener('click', function () {
    if (!window.PDFLib) return $('bc-status').textContent = 'The PDF maker did not load. Use the picture download instead.';
    both(function (f, b) { var PL = window.PDFLib; PL.PDFDocument.create().then(function (doc) { var h = DS.orient === 'h', w = h ? 252 : 144, hh = h ? 144 : 252; return Promise.all([doc.embedPng(f), doc.embedPng(b)]).then(function (im) { im.forEach(function (x) { var p = doc.addPage([w, hh]); p.drawImage(x, { x: 0, y: 0, width: w, height: hh }); }); return doc.save(); }); }).then(function (bytes) { download('business-card-' + slug() + '.pdf', new Blob([bytes], { type: 'application/pdf' })); $('bc-status').textContent = 'PDF saved: front on page 1, back on page 2, 3.5 by 2 inches.'; }); });
  });
  $('bc-vcf').addEventListener('click', function () { img(IMG.photo, function () { download(slug() + '.vcf', new Blob([vcard(true)], { type: 'text/vcard' })); $('bc-status').textContent = 'Contact file saved. Open it on a phone to add the contact.'; }); });
  $('bc-link').addEventListener('click', function () { var l = shareLink(); (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(function () { $('bc-status').textContent = 'Link copied. Anyone who opens it sees your card with a Save contact button. It carries your text and colours, not your pictures.'; }, function () { $('bc-status').textContent = l; }); });
  $('bc-reset').addEventListener('click', function () { if (confirm('Clear everything and start again?')) { try { localStorage.removeItem('bc.v1'); } catch (e) { /* ignore */ } location.hash = ''; location.reload(); } });
  /* view mode: someone opened a shared link */
  if (fromHash()) {
    viewing = true; root.classList.add('bc-view'); $('bc-edit').hidden = true; $('bc-viewbar').hidden = false;
    var tel = D.phone ? 'tel:' + D.phone.replace(/[^\d+]/g, '') : '', box = $('bc-actions'); box.innerHTML = '';
    function a(label, href, cls) { if (!href) return; var el = document.createElement('a'); el.className = 'btn ' + (cls || ''); el.href = href; el.textContent = label; if (/^http/.test(href)) { el.target = '_blank'; el.rel = 'noopener'; } box.appendChild(el); }
    var sv = document.createElement('button'); sv.type = 'button'; sv.className = 'btn primary'; sv.textContent = 'Save contact'; sv.onclick = function () { download(slug() + '.vcf', new Blob([vcard(false)], { type: 'text/vcard' })); }; box.appendChild(sv);
    a('Call', tel); a('Email', D.email ? 'mailto:' + D.email : ''); a('Website', D.website ? (/^https?:/.test(D.website) ? D.website : 'https://' + D.website) : ''); a('Make your own card', location.pathname, '');
    $('bc-viewtitle').textContent = D.name || 'Business card';
  }
  render();
})();
