/* docgen.js : shared engine for the free invoice generator and receipt generator.
   One layout engine builds a list of drawing items in millimetres. The live preview draws them as SVG
   and the PDF draws the very same items with pdf-lib, so what you see is what you download.
   Everything runs in the browser. Nothing is uploaded. */
(function () {
'use strict';

/* ------------------------------------------------------------------ basics */
const PT = 25.4 / 72;                     // one point in millimetres
const $ = (id) => document.getElementById(id);
const FONT_FILES = { 400: '/tools/vendor/fonts/NotoSans-400Regular.subset.ttf', 700: '/tools/vendor/fonts/NotoSans-700Bold.subset.ttf' };
// code point ranges that exist in the vendored font subset
const OK_RANGES = [[0x20, 0x7e], [0xa0, 0x24f], [0x370, 0x3ff], [0x400, 0x4ff], [0x1e00, 0x1eff], [0x2000, 0x206f], [0x20a0, 0x20cf],
  [0x2100, 0x214f], [0x2190, 0x2193], [0x2212, 0x2212], [0x2215, 0x2215], [0x221e, 0x221e], [0x2248, 0x2248], [0x2260, 0x2260],
  [0x2264, 0x2265], [0x25cf, 0x25cf]];
const okCp = (cp) => OK_RANGES.some((r) => cp >= r[0] && cp <= r[1]);
let replacedChars = false;

function clean(s) {
  s = String(s == null ? '' : s).normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
    .replace(/[\u2012-\u2015]/g, '-')
    .replace(/[\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '');
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp === 10) out += ch;
    else if (cp < 32) continue;
    else if (okCp(cp)) out += ch;
    else { out += '?'; replacedChars = true; }
  }
  return out;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r3 = (n) => Math.round(n * 1000) / 1000;

/* ------------------------------------------------------------------ fonts and text measuring */
let fontsReady = null;
function loadFonts() {
  if (fontsReady) return fontsReady;
  fontsReady = Promise.all(Object.keys(FONT_FILES).map((w) =>
    new FontFace('DocSans', 'url(' + FONT_FILES[w] + ')', { weight: String(w) }).load().then((f) => { document.fonts.add(f); })
  ));
  return fontsReady;
}
const mctx = document.createElement('canvas').getContext('2d');
if ('fontKerning' in mctx) mctx.fontKerning = 'none';
const mcache = new Map();
function tw(s, size, bold) {
  const key = (bold ? 'b' : 'r') + s;
  let w = mcache.get(key);
  if (w === undefined) {
    mctx.font = (bold ? '700' : '400') + ' 100px DocSans';
    w = mctx.measureText(s).width / 100;
    mcache.set(key, w);
  }
  return w * size * PT;
}
function wrap(s, w, size, bold) {
  const out = [];
  String(s).split('\n').forEach((par) => {
    if (par === '') { out.push(''); return; }
    let line = '';
    par.split(' ').forEach((wd) => {
      const t = line ? line + ' ' + wd : wd;
      if (tw(t, size, bold) <= w) { line = t; return; }
      if (line) { out.push(line); line = ''; }
      if (tw(wd, size, bold) <= w) { line = wd; return; }
      let chunk = '';
      for (const ch of wd) {
        if (chunk && tw(chunk + ch, size, bold) > w) { out.push(chunk); chunk = ch; } else chunk += ch;
      }
      line = chunk;
    });
    out.push(line);
  });
  return out;
}
function fit(s, w, size, bold) {
  s = String(s).replace(/\n/g, ' ');
  if (tw(s, size, bold) <= w) return s;
  while (s.length > 1 && tw(s + '...', size, bold) > w) s = s.slice(0, -1);
  return s + '...';
}

/* ------------------------------------------------------------------ colours */
function hex2rgb(h) {
  h = String(h || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function lum(h) {
  const c = hex2rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function inkOn(h) { const L = lum(h); return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? '#ffffff' : '#111418'; }
function mixHex(h, other, t) { const a = hex2rgb(h), b = hex2rgb(other); return toHex(a.map((v, i) => v + (b[i] - v) * t)); }
function readable(h) { let k = 0; while ((1.05 / (lum(h) + 0.05)) < 4.5 && k < 12) { h = mixHex(h, '#000000', 0.12); k++; } return h; }

/* ------------------------------------------------------------------ money and totals */
const CURRENCY_FALLBACK = 'NGN USD EUR GBP KES GHS ZAR AED KWD CAD AUD INR EGP SAR QAR BHD OMR JOD MAD TZS UGX RWF XOF XAF ETB ZMW BWP NAD MUR PKR BDT LKR NPR CNY JPY KRW SGD MYR IDR THB PHP VND HKD NZD CHF SEK NOK DKK PLN CZK HUF RON TRY BRL MXN ARS CLP COP PEN ILS UAH RUB'.split(' ');
const POPULAR = ['NGN', 'USD', 'EUR', 'GBP', 'KES', 'GHS', 'ZAR', 'AED', 'KWD', 'CAD', 'AUD', 'INR', 'EGP'];

function makeFmt(cur, useCode) {
  const mk = (display, extra) => new Intl.NumberFormat('en', Object.assign({ style: 'currency', currency: cur, currencyDisplay: display }, extra || {}));
  let nf, nfc, rf, rfc, dec = 2;
  try {
    nf = mk(useCode ? 'code' : 'narrowSymbol');
    nfc = mk('code');
    dec = nf.resolvedOptions().maximumFractionDigits;
    rf = mk(useCode ? 'code' : 'narrowSymbol', { minimumFractionDigits: dec, maximumFractionDigits: Math.max(dec, 4) });
    rfc = mk('code', { minimumFractionDigits: dec, maximumFractionDigits: Math.max(dec, 4) });
  } catch (e) {
    const plain = { format: (n) => cur + ' ' + n.toFixed(2) };
    nf = nfc = rf = rfc = plain;
  }
  const safe = (s) => { for (const ch of s) if (!okCp(ch.codePointAt(0))) return false; return true; };
  const k = Math.pow(10, dec);
  const f = (minor) => { const a = nf.format(minor / k); return safe(a) ? a : nfc.format(minor / k); };
  const fr = (major) => { const a = rf.format(major); return safe(a) ? a : rfc.format(major); };
  return { dec: dec, k: k, money: f, rate: fr };
}
const rnd = (x) => Math.round(+x.toPrecision(12));       // round half up, safe against 1.005 style float noise
const numOk = (n) => typeof n === 'number' && isFinite(n);
const trimNum = (n) => String(+(+n).toFixed(3));

function calc(M, fm) {
  const k = fm.k;
  const lines = [];
  M.items.forEach((it) => {
    const qty = numOk(it.qty) ? it.qty : 0, rate = numOk(it.rate) ? it.rate : 0;
    const taxPct = numOk(it.tax) && it.tax > 0 ? it.tax : 0;
    if (!it.desc && !(qty && rate)) return;
    lines.push({ desc: it.desc, qty: qty, rate: rate, taxPct: taxPct, amt: rnd(qty * rate * k), ph: !!it.ph });
  });
  const subtotal = lines.reduce((s, l) => s + l.amt, 0);
  let discount = 0;
  const dv = numOk(M.disc.val) ? M.disc.val : 0;
  if (M.disc.type === 'pct') discount = rnd(subtotal * Math.min(Math.max(dv, 0), 100) / 100);
  else discount = Math.min(Math.max(rnd(dv * k), 0), Math.max(subtotal, 0));
  const f = subtotal > 0 ? (subtotal - discount) / subtotal : 1;
  const groups = {};
  let lineTax = 0;
  lines.forEach((l) => {
    l.tax = l.taxPct ? rnd(l.amt * f * l.taxPct / 100) : 0;
    lineTax += l.tax;
    if (l.taxPct) groups[l.taxPct] = (groups[l.taxPct] || 0) + l.tax;
  });
  const taxGroups = Object.keys(groups).map((r) => ({ rate: +r, amt: groups[r] })).sort((a, b) => a.rate - b.rate);
  const pct = numOk(M.taxPct) && M.taxPct > 0 ? M.taxPct : 0;
  const overallTax = pct ? rnd((subtotal - discount) * pct / 100) : 0;
  const shipping = numOk(M.shipping) ? rnd(M.shipping * k) : 0;
  const total = subtotal - discount + lineTax + overallTax + shipping;
  const out = { dec: fm.dec, lines: lines, subtotal: subtotal, discount: discount, taxGroups: taxGroups, lineTax: lineTax, overallTax: overallTax, shipping: shipping, total: total };
  if (M.kind === 'receipt') {
    out.received = numOk(M.paid) ? rnd(M.paid * k) : total;
    out.change = Math.max(0, out.received - total);
    out.owing = Math.max(0, total - out.received);
  } else {
    out.paid = numOk(M.paid) ? rnd(M.paid * k) : 0;
    out.balance = Math.max(0, total - out.paid);
    out.over = Math.max(0, out.paid - total);
  }
  return out;
}

/* ------------------------------------------------------------------ dates */
function fdate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return '';
  const p = s.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  try { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace(/\u202f/g, ' '); } catch (e) { return s; }
}
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function addDays(s, n) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return '';
  const p = s.split('-').map(Number);
  return ymd(new Date(p[0], p[1] - 1, p[2] + n));
}
function nextNo(s) {
  s = String(s || '').trim();
  const m = /^(.*?)(\d+)(\D*)$/.exec(s);
  if (!m) return (s || 'INV') + '-2';
  const n = String(parseInt(m[2], 10) + 1).padStart(m[2].length, '0');
  return m[1] + n + m[3];
}

/* ------------------------------------------------------------------ layout builder */
const PAPERS = { a4: { w: 210, h: 297 }, letter: { w: 215.9, h: 279.4 }, a5: { w: 148, h: 210 }, thermal: { w: 80, h: 0 } };
const GRAY = '#555b63', GRAY2 = '#9aa0a8', INK = '#15181d', HAIR = '#d5d8dd';

class Builder {
  constructor(W, H, m, auto) { this.W = W; this.H = H; this.m = m; this.auto = auto; this.cw = W - 2 * m; this.pages = [{ items: [] }]; this.y = m; }
  get items() { return this.pages[this.pages.length - 1].items; }
  limit() { return this.auto ? 1e9 : this.H - this.m - 4; }
  fits(h) { return this.y + h <= this.limit(); }
  newPage() { this.pages.push({ items: [] }); this.y = this.m; }
  rect(x, y, w, h, fill) { this.items.push({ t: 'r', x: x, y: y, w: w, h: h, fill: fill }); }
  line(x1, y1, x2, y2, w, color, dash) { this.items.push({ t: 'l', x1: x1, y1: y1, x2: x2, y2: y2, w: w, color: color, dash: dash }); }
  img(x, y, w, h, src) { this.items.push({ t: 'i', x: x, y: y, w: w, h: h, src: src }); }
  text(x, top, s, o) {
    if (s === '' || s == null) return;
    o = o || {};
    const size = o.size || 9.3, em = size * PT, lh = em * (o.lh || 1.4);
    const base = top + (lh - em * 1.362) / 2 + em * 1.069;
    const w = tw(s, size, o.bold);
    const ax = o.align === 'r' ? x - w : (o.align === 'c' ? x - w / 2 : x);
    this.items.push({ t: 't', x: ax, y: base, s: s, size: size, bold: !!o.bold, color: o.color || INK });
  }
  // wrapped paragraph, returns its height
  para(x, y, str, w, o) {
    o = o || {};
    const size = o.size || 9.3, lh = size * PT * (o.lh || 1.4);
    const ls = wrap(str, w, size, o.bold);
    ls.forEach((l, i) => { if (l) this.text(x, y + i * lh, l, o); });
    return ls.length * lh;
  }
}
const lineH = (size, k) => size * PT * (k || 1.4);
function fitImg(im, maxW, maxH) { const s = Math.min(maxW / im.w, maxH / im.h); return { w: im.w * s, h: im.h * s }; }

/* ------------------------------------------------------------------ page layout (invoice, A4, Letter, A5 receipt) */
function layoutPage(M) {
  const P = PAPERS[M.paper] || PAPERS.a4;
  const S = P.w < 160 ? 0.9 : 1;
  const b = new Builder(P.w, P.h, P.w < 160 ? 12 : 15, false);
  const W = b.W, m = b.m, cw = b.cw, c = M.calc, fmt = M.fmt.money, isR = M.kind === 'receipt', tpl = M.tpl;
  const acc = M.accent, accT = readable(acc), accOn = inkOn(acc);
  const F = { b: 9.3 * S, s: 8.2 * S, xs: 7.1 * S };
  const bizPh = !M.biz.name;
  const metaRows = isR
    ? [['Receipt no.', M.no], ['Date', fdate(M.issue)], ['Time', M.time], ['Cashier', M.cashier]]
    : [['Invoice no.', M.no], ['Issue date', fdate(M.issue)], ['Due date', fdate(M.due)]];
  const meta = metaRows.filter((r) => r[1]);
  const title = tpl === 'minimal' ? (isR ? 'Receipt' : 'Invoice') : (isR ? 'RECEIPT' : 'INVOICE');

  const bizLines = [M.biz.addr, M.biz.email, M.biz.phone, M.biz.tax ? 'Tax ID: ' + M.biz.tax : ''].filter(Boolean);

  function metaBlock(x, y, w) {
    const rh = lineH(F.s, 1.5);
    meta.forEach((r, i) => {
      b.text(x, y + i * rh, r[0], { size: F.s, color: GRAY });
      b.text(x + w, y + i * rh, fit(r[1], w - 26, F.s, true), { size: F.s, bold: true, align: 'r' });
    });
    return meta.length * rh;
  }

  /* ---- header: returns the y below it */
  function header() {
    if (tpl === 'bold') {
      let tx = W - m, plateW = 0, plateH = 0, logo = null;
      if (M.biz.logo) { logo = fitImg(M.biz.logo, 34, 18); plateW = logo.w + 5; plateH = logo.h + 5; tx = W - m - plateW - 5; }
      const nameSize = 13 * S, lw = cw * 0.5;
      const nameLines = wrap(M.biz.name || 'Your business name', lw, nameSize, true);
      let th = nameLines.length * lineH(nameSize, 1.3);
      const det = [];
      bizLines.forEach((l) => wrap(l, lw, F.s).forEach((x) => det.push(x)));
      th += det.length * lineH(F.s, 1.4) + 1;
      const bandH = Math.max(36 * S, th + 14, plateH + 12);
      b.rect(0, 0, W, bandH, acc);
      b.text(m, 9, title, { size: 26 * S, bold: true, color: accOn });
      if (M.no) b.text(m, 9 + lineH(26 * S, 1.2) + 1, '# ' + M.no, { size: F.b, color: accOn });
      let ty = (bandH - th) / 2;
      nameLines.forEach((l, i) => b.text(tx, ty + i * lineH(nameSize, 1.3), l, { size: nameSize, bold: true, color: accOn, align: 'r' }));
      ty += nameLines.length * lineH(nameSize, 1.3) + 1;
      det.forEach((l, i) => b.text(tx, ty + i * lineH(F.s, 1.4), l, { size: F.s, color: accOn, align: 'r' }));
      if (logo) {
        const px = W - m - plateW, py = (bandH - plateH) / 2;
        b.rect(px, py, plateW, plateH, '#ffffff');
        b.img(px + 2.5, py + 2.5, logo.w, logo.h, M.biz.logo.dataUrl);
      }
      return bandH + 9;
    }
    if (tpl === 'minimal') {
      let y = m, ly = y;
      if (M.biz.logo) { const d = fitImg(M.biz.logo, 36, 14); b.img(m, ly, d.w, d.h, M.biz.logo.dataUrl); ly += d.h + 3; }
      ly += b.para(m, ly, M.biz.name || 'Your business name', cw * 0.6, { size: 11.5 * S, bold: true, color: bizPh ? GRAY2 : INK }) + 0.5;
      b.text(W - m, y, title, { size: 11.5 * S, align: 'r', color: GRAY });
      b.line(m, ly + 3, W - m, ly + 3, 0.25, INK);
      b.line(m, ly + 3, m + 14, ly + 3, 0.9, acc);
      return ly + 10;
    }
    // clean
    const y = m, lw = cw * 0.54;
    let ly = y;
    if (M.biz.logo) { const d = fitImg(M.biz.logo, 46, 17 * S); b.img(m, ly, d.w, d.h, M.biz.logo.dataUrl); ly += d.h + 3; }
    ly += b.para(m, ly, M.biz.name || 'Your business name', lw, { size: 14.5 * S, bold: true, color: bizPh ? GRAY2 : INK }) + 0.6;
    bizLines.forEach((l) => { ly += b.para(m, ly, l, lw, { size: F.s, color: GRAY }); });
    b.text(W - m, y, title, { size: 25 * S, bold: true, color: accT, align: 'r' });
    const ry = y + lineH(25 * S, 1.25) + 2;
    const mh = metaBlock(W - m - 62, ry, 62);
    return Math.max(ly, ry + mh) + 8;
  }

  /* ---- bill to / figure */
  function parties(y) {
    const colW = cw * 0.5;
    const showC = !isR || M.client.name || M.client.addr || M.client.email;
    let hh = 0;
    if (showC) {
      b.text(m, y, isR ? 'RECEIVED FROM' : 'BILL TO', { size: F.xs, bold: true, color: GRAY });
      let cy = y + lineH(F.xs, 1.4) + 0.6;
      cy += b.para(m, cy, M.client.name || (isR ? '' : 'Client name'), colW, { size: 10.5 * S, bold: true, color: M.client.name ? INK : GRAY2 }) + 0.4;
      if (M.client.addr) cy += b.para(m, cy, M.client.addr, colW, { size: F.s, color: GRAY });
      if (M.client.email) cy += b.para(m, cy, M.client.email, colW, { size: F.s, color: GRAY });
      hh = cy - y;
    }
    if (tpl === 'clean') {
      const x = W - m;
      b.text(x, y, isR ? 'AMOUNT PAID' : 'BALANCE DUE', { size: F.xs, bold: true, color: GRAY, align: 'r' });
      b.text(x, y + lineH(F.xs, 1.4) + 0.4, fmt(isR ? c.received : c.balance), { size: 18 * S, bold: true, color: accT, align: 'r' });
      let sub = '';
      if (isR) sub = M.method ? 'Paid by ' + M.method : '';
      else if (M.due) sub = 'Due ' + fdate(M.due);
      if (sub) b.text(x, y + lineH(F.xs, 1.4) + 0.4 + lineH(18 * S, 1.25) + 0.5, sub, { size: F.s, color: GRAY, align: 'r' });
      hh = Math.max(hh, lineH(F.xs, 1.4) + lineH(18 * S, 1.25) + 6);
    } else {
      const mw = Math.min(70, cw * 0.46);
      hh = Math.max(hh, metaBlock(W - m - mw, y, mw));
    }
    return y + hh + 9;
  }

  /* ---- items table */
  const hasTax = !isR && c.lines.some((l) => l.taxPct > 0);
  const pad = tpl === 'bold' ? 2.5 : 0;
  const amtW = 30 * S, rateW = 27 * S, qtyW = 13 * S, taxW = 13 * S, gap = 2;
  const eAmt = W - m - pad;
  const eTax = eAmt - amtW - gap;
  const eRate = hasTax ? eTax - taxW - gap : eTax;
  const eQty = eRate - rateW - gap;
  const dX = m + pad, dW = eQty - qtyW - gap - dX - 1;

  function thead(y) {
    const hh = 8.2 * S;
    const col = tpl === 'bold' ? accOn : (tpl === 'minimal' ? GRAY : accT);
    if (tpl === 'bold') b.rect(m, y, cw, hh, acc);
    const o = { size: F.xs, bold: true, color: col };
    const ty = y + (hh - lineH(F.xs, 1.4)) / 2;
    b.text(dX, ty, isR ? 'ITEM' : 'DESCRIPTION', o);
    b.text(eQty, ty, 'QTY', Object.assign({ align: 'r' }, o));
    b.text(eRate, ty, isR ? 'PRICE' : 'RATE', Object.assign({ align: 'r' }, o));
    if (hasTax) b.text(eTax, ty, 'TAX', Object.assign({ align: 'r' }, o));
    b.text(eAmt, ty, 'AMOUNT', Object.assign({ align: 'r' }, o));
    if (tpl === 'clean') b.line(m, y + hh, W - m, y + hh, 0.5, acc);
    if (tpl === 'minimal') b.line(m, y + hh, W - m, y + hh, 0.25, INK);
    return hh;
  }

  function table() {
    b.y += thead(b.y);
    const items = c.lines.length ? c.lines : [{ desc: isR ? 'Item name' : 'Item description', qty: 1, rate: 0, amt: 0, taxPct: 0, ph: true }];
    items.forEach((l, i) => {
      const dl = wrap(l.desc, dW, F.b);
      const rh = Math.max(dl.length, 1) * lineH(F.b, 1.35) + 4.4;
      if (!b.fits(rh)) { b.newPage(); b.y += thead(b.y); }
      const y = b.y;
      if (tpl === 'bold' && i % 2 === 1) b.rect(m, y, cw, rh, mixHex(acc, '#ffffff', 0.93));
      const ty = y + 2.2, col = l.ph ? GRAY2 : INK;
      dl.forEach((t, j) => b.text(dX, ty + j * lineH(F.b, 1.35), t, { size: F.b, lh: 1.35, color: col }));
      const nq = { size: F.b, lh: 1.35, align: 'r', color: col };
      b.text(eQty, ty, trimNum(l.qty), nq);
      b.text(eRate, ty, M.fmt.rate(l.rate), nq);
      if (hasTax) b.text(eTax, ty, l.taxPct ? trimNum(l.taxPct) + '%' : '-', { size: F.b, lh: 1.35, align: 'r', color: l.taxPct ? col : GRAY2 });
      b.text(eAmt, ty, fmt(l.amt), { size: F.b, lh: 1.35, align: 'r', bold: true, color: col });
      if (tpl !== 'bold') b.line(m, y + rh, W - m, y + rh, 0.2, HAIR);
      b.y += rh;
    });
    b.y += 5;
  }

  /* ---- totals and side notes */
  function totalsRows() {
    const r = [];
    r.push({ l: 'Subtotal', v: fmt(c.subtotal) });
    if (c.discount) r.push({ l: 'Discount' + (M.disc.type === 'pct' && M.disc.val ? ' (' + trimNum(M.disc.val) + '%)' : ''), v: '-' + fmt(c.discount) });
    c.taxGroups.forEach((g) => r.push({ l: 'Tax (' + trimNum(g.rate) + '%)', v: fmt(g.amt) }));
    if (M.taxPct > 0) r.push({ l: (M.taxName || 'Tax') + ' (' + trimNum(M.taxPct) + '%)', v: fmt(c.overallTax) });
    if (c.shipping) r.push({ l: 'Shipping', v: fmt(c.shipping) });
    r.push({ l: 'Total', v: fmt(c.total), bold: true, top: true, size: F.b + 1.2 });
    if (isR) {
      r.push({ l: 'Amount received', v: fmt(c.received) });
      if (c.change > 0) r.push({ l: 'Change', v: fmt(c.change), bold: true });
      else if (c.owing > 0) r.push({ l: 'Balance owing', v: fmt(c.owing), final: true });
    } else {
      if (c.paid) r.push({ l: 'Amount paid', v: '-' + fmt(c.paid) });
      r.push({ l: 'Balance due', v: fmt(c.balance), final: true });
    }
    return r;
  }

  function leftContent(w) {
    const out = [];
    const add = (label, text) => {
      out.push({ s: label, size: F.xs, bold: true, color: GRAY, gap: out.length ? 3.5 : 0 });
      wrap(text, w, F.s).forEach((l) => out.push({ s: l, size: F.s, color: INK }));
    };
    if (isR) {
      if (M.method) add('PAYMENT METHOD', M.method);
      if (M.notes) add('NOTES', M.notes);
    } else {
      const pay = [];
      if (M.pay.bank) pay.push('Bank: ' + M.pay.bank);
      if (M.pay.name) pay.push('Account name: ' + M.pay.name);
      if (M.pay.no) pay.push('Account number: ' + M.pay.no);
      if (M.pay.link) pay.push(M.pay.link);
      if (pay.length) add('PAYMENT DETAILS', pay.join('\n'));
      if (M.notes) add('NOTES', M.notes);
    }
    return out;
  }

  function totalsBlock() {
    const tW = 78 * S, x0 = W - m - tW;
    const rows = totalsRows();
    const stack = (cw - tW - 8) < 42;
    const lw = stack ? cw : cw - tW - 8;
    const left = leftContent(lw);
    const rh = (r) => lineH(r.size || F.b, 1.35) + (r.final ? 4 : (r.top ? 3.2 : 1.6));
    let th = rows.reduce((s, r) => s + rh(r), 0);
    const lh = left.reduce((s, l) => s + lineH(l.size, 1.4) + (l.gap || 0), 0);
    let total = stack ? th + (lh ? lh + 6 : 0) : Math.max(th, lh);
    if (!b.fits(total)) b.newPage();
    let y = b.y, ly = y;
    rows.forEach((r) => {
      const h = rh(r);
      let size = r.size || F.b, col = INK, lcol = GRAY, bold = !!r.bold;
      if (r.top && tpl !== 'bold') b.line(x0, y + 0.4, W - m, y + 0.4, tpl === 'minimal' ? 0.3 : 0.3, INK);
      if (r.final) {
        if (tpl === 'bold') { b.rect(x0 - 2, y, tW + 4, h, acc); col = accOn; lcol = accOn; }
        else { b.line(x0, y + 0.4, W - m, y + 0.4, 0.5, tpl === 'minimal' ? INK : acc); col = tpl === 'minimal' ? INK : accT; lcol = col; }
        bold = true; size = F.b + 2.2;
      }
      const ty = y + (h - lineH(size, 1.35)) / 2 + (r.top ? 0.8 : 0) - (r.final ? 0.3 : 0);
      b.text(x0 + (r.final && tpl === 'bold' ? 0.5 : 0), ty, r.l, { size: size, lh: 1.35, bold: bold, color: lcol });
      b.text(W - m - (r.final && tpl === 'bold' ? 0.5 : 0), ty, r.v, { size: size, lh: 1.35, bold: bold || !!r.bold, color: col, align: 'r' });
      y += h;
    });
    if (stack) ly = y + 6;
    left.forEach((l) => { ly += (l.gap || 0); b.text(m, ly, l.s, { size: l.size, bold: l.bold, color: l.color }); ly += lineH(l.size, 1.4); });
    b.y = Math.max(y, ly) + 6;
  }

  function signature() {
    if (isR) return;
    if (!M.sig) return;
    const d = fitImg(M.sig, 50, 17);
    const need = d.h + 12;
    if (!b.fits(need)) b.newPage();
    const x = W - m - 56, y = b.y + 2;
    b.img(x + (56 - d.w) / 2, y, d.w, d.h, M.sig.dataUrl);
    b.line(x, y + d.h + 1.5, W - m, y + d.h + 1.5, 0.3, INK);
    b.text(x, y + d.h + 2.5, 'Authorised signature', { size: F.xs, color: GRAY });
    b.y = y + d.h + 2.5 + lineH(F.xs, 1.4) + 3;
  }

  function thanks() {
    if (!isR || !M.thanks) return;
    const h = wrap(M.thanks, cw, 10 * S).length * lineH(10 * S, 1.4);
    if (!b.fits(h + 6)) b.newPage();
    b.y += 4;
    b.para(W / 2, b.y, M.thanks, cw, { size: 10 * S, color: GRAY, align: 'c' });
    b.y += h;
  }

  let y = header();
  y = parties(y);
  b.y = y;
  table();
  totalsBlock();
  signature();
  thanks();
  if (b.pages.length > 1) {
    b.pages.forEach((p, i) => {
      const s = 'Page ' + (i + 1) + ' of ' + b.pages.length;
      p.items.push({ t: 't', x: W / 2 - tw(s, 7.5, false) / 2, y: P.h - 8, s: s, size: 7.5, bold: false, color: GRAY2 });
    });
  }
  return { W: W, H: P.h, pages: b.pages };
}

/* ------------------------------------------------------------------ thermal receipt (80 mm) */
function layoutThermal(M) {
  const b = new Builder(80, 0, 4, true);
  const W = 80, m = 4, cw = 72, c = M.calc, fmt = M.fmt.money;
  const B = 8, SM = 7.2;
  let y = m;
  const center = (str, o) => { const h = b.para(W / 2, y, str, cw, Object.assign({ align: 'c' }, o)); y += h; };
  const sep = () => { y += 1; b.line(m, y, W - m, y, 0.25, INK, [0.9, 0.9]); y += 2.2; };
  const kv = (l, v, o) => {
    o = o || {};
    const size = o.size || SM;
    b.text(m, y, l, { size: size, color: o.lc || GRAY, bold: o.bold });
    b.text(W - m, y, fit(v, cw - tw(l, size, o.bold) - 2, size, o.bold), { size: size, bold: o.vb !== undefined ? o.vb : o.bold, align: 'r', color: o.vc || INK });
    y += lineH(size, 1.45);
  };
  if (M.biz.logo) { const d = fitImg(M.biz.logo, 38, 18); b.img((W - d.w) / 2, y, d.w, d.h, M.biz.logo.dataUrl); y += d.h + 2; }
  center(M.biz.name || 'Your business name', { size: 11, bold: true, color: M.biz.name ? INK : GRAY2, lh: 1.3 });
  [M.biz.addr, M.biz.phone, M.biz.email, M.biz.tax ? 'Tax ID: ' + M.biz.tax : ''].filter(Boolean).forEach((l) => center(l, { size: SM, color: GRAY, lh: 1.35 }));
  sep();
  center('RECEIPT', { size: 9.5, bold: true });
  y += 0.8;
  if (M.no) kv('Receipt no.', M.no);
  if (M.issue) kv('Date', fdate(M.issue));
  if (M.time) kv('Time', M.time);
  if (M.cashier) kv('Cashier', M.cashier);
  if (M.client.name) kv('Customer', M.client.name);
  if (M.client.email) kv('Contact', M.client.email);
  sep();
  b.text(m, y, 'ITEM', { size: 6.6, bold: true, color: GRAY });
  b.text(W - m, y, 'AMOUNT', { size: 6.6, bold: true, color: GRAY, align: 'r' });
  y += lineH(6.6, 1.5) + 0.6;
  const items = c.lines.length ? c.lines : [{ desc: 'Item name', qty: 1, rate: 0, amt: 0, ph: true }];
  items.forEach((l) => {
    const col = l.ph ? GRAY2 : INK;
    y += b.para(m, y, l.desc, cw, { size: B, bold: true, color: col, lh: 1.3 });
    b.text(m, y, trimNum(l.qty) + ' x ' + M.fmt.rate(l.rate), { size: SM, color: GRAY });
    b.text(W - m, y, fmt(l.amt), { size: B, align: 'r', color: col });
    y += lineH(B, 1.4) + 1.2;
  });
  sep();
  kv('Subtotal', fmt(c.subtotal), { size: B });
  if (c.discount) kv('Discount' + (M.disc.type === 'pct' && M.disc.val ? ' (' + trimNum(M.disc.val) + '%)' : ''), '-' + fmt(c.discount), { size: B });
  if (M.taxPct > 0) kv((M.taxName || 'Tax') + ' (' + trimNum(M.taxPct) + '%)', fmt(c.overallTax), { size: B });
  y += 1;
  b.line(m, y, W - m, y, 0.4, INK);
  y += 1.6;
  kv('TOTAL', fmt(c.total), { size: 11, bold: true, lc: INK });
  sep();
  if (M.method) kv('Paid by', M.method, { size: B });
  kv('Amount received', fmt(c.received), { size: B });
  if (c.change > 0) kv('Change', fmt(c.change), { size: B, bold: true, lc: INK });
  else if (c.owing > 0) kv('Balance owing', fmt(c.owing), { size: B, bold: true, lc: INK });
  if (M.thanks) { sep(); y += 0.5; center(M.thanks, { size: B, color: GRAY, lh: 1.4 }); }
  y += m;
  return { W: W, H: Math.ceil(y), pages: b.pages };
}

function layout(M) { return M.paper === 'thermal' ? layoutThermal(M) : layoutPage(M); }

/* ------------------------------------------------------------------ SVG preview and print */
function svgOf(L, p, sized) {
  let s = '<svg class="dg-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + r3(L.W) + ' ' + r3(L.H) + '"' + (sized ? ' style="width:' + r3(L.W) + 'mm;height:' + r3(L.H) + 'mm"' : '') + '>';
  s += '<rect x="0" y="0" width="' + r3(L.W) + '" height="' + r3(L.H) + '" fill="#ffffff"/>';
  p.items.forEach((it) => {
    if (it.t === 'r') s += '<rect x="' + r3(it.x) + '" y="' + r3(it.y) + '" width="' + r3(it.w) + '" height="' + r3(it.h) + '" fill="' + it.fill + '"/>';
    else if (it.t === 'l') s += '<line x1="' + r3(it.x1) + '" y1="' + r3(it.y1) + '" x2="' + r3(it.x2) + '" y2="' + r3(it.y2) + '" stroke="' + it.color + '" stroke-width="' + it.w + '"' + (it.dash ? ' stroke-dasharray="' + it.dash.join(' ') + '"' : '') + '/>';
    else if (it.t === 'i') s += '<image x="' + r3(it.x) + '" y="' + r3(it.y) + '" width="' + r3(it.w) + '" height="' + r3(it.h) + '" href="' + it.src + '" preserveAspectRatio="xMidYMid meet"/>';
    else s += '<text x="' + r3(it.x) + '" y="' + r3(it.y) + '" font-family="DocSans, sans-serif" font-size="' + r3(it.size * PT) + '" font-weight="' + (it.bold ? 700 : 400) + '" fill="' + it.color + '" style="white-space:pre;font-kerning:none">' + esc(it.s) + '</text>';
  });
  return s + '</svg>';
}

/* ------------------------------------------------------------------ PDF */
const scriptPromises = {};
function loadScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve();
  if (scriptPromises[src]) return scriptPromises[src];
  scriptPromises[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(); s.onerror = () => { delete scriptPromises[src]; rej(new Error('could not load ' + src)); };
    document.head.appendChild(s);
  });
  return scriptPromises[src];
}
async function bytesOf(url) { const r = await fetch(url); if (!r.ok) throw new Error('could not load ' + url); return new Uint8Array(await r.arrayBuffer()); }

async function buildPdf(L, meta) {
  await Promise.all([loadScript('/tools/vendor/pdf-lib/pdf-lib.min.js', 'PDFLib'), loadScript('/tools/vendor/fontkit/fontkit.umd.min.js', 'fontkit')]);
  const { PDFDocument, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(window.fontkit);
  const [rb, bb] = await Promise.all([bytesOf(FONT_FILES[400]), bytesOf(FONT_FILES[700])]);
  const fonts = { r: await pdf.embedFont(rb, { subset: true }), b: await pdf.embedFont(bb, { subset: true }) };
  const col = (h) => { const a = hex2rgb(h); return rgb(a[0] / 255, a[1] / 255, a[2] / 255); };
  const pt = (mm) => mm / PT;
  const imgs = {};
  async function image(src) {
    if (!imgs[src]) {
      const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
      imgs[src] = /^data:image\/png/.test(src) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    }
    return imgs[src];
  }
  const ph = pt(L.H);
  for (const pg of L.pages) {
    const page = pdf.addPage([pt(L.W), ph]);
    for (const it of pg.items) {
      if (it.t === 'r') page.drawRectangle({ x: pt(it.x), y: ph - pt(it.y + it.h), width: pt(it.w), height: pt(it.h), color: col(it.fill) });
      else if (it.t === 'l') page.drawLine({ start: { x: pt(it.x1), y: ph - pt(it.y1) }, end: { x: pt(it.x2), y: ph - pt(it.y2) }, thickness: pt(it.w), color: col(it.color), dashArray: it.dash ? it.dash.map(pt) : undefined });
      else if (it.t === 'i') page.drawImage(await image(it.src), { x: pt(it.x), y: ph - pt(it.y + it.h), width: pt(it.w), height: pt(it.h) });
      else if (it.s.trim()) page.drawText(it.s, { x: pt(it.x), y: ph - pt(it.y), size: it.size, font: it.bold ? fonts.b : fonts.r, color: col(it.color) });
    }
  }
  pdf.setTitle(meta.title); pdf.setAuthor(meta.author || ''); pdf.setSubject(meta.title);
  pdf.setCreator('Free invoice and receipt generator'); pdf.setProducer('pdf-lib'); pdf.setCreationDate(new Date());
  return pdf.save();
}

/* ------------------------------------------------------------------ the tool (form, preview, actions) */
const LS_KEY = 'lt-docgen-v1';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; } };
const lsSet = (o) => { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); return true; } catch (e) { return false; } };
const lsDel = () => { try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ } };
const SAVE_IDS = ['dg-biz-name', 'dg-biz-addr', 'dg-biz-email', 'dg-biz-phone', 'dg-biz-tax', 'dg-cur', 'dg-curcode', 'dg-bank', 'dg-acct-name', 'dg-acct-no', 'dg-paylink',
  'dg-notes', 'dg-thanks', 'dg-taxname', 'dg-taxpct', 'dg-accent', 'dg-tpl', 'dg-paper', 'dg-cashier'];
const KIND_IDS = ['dg-tpl', 'dg-paper', 'dg-notes'];

function guessCurrency() {
  const tz = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })();
  const map = { 'Africa/Lagos': 'NGN', 'Africa/Accra': 'GHS', 'Africa/Nairobi': 'KES', 'Africa/Johannesburg': 'ZAR', 'Asia/Dubai': 'AED', 'Asia/Kuwait': 'KWD', 'Africa/Cairo': 'EGP', 'Europe/London': 'GBP', 'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR' };
  if (map[tz]) return map[tz];
  if (/^Australia\//.test(tz)) return 'AUD';
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Regina)/.test(tz)) return 'CAD';
  if (/^Europe\//.test(tz) && tz !== 'Europe/London') return 'EUR';
  return 'USD';
}

function init(cfg) {
  const root = $('dg-tool');
  if (!root) return;
  const kind = cfg.kind, isR = kind === 'receipt';
  const st = { logo: null, sig: null, drawn: false };
  let L = null, lastM = null, timer = 0, saveTimer = 0, resetTimer = 0;
  const view = $('dg-pages');
  const say = (msg, bad) => { const e = $('dg-status'); e.textContent = msg || ''; e.className = 'help' + (bad ? ' err' : ''); };
  const val = (id) => { const e = $(id); return e ? e.value : ''; };
  const numv = (id) => { const e = $(id); if (!e || e.value.trim() === '') return NaN; const n = Number(e.value); return isFinite(n) ? n : NaN; };

  /* currency list */
  (function fillCurrencies() {
    let codes = [];
    try { codes = Intl.supportedValuesOf('currency'); } catch (e) { codes = CURRENCY_FALLBACK.slice(); }
    let dn = null;
    try { dn = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch (e) { dn = null; }
    const label = (c) => { let n = ''; try { n = dn ? dn.of(c) : ''; } catch (e) { n = ''; } return c + (n && n !== c ? ' - ' + n : ''); };
    const sel = $('dg-cur');
    const pop = POPULAR.filter((c) => codes.indexOf(c) >= 0 || CURRENCY_FALLBACK.indexOf(c) >= 0);
    const g1 = document.createElement('optgroup'); g1.label = 'Popular';
    pop.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = label(c); g1.appendChild(o); });
    const g2 = document.createElement('optgroup'); g2.label = 'All currencies';
    codes.filter((c) => /^[A-Z]{3}$/.test(c)).sort().forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = label(c); g2.appendChild(o); });
    sel.appendChild(g1); sel.appendChild(g2);
    sel.value = guessCurrency();
    if (sel.value !== guessCurrency()) sel.value = 'USD';
  })();

  /* line items */
  const itemsEl = $('dg-items');
  let itemCount = 0;
  function addItem(d) {
    d = d || {};
    itemCount++;
    const n = itemCount;
    const row = document.createElement('div');
    row.className = 'dg-item';
    const taxCell = isR ? '' : '<div class="dg-c-t"><label class="dg-sm" for="dg-i' + n + '-tax">Tax %</label><input type="number" id="dg-i' + n + '-tax" data-f="tax" min="0" max="100" step="any" inputmode="decimal" placeholder="0"></div>';
    row.innerHTML = '<div class="dg-c-d"><label class="dg-sm" for="dg-i' + n + '-desc">' + (isR ? 'Item' : 'Description') + '</label><input type="text" id="dg-i' + n + '-desc" data-f="desc" maxlength="200" autocomplete="off" placeholder="' + (isR ? 'Item name' : 'What you did or sold') + '"></div>'
      + '<div class="dg-c-q"><label class="dg-sm" for="dg-i' + n + '-qty">Qty</label><input type="number" id="dg-i' + n + '-qty" data-f="qty" min="0" step="any" inputmode="decimal" value="1"></div>'
      + '<div class="dg-c-r"><label class="dg-sm" for="dg-i' + n + '-rate">' + (isR ? 'Price' : 'Rate') + '</label><input type="number" id="dg-i' + n + '-rate" data-f="rate" step="any" inputmode="decimal" placeholder="0.00"></div>'
      + taxCell
      + '<div class="dg-c-x"><button type="button" class="btn dg-x" aria-label="Remove this item" title="Remove this item">&times;</button></div>';
    if (isR) row.classList.add('dg-item-r');
    itemsEl.appendChild(row);
    if (d.desc != null) row.querySelector('[data-f=desc]').value = d.desc;
    if (d.qty != null) row.querySelector('[data-f=qty]').value = d.qty;
    if (d.rate != null) row.querySelector('[data-f=rate]').value = d.rate;
    if (d.tax != null && !isR) row.querySelector('[data-f=tax]').value = d.tax;
    renumber();
    return row;
  }
  function renumber() {
    const rows = itemsEl.querySelectorAll('.dg-item');
    rows.forEach((r, i) => {
      r.querySelectorAll('input').forEach((inp) => { const f = inp.getAttribute('data-f'); inp.setAttribute('aria-label', 'Item ' + (i + 1) + ' ' + ({ desc: 'description', qty: 'quantity', rate: isR ? 'price' : 'rate', tax: 'tax percent' }[f])); });
      r.querySelector('.dg-x').disabled = rows.length === 1;
    });
  }
  itemsEl.addEventListener('click', (e) => {
    const x = e.target.closest('.dg-x');
    if (!x || x.disabled) return;
    x.closest('.dg-item').remove(); renumber(); schedule(); scheduleSave();
  });
  $('dg-add').addEventListener('click', () => { const r = addItem(); r.querySelector('[data-f=desc]').focus(); schedule(); });

  /* model */
  function readModel() {
    replacedChars = false;
    const cur = val('dg-cur') || 'USD';
    const fm = makeFmt(cur, !!($('dg-curcode') && $('dg-curcode').checked));
    const M = {
      kind: kind, cur: cur, fm: fm, fmt: fm,
      biz: { name: clean(val('dg-biz-name').trim()), addr: clean(val('dg-biz-addr').trim()), email: clean(val('dg-biz-email').trim()), phone: clean(val('dg-biz-phone').trim()), tax: clean(val('dg-biz-tax').trim()), logo: st.logo },
      client: { name: clean(val('dg-cl-name').trim()), addr: clean(val('dg-cl-addr').trim()), email: clean(val('dg-cl-email').trim()) },
      no: clean(val('dg-no').trim()), issue: val('dg-issue'), due: val('dg-due'), time: val('dg-time'),
      method: isR ? (val('dg-method') === 'Other' ? clean(val('dg-method-other').trim()) || 'Other' : val('dg-method')) : '',
      cashier: clean(val('dg-cashier').trim()),
      items: [], disc: { type: val('dg-disc-type') === 'fixed' ? 'fixed' : 'pct', val: numv('dg-disc') },
      shipping: numv('dg-ship'), taxPct: numv('dg-taxpct'), taxName: clean(val('dg-taxname').trim()),
      paid: numv('dg-paid'), notes: clean(val('dg-notes').trim()), thanks: clean(val('dg-thanks').trim()),
      pay: { bank: clean(val('dg-bank').trim()), name: clean(val('dg-acct-name').trim()), no: clean(val('dg-acct-no').trim()), link: clean(val('dg-paylink').trim()) },
      sig: isR ? null : (val('dg-sig-mode') === 'none' ? null : st.sig),
      tpl: val('dg-tpl') || 'clean', accent: /^#[0-9a-f]{6}$/i.test(val('dg-accent')) ? val('dg-accent') : '#2563eb', paper: val('dg-paper') || (isR ? 'thermal' : 'a4')
    };
    itemsEl.querySelectorAll('.dg-item').forEach((r, i) => {
      const g = (f) => { const e = r.querySelector('[data-f=' + f + ']'); return e ? e.value : ''; };
      const q = g('qty').trim() === '' ? NaN : Number(g('qty')), rt = g('rate').trim() === '' ? NaN : Number(g('rate')), tx = g('tax').trim() === '' ? 0 : Number(g('tax'));
      M.items.push({ n: i + 1, desc: clean(g('desc').trim()), qty: q, rate: rt, tax: tx });
    });
    M.hasReal = M.items.some((it) => it.desc || numOk(it.rate));
    if (!M.hasReal) M.items = [];
    M.calc = calc(M, fm);
    M.replaced = replacedChars;
    return M;
  }

  function validate(M) {
    const errs = [], warns = [];
    const add = (id, msg) => errs.push({ id: id, msg: msg });
    if (!M.biz.name) add('dg-biz-name', 'Enter your business name.');
    if (!isR && !M.client.name) add('dg-cl-name', 'Enter the client name.');
    let any = false;
    M.items.forEach((it) => {
      if (!it.desc && !numOk(it.rate)) return;
      any = true;
      const row = itemsEl.querySelectorAll('.dg-item')[it.n - 1];
      if (!it.desc) add(row.querySelector('[data-f=desc]').id, 'Item ' + it.n + ' needs a description.');
      if (!numOk(it.qty) || it.qty <= 0) add(row.querySelector('[data-f=qty]').id, 'Item ' + it.n + ' needs a quantity above 0.');
      if (!numOk(it.rate)) add(row.querySelector('[data-f=rate]').id, 'Item ' + it.n + ' needs a ' + (isR ? 'price' : 'rate') + '.');
      if (numOk(it.tax) && (it.tax < 0 || it.tax > 100)) add(row.querySelector('[data-f=tax]').id, 'Item ' + it.n + ' tax must be between 0 and 100.');
    });
    if (!any) add(itemsEl.querySelector('[data-f=desc]').id, 'Add at least one item with a ' + (isR ? 'price' : 'rate') + '.');
    if (!isNaN(M.disc.val) && M.disc.val < 0) add('dg-disc', 'Discount cannot be negative.');
    if (M.disc.type === 'pct' && M.disc.val > 100) add('dg-disc', 'A percent discount cannot be more than 100.');
    if (!isNaN(M.taxPct) && (M.taxPct < 0 || M.taxPct > 100)) add('dg-taxpct', 'Tax percent must be between 0 and 100.');
    if (!isNaN(M.shipping) && M.shipping < 0) add('dg-ship', 'Shipping cannot be negative.');
    if (!isNaN(M.paid) && M.paid < 0) add('dg-paid', 'The amount cannot be negative.');
    ['dg-biz-email', 'dg-cl-email'].forEach((id) => { const e = $(id); if (e && e.value && e.type === 'email' && !e.checkValidity()) add(id, 'That email address does not look right.'); });
    if (!isR && M.issue && M.due && M.due < M.issue) warns.push('The due date is before the issue date.');
    if (!isR && M.calc.over > 0) warns.push('The amount paid is more than the total, so the balance due shows as zero.');
    if (isR && M.calc.owing > 0) warns.push('The amount received is less than the total. The receipt will show the balance owing.');
    if (M.replaced) warns.push('Some characters (for example emoji or some non-Latin scripts) are not in the PDF font and show as ?.');
    return { errs: errs, warns: warns };
  }

  /* preview */
  function showWarns(v) {
    const w = $('dg-warn');
    w.textContent = v.warns.join(' ');
    w.hidden = !v.warns.length;
  }
  async function render() {
    try { await loadFonts(); } catch (e) { view.innerHTML = '<p class="help err">The preview font could not be loaded. Reload the page and try again.</p>'; return; }
    const M = readModel();
    lastM = M; L = layout(M);
    view.style.maxWidth = M.paper === 'thermal' ? '360px' : '';
    view.innerHTML = L.pages.map((p, i) => '<div class="dg-page" role="img" aria-label="' + (isR ? 'Receipt' : 'Invoice') + ' preview, page ' + (i + 1) + ' of ' + L.pages.length + '">' + svgOf(L, p) + '</div>').join('');
    showWarns(validate(M));
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(render, 70); }

  /* saving business details */
  function saveNow() {
    if (!$('dg-remember').checked) return;
    const old = lsGet() || {};
    const o = { f: old.f || {}, last: old.last || {}, logo: st.logo, sig: st.sig, sigMode: val('dg-sig-mode'), sigText: val('dg-sig-text') };
    SAVE_IDS.forEach((id) => {
      const e = $(id); if (!e) return;
      const key = KIND_IDS.indexOf(id) >= 0 ? id + '@' + kind : id;
      o.f[key] = e.type === 'checkbox' ? e.checked : e.value;
    });
    const ok = lsSet(o);
    $('dg-remember-note').textContent = ok ? 'Saved in this browser only.' : 'Your browser blocked saving, so nothing was stored.';
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); }
  function rememberNumber() {
    if (!$('dg-remember').checked) return;
    const o = lsGet() || { f: {}, last: {} };
    o.last = o.last || {}; o.last[kind] = val('dg-no');
    lsSet(o);
  }
  function applySaved(o) {
    SAVE_IDS.forEach((id) => {
      const e = $(id); if (!e) return;
      const key = KIND_IDS.indexOf(id) >= 0 ? id + '@' + kind : id;
      if (o.f && o.f[key] !== undefined) { if (e.type === 'checkbox') e.checked = !!o.f[key]; else e.value = o.f[key]; }
    });
    if (o.logo && o.logo.dataUrl) st.logo = o.logo;
    updateLogoUi();
    if (!isR && o.sig && o.sig.dataUrl) {
      st.sig = o.sig;
      $('dg-sig-mode').value = o.sigMode || 'none';
      $('dg-sig-text').value = o.sigText || '';
      if (o.sigMode === 'draw') {
        st.drawn = true;
        const im = new Image();
        im.onload = () => { const cv = $('dg-sig-canvas'), s = Math.min(1, (cv.width - 20) / im.width, (cv.height - 20) / im.height); cv.getContext('2d').drawImage(im, 10, 10, im.width * s, im.height * s); };
        im.src = o.sig.dataUrl;
      }
      sigUi();
    }
  }

  /* logo */
  function updateLogoUi() {
    $('dg-logo-clear').hidden = !st.logo;
    $('dg-logo-note').textContent = st.logo ? 'Logo added. It is resized in your browser and never uploaded.' : 'Optional. PNG, JPG, WebP or SVG. It stays in your browser.';
  }
  $('dg-logo').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { say('Choose an image file for the logo.', true); return; }
    if (f.size > 12 * 1048576) { say('That image is too large. Choose one under 12 MB.', true); return; }
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || 300, nh = img.naturalHeight || 300, sc = Math.min(1, 500 / Math.max(nw, nh));
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(nw * sc)); cv.height = Math.max(1, Math.round(nh * sc));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      let data = cv.toDataURL('image/png');
      if (data.length > 450000) {
        const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; const x = c2.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c2.width, c2.height); x.drawImage(cv, 0, 0); data = c2.toDataURL('image/jpeg', 0.88);
      }
      st.logo = { dataUrl: data, w: cv.width, h: cv.height };
      URL.revokeObjectURL(url); updateLogoUi(); say(''); schedule(); scheduleSave();
    };
    img.onerror = () => { URL.revokeObjectURL(url); say('That image could not be read.', true); };
    img.src = url;
  });
  $('dg-logo-clear').addEventListener('click', () => { st.logo = null; $('dg-logo').value = ''; updateLogoUi(); schedule(); scheduleSave(); });

  /* signature (invoice only) */
  function trimCanvas(cv) {
    const ctx = cv.getContext('2d'), w = cv.width, h = cv.height, d = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(cv, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return { dataUrl: o.toDataURL('image/png'), w: o.width, h: o.height };
  }
  function typedSig() {
    const text = val('dg-sig-text').trim();
    if (!text) { st.sig = null; return; }
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    const font = 'italic 72px "Segoe Script","Snell Roundhand","Brush Script MT","Lucida Handwriting","Apple Chancery",cursive';
    ctx.font = font;
    cv.width = Math.min(1600, Math.ceil(ctx.measureText(text).width) + 40); cv.height = 140;
    ctx.font = font; ctx.fillStyle = '#1b2a4a'; ctx.fillText(text, 20, 95);
    st.sig = trimCanvas(cv);
  }
  function sigUi() {
    if (isR) return;
    const mode = val('dg-sig-mode');
    $('dg-sig-type-box').hidden = mode !== 'type';
    $('dg-sig-draw-box').hidden = mode !== 'draw';
    if (mode === 'type') typedSig();
    else if (mode === 'draw') { if (!st.drawn) st.sig = null; }
    else st.sig = st.sig; // keep the last one in memory but it is not used
  }
  if (!isR) {
    const cv = $('dg-sig-canvas'), ctx = cv.getContext('2d');
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b2a4a';
    let down = false, last = null;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
    cv.addEventListener('pointerdown', (e) => { down = true; last = pos(e); cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last.x, last.y, 1.4, 0, 6.3); ctx.fillStyle = '#1b2a4a'; ctx.fill(); e.preventDefault(); });
    cv.addEventListener('pointermove', (e) => { if (!down) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; });
    const up = () => { if (!down) return; down = false; st.drawn = true; st.sig = trimCanvas(cv); schedule(); scheduleSave(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    $('dg-sig-clear').addEventListener('click', () => { ctx.clearRect(0, 0, cv.width, cv.height); st.drawn = false; st.sig = null; schedule(); scheduleSave(); });
    $('dg-sig-mode').addEventListener('change', () => { sigUi(); schedule(); scheduleSave(); });
    $('dg-sig-text').addEventListener('input', () => { typedSig(); schedule(); scheduleSave(); });
  }

  /* accent swatches */
  document.querySelectorAll('.dg-sw').forEach((b) => b.addEventListener('click', () => { $('dg-accent').value = b.getAttribute('data-c'); schedule(); scheduleSave(); }));

  /* terms and due date */
  function applyTerms() {
    if (isR) return;
    const t = val('dg-terms'), due = $('dg-due');
    if (t === 'custom') { due.disabled = false; return; }
    due.disabled = true;
    due.value = addDays(val('dg-issue'), parseInt(t, 10) || 0);
  }
  $('dg-terms') && $('dg-terms').addEventListener('change', applyTerms);
  $('dg-issue').addEventListener('input', applyTerms);
  $('dg-no-next') && $('dg-no-next').addEventListener('click', () => { $('dg-no').value = nextNo(val('dg-no')); schedule(); });
  const method = $('dg-method');
  if (method) method.addEventListener('change', () => { $('dg-method-other-box').hidden = method.value !== 'Other'; });

  /* generic listeners */
  root.addEventListener('input', () => { schedule(); scheduleSave(); });
  root.addEventListener('change', () => { schedule(); scheduleSave(); });
  $('dg-remember').addEventListener('change', () => {
    if ($('dg-remember').checked) { saveNow(); rememberNumber(); }
    else { lsDel(); $('dg-remember-note').textContent = 'Saved details were deleted from this browser.'; }
  });

  /* actions */
  function check() {
    const M = readModel(), v = validate(M);
    showWarns(v);
    if (v.errs.length) {
      const box = $('dg-errors');
      box.innerHTML = '<b>Fix these first:</b><ul>' + v.errs.map((e) => '<li><a href="#' + e.id + '">' + esc(e.msg) + '</a></li>').join('') + '</ul>';
      box.hidden = false;
      document.querySelectorAll('[aria-invalid=true]').forEach((e) => e.removeAttribute('aria-invalid'));
      v.errs.forEach((e) => { const el = $(e.id); if (el) el.setAttribute('aria-invalid', 'true'); });
      const first = $(v.errs[0].id); if (first) first.focus();
      say('');
      return null;
    }
    $('dg-errors').hidden = true;
    document.querySelectorAll('[aria-invalid=true]').forEach((e) => e.removeAttribute('aria-invalid'));
    return M;
  }
  $('dg-errors').addEventListener('click', (e) => {
    const a = e.target.closest('a'); if (!a) return;
    e.preventDefault(); const t = $(a.getAttribute('href').slice(1)); if (t) t.focus();
  });
  const fname = (M) => (isR ? 'receipt' : 'invoice') + '-' + (M.no || 'draft').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) + '.pdf';

  async function makePdf(M) {
    await loadFonts();
    const LL = layout(M);
    return buildPdf(LL, { title: (isR ? 'Receipt ' : 'Invoice ') + (M.no || ''), author: M.biz.name });
  }
  $('dg-pdf').addEventListener('click', async () => {
    const M = check(); if (!M) return;
    const btn = $('dg-pdf'); btn.disabled = true; say('Building your PDF...');
    try {
      const bytes = await makePdf(M);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname(M); document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      say('Downloaded ' + fname(M) + ' (' + Math.max(1, Math.round(bytes.length / 1024)) + ' KB). The text in it can be selected and searched.');
      rememberNumber();
    } catch (err) {
      say('The PDF could not be built here (' + err.message + '). Use Print and choose Save as PDF instead.', true);
    } finally { btn.disabled = false; }
  });

  let printStyle = null;
  $('dg-print').addEventListener('click', async () => {
    const M = check(); if (!M) return;
    await loadFonts();
    const LL = layout(M), sheet = $('print-sheet');
    sheet.className = 'dg-print';
    sheet.innerHTML = LL.pages.map((p) => '<div class="dg-pg" style="width:' + r3(LL.W) + 'mm;height:' + r3(LL.H) + 'mm">' + svgOf(LL, p, false) + '</div>').join('');
    if (!printStyle) { printStyle = document.createElement('style'); document.head.appendChild(printStyle); }
    printStyle.textContent = '@page{size:' + r3(LL.W) + 'mm ' + r3(LL.H) + 'mm;margin:0}';
    rememberNumber();
    const done = () => { sheet.innerHTML = ''; sheet.className = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  });

  function waText(M) {
    const c = M.calc, f = M.fmt.money, r = M.fmt.rate, o = [];
    o.push('*' + (isR ? 'Receipt' : 'Invoice') + (M.no ? ' ' + M.no : '') + '* from ' + M.biz.name);
    if (M.client.name) o.push((isR ? 'Customer: ' : 'To: ') + M.client.name);
    if (M.issue) o.push('Date: ' + fdate(M.issue) + (isR && M.time ? ', ' + M.time : ''));
    if (!isR && M.due) o.push('Due: ' + fdate(M.due));
    o.push('');
    c.lines.forEach((l, i) => o.push((i + 1) + '. ' + l.desc + ' - ' + trimNum(l.qty) + ' x ' + r(l.rate) + ' = ' + f(l.amt)));
    o.push('');
    o.push('Subtotal: ' + f(c.subtotal));
    if (c.discount) o.push('Discount' + (M.disc.type === 'pct' && M.disc.val ? ' (' + trimNum(M.disc.val) + '%)' : '') + ': -' + f(c.discount));
    c.taxGroups.forEach((g) => o.push('Tax (' + trimNum(g.rate) + '%): ' + f(g.amt)));
    if (M.taxPct > 0) o.push((M.taxName || 'Tax') + ' (' + trimNum(M.taxPct) + '%): ' + f(c.overallTax));
    if (c.shipping) o.push('Shipping: ' + f(c.shipping));
    o.push('*Total: ' + f(c.total) + '*');
    if (isR) {
      if (M.method) o.push('Paid by: ' + M.method);
      o.push('Amount received: ' + f(c.received));
      if (c.change > 0) o.push('Change: ' + f(c.change));
      if (c.owing > 0) o.push('*Balance owing: ' + f(c.owing) + '*');
      if (M.thanks) { o.push(''); o.push(M.thanks); }
    } else {
      if (c.paid) o.push('Paid so far: ' + f(c.paid));
      o.push('*Balance due: ' + f(c.balance) + '*');
      const pay = [];
      if (M.pay.bank) pay.push('Bank: ' + M.pay.bank);
      if (M.pay.name) pay.push('Account name: ' + M.pay.name);
      if (M.pay.no) pay.push('Account number: ' + M.pay.no);
      if (M.pay.link) pay.push(M.pay.link);
      if (pay.length) { o.push(''); o.push('*Payment details*'); pay.forEach((p) => o.push(p)); }
      if (M.notes) { o.push(''); o.push(M.notes); }
    }
    return o.join('\n');
  }
  $('dg-wa').addEventListener('click', async () => {
    const M = check(); if (!M) return;
    const text = waText(M), box = $('dg-wa-box');
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      try { box.hidden = false; box.value = text; box.select(); ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    }
    if (ok) { say('Copied. Paste it into a WhatsApp chat.'); box.hidden = true; rememberNumber(); }
    else { box.hidden = false; box.value = text; box.select(); say('Your browser blocked copying. Select the text below and copy it.', true); }
  });

  $('dg-reset').addEventListener('click', () => {
    const b = $('dg-reset');
    if (!b.dataset.armed) {
      b.dataset.armed = '1'; b.textContent = 'Click again to clear';
      resetTimer = setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reset'; }, 4000);
      return;
    }
    clearTimeout(resetTimer); delete b.dataset.armed; b.textContent = 'Reset';
    resetForm();
  });

  function resetForm() {
    const keep = $('dg-remember').checked ? lsGet() : null;
    root.querySelectorAll('input[type=text],input[type=email],input[type=tel],input[type=number],textarea').forEach((e) => { if (!e.closest('.dg-item')) e.value = ''; });
    itemsEl.innerHTML = ''; itemCount = 0; addItem();
    st.logo = null; st.sig = null; st.drawn = false; $('dg-logo').value = '';
    if (!isR) { const cv = $('dg-sig-canvas'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); $('dg-sig-mode').value = 'none'; }
    defaults();
    if (keep) { applySaved(keep); }
    else { $('dg-remember').checked = false; }
    $('dg-errors').hidden = true; $('dg-wa-box').hidden = true;
    document.querySelectorAll('[aria-invalid=true]').forEach((e) => e.removeAttribute('aria-invalid'));
    suggestNumber(keep);
    sigUi(); updateLogoUi(); applyTerms();
    say(keep ? 'Cleared. Your saved business details were kept. Untick Remember my business details to delete them.' : 'Cleared.');
    schedule();
  }

  function defaults() {
    const now = new Date();
    $('dg-issue').value = ymd(now);
    if (isR) { $('dg-time').value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'); $('dg-method').value = 'Cash'; $('dg-method-other-box').hidden = true; $('dg-thanks').value = 'Thank you for your purchase.'; $('dg-paper').value = 'thermal'; }
    else { $('dg-terms').value = '14'; $('dg-paper').value = 'a4'; }
    $('dg-cur').value = guessCurrency(); if ($('dg-cur').value !== guessCurrency()) $('dg-cur').value = 'USD';
    $('dg-tpl').value = 'clean'; $('dg-accent').value = '#2563eb'; $('dg-disc-type').value = 'pct'; $('dg-taxname').value = 'VAT';
    $('dg-curcode').checked = false;
    const q = itemsEl.querySelector('[data-f=qty]'); if (q && !q.value) q.value = '1';
  }
  function suggestNumber(saved) {
    const prefix = isR ? 'RCT-' : 'INV-';
    const last = saved && saved.last && saved.last[kind];
    $('dg-no').value = last ? nextNo(last) : prefix + '0001';
  }

  /* start up */
  addItem();
  defaults();
  const saved = lsGet();
  if (saved && saved.f) { $('dg-remember').checked = true; applySaved(saved); $('dg-remember-note').textContent = 'Your saved details were loaded from this browser.'; }
  suggestNumber(saved);
  sigUi(); updateLogoUi(); applyTerms();
  loadFonts().then(render, render);
  window.DocGen.live = { readModel: readModel, validate: validate, layout: layout, makePdf: makePdf, waText: waText, state: st, getLayout: () => L, render: render, addItem: addItem };
}

window.DocGen = { init: init, calc: calc, makeFmt: makeFmt, wrap: wrap, tw: tw, clean: clean, nextNo: nextNo, loadFonts: loadFonts, buildPdf: buildPdf, layout: layout, svgOf: svgOf, addDays: addDays, rnd: rnd };
})();
