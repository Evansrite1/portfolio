/* docgen.js : shared engine for the free invoice generator and receipt generator.
   Each design is an HTML and CSS template. The live preview shows the template with your data.
   For the PDF and PNG, the finished document is measured in the browser and every box, line,
   word and picture is drawn again with pdf-lib (real, selectable text) or on a canvas.
   Everything runs in the browser. Nothing is uploaded. */
(function () {
'use strict';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
const FONT_FILES = { 400: '/tools/vendor/fonts/NotoSans-400Regular.subset.ttf', 700: '/tools/vendor/fonts/NotoSans-700Bold.subset.ttf' };
// code point ranges that exist in the vendored font subset
const OK_RANGES = [[0x20, 0x7e], [0xa0, 0x24f], [0x370, 0x3ff], [0x400, 0x4ff], [0x1e00, 0x1eff], [0x2000, 0x206f], [0x20a0, 0x20cf],
  [0x2100, 0x214f], [0x2190, 0x2193], [0x2212, 0x2212], [0x2215, 0x2215], [0x221e, 0x221e], [0x2248, 0x2248], [0x2260, 0x2260],
  [0x2264, 0x2265], [0x25cf, 0x25cf]];
const okCp = (cp) => OK_RANGES.some((r) => cp >= r[0] && cp <= r[1]);

/* ------------------------------------------------------------------ money */
// code, symbol, decimals, name
const CURRENCIES = [
  ['NGN', '\u20a6', 2, 'Nigerian naira'], ['USD', '$', 2, 'US dollar'], ['GBP', '\u00a3', 2, 'British pound'], ['EUR', '\u20ac', 2, 'Euro'],
  ['KES', 'KSh ', 2, 'Kenyan shilling'], ['GHS', 'GH\u20b5', 2, 'Ghanaian cedi'], ['ZAR', 'R ', 2, 'South African rand'],
  ['XOF', 'CFA ', 0, 'West African CFA franc'], ['XAF', 'FCFA ', 0, 'Central African CFA franc'], ['UGX', 'USh ', 0, 'Ugandan shilling'],
  ['TZS', 'TSh ', 0, 'Tanzanian shilling'], ['RWF', 'FRw ', 0, 'Rwandan franc'], ['EGP', 'E\u00a3', 2, 'Egyptian pound'],
  ['MAD', 'MAD ', 2, 'Moroccan dirham'], ['AED', 'AED ', 2, 'UAE dirham'], ['SAR', 'SAR ', 2, 'Saudi riyal'], ['QAR', 'QAR ', 2, 'Qatari riyal'],
  ['KWD', 'KD ', 3, 'Kuwaiti dinar'], ['INR', '\u20b9', 2, 'Indian rupee'], ['CAD', 'CA$', 2, 'Canadian dollar'], ['AUD', 'A$', 2, 'Australian dollar'],
  ['JPY', '\u00a5', 0, 'Japanese yen'], ['CNY', 'CN\u00a5', 2, 'Chinese yuan'], ['CHF', 'CHF ', 2, 'Swiss franc'], ['BRL', 'R$', 2, 'Brazilian real']];
const curOf = (code) => CURRENCIES.find((c) => c[0] === code) || CURRENCIES[0];
const nfCache = {};
function money(n, code) {
  const c = curOf(code), dec = c[2];
  const nf = nfCache[dec] || (nfCache[dec] = new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  return (n < 0 ? '-' : '') + c[1] + nf.format(Math.abs(n));
}
function calc(d) {
  const dec = curOf(d.currency)[2], f = Math.pow(10, dec);
  const rd = (x) => Math.round((x + (x >= 0 ? 1 : -1) * Number.EPSILON) * f) / f;
  const lines = d.items.map((it) => rd(num(it.qty) * num(it.price)));
  const sub = rd(lines.reduce((a, b) => a + b, 0));
  let disc = d.discType === 'fixed' ? rd(num(d.discount)) : rd(sub * num(d.discount) / 100);
  disc = Math.min(Math.max(disc, 0), Math.max(sub, 0));
  const taxable = rd(sub - disc), taxRate = Math.max(0, num(d.taxRate));
  const tax = rd(taxable * taxRate / 100), total = rd(taxable + tax);
  const paidEmpty = String(d.paid == null ? '' : d.paid).trim() === '';
  const paid = paidEmpty ? (d.kind === 'receipt' ? total : 0) : rd(Math.max(0, num(d.paid)));
  return { lines, sub, disc, taxable, tax, taxRate, total, paid, paidEmpty, balance: rd(Math.max(total - paid, 0)), change: rd(Math.max(paid - total, 0)) };
}

/* ------------------------------------------------------------------ dates and numbers */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function ymd(dt) { return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
function fdate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : (s || '');
}
function addDays(s, n) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return ''; return ymd(new Date(+m[1], +m[2] - 1, +m[3] + n)); }
function nextNo(s) {
  s = String(s || '');
  const m = /^(.*?)(\d+)(\D*)$/.exec(s);
  if (!m) return s ? s + '-2' : '';
  const n = String(+m[2] + 1);
  return m[1] + (n.length < m[2].length ? '0'.repeat(m[2].length - n.length) + n : n) + m[3];
}

/* ------------------------------------------------------------------ colours */
function hexRgb(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const v = parseInt(h, 16); return isNaN(v) ? [30, 58, 138] : [v >> 16 & 255, v >> 8 & 255, v & 255]; }
function rgbHex(a) { return '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
function mix(h, o, t) { const a = hexRgb(h), b = hexRgb(o); return rgbHex(a.map((v, i) => v + (b[i] - v) * t)); }
function accentVars(h) { return '--ac:' + h + ';--ac1:' + mix(h, '#ffffff', 0.9) + ';--ac2:' + mix(h, '#ffffff', 0.75) + ';--acd:' + mix(h, '#000000', 0.35) + ';'; }
function parseColor(s) {
  if (!s || s === 'transparent') return null;
  let m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/.exec(s);
  if (!m) { m = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)/.exec(s); if (m) { m = [m[0], m[1] * 255, m[2] * 255, m[3] * 255, m[4]]; } }
  if (!m) return null;
  let a = m[4] == null ? 1 : String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (!(a > 0)) return null;
  return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: a };
}

/* ------------------------------------------------------------------ path helpers */
function getP(o, k) { return k.split('.').reduce((a, p) => (a == null ? a : a[p]), o); }
function setP(o, k, v) { const ps = k.split('.'); let a = o; for (let i = 0; i < ps.length - 1; i++) { if (a[ps[i]] == null) a[ps[i]] = {}; a = a[ps[i]]; } a[ps[ps.length - 1]] = v; }

/* ------------------------------------------------------------------ template helpers */
// mode: 'edit' (preview, editable, placeholders), 'thumb' (gallery), 'export' (PDF, PNG, print)
function helpers(d, mode, kind) {
  const T = calc(d), ed = mode === 'edit';
  const H = { d, T, mode, kind, esc, money: (n) => money(n, d.currency), fdate };
  const nl = (s) => esc(s).replace(/\n/g, '<br>');
  // editable text. o: {ml: multi line, n: number}
  H.t = function (key, ph, o) {
    o = o || {};
    const v = getP(d, key);
    const s = v == null ? '' : String(v);
    if (!ed) return nl(s);
    const a = ' contenteditable="true" spellcheck="false" data-k="' + key + '"' + (o.ml ? ' data-ml="1"' : '') + (o.n ? ' data-n="1"' : '');
    if (!s.trim() && ph) return '<span class="ek is-ph"' + a + '>' + esc(ph) + '</span>';
    return '<span class="ek"' + a + '>' + nl(s) + '</span>';
  };
  H.has = (key) => ed || String(getP(d, key) == null ? '' : getP(d, key)).trim() !== '';
  // a line only when there is something to show (always in edit mode, with a placeholder)
  H.line = (key, ph, cls, o) => H.has(key) ? '<div class="' + (cls || '') + '">' + H.t(key, ph, o) + '</div>' : '';
  H.title = (def) => { if (!String(d.title || '').trim() && !ed) return esc(def); return H.t('title', def); };
  H.logo = (cls) => d.biz.logo ? '<img class="logo ' + (cls || '') + '" src="' + d.biz.logo + '" alt="">' : '';
  H.initials = () => { const w = String(d.biz.name || 'Your Business').trim().split(/\s+/).filter(Boolean); return esc(((w[0] || '')[0] || '') + ((w[1] || '')[0] || '')).toUpperCase(); };
  H.mark = (cls) => d.biz.logo ? H.logo(cls) : '<div class="mono ' + (cls || '') + '">' + H.initials() + '</div>';
  H.bizName = (ph) => H.t('biz.name', ph || 'Your business name');
  H.biz = function (o) {
    o = o || {};
    return '<div class="biz">' + (o.noName ? '' : '<div class="bn">' + H.bizName() + '</div>') +
      H.line('biz.addr', 'Address', 'ba', { ml: 1 }) + H.line('biz.phone', 'Phone', 'bp') + H.line('biz.email', 'Email', 'be') + '</div>';
  };
  H.cust = function (label) {
    if (!ed && !String(d.cust.name || '').trim() && !String(d.cust.contact || '').trim()) return '';
    return '<div class="cust">' + (label ? '<div class="lbl">' + esc(label) + '</div>' : '') +
      H.line('cust.name', kind === 'invoice' ? 'Customer name' : 'Customer name (optional)', 'cn') + H.line('cust.contact', 'Phone or email', 'cc') + '</div>';
  };
  H.noLabel = kind === 'invoice' ? 'Invoice no.' : 'Receipt no.';
  H.metaRows = function () {
    const r = [[H.noLabel, H.t('no', kind === 'invoice' ? 'INV-0001' : 'RCT-0001')], ['Date', esc(fdate(d.date))]];
    if (kind === 'invoice') { if (d.due) r.push(['Due date', esc(fdate(d.due))]); }
    else { if (d.time) r.push(['Time', esc(d.time)]); if (d.method) r.push(['Paid by', esc(d.method)]); }
    return r;
  };
  H.meta = (cls) => '<div class="meta ' + (cls || '') + '">' + H.metaRows().map((r) => '<div class="mr"><span class="ml">' + r[0] + '</span><span class="mv">' + r[1] + '</span></div>').join('') + '</div>';
  // rows that are shown: in export mode, empty rows are left out
  H.rows = function () {
    const out = [];
    d.items.forEach((it, i) => {
      const empty = !String(it.desc || '').trim() && !T.lines[i];
      if (empty && !ed) return;
      out.push({ i, it, amt: T.lines[i] });
    });
    return out;
  };
  H.desc = (r) => H.t('items.' + r.i + '.desc', 'Item description');
  // numbers show formatted, and switch to the plain number while they are being edited
  const numEd = (key, shown) => '<span class="ek" contenteditable="true" spellcheck="false" inputmode="decimal" data-k="' + key + '" data-n="1" data-raw="' + esc(getP(d, key) == null ? '' : getP(d, key)) + '">' + esc(shown) + '</span>';
  H.qty = (r) => ed ? numEd('items.' + r.i + '.qty', fmtQty(r.it.qty)) : esc(fmtQty(r.it.qty));
  H.price = (r) => ed ? numEd('items.' + r.i + '.price', H.money(num(r.it.price))) : esc(H.money(num(r.it.price)));
  H.amt = (r) => esc(H.money(r.amt));
  // a normal items table. o: {num: row numbers, heads: [desc, qty, price, amount]}
  H.items = function (o) {
    o = o || {};
    const hd = o.heads || ['Description', 'Qty', kind === 'invoice' ? 'Rate' : 'Price', 'Amount'];
    let s = '<table class="it"><thead><tr>' + (o.num ? '<th class="c-n">#</th>' : '') + '<th class="c-d">' + hd[0] + '</th><th class="c-q r">' + hd[1] + '</th><th class="c-p r">' + hd[2] + '</th><th class="c-a r">' + hd[3] + '</th></tr></thead><tbody>';
    H.rows().forEach((r, k) => {
      s += '<tr class="pb">' + (o.num ? '<td class="c-n">' + (k + 1) + '</td>' : '') + '<td class="c-d">' + H.desc(r) + '</td><td class="c-q r">' + H.qty(r) + '</td><td class="c-p r">' + H.price(r) + '</td><td class="c-a r">' + H.amt(r) + '</td></tr>';
    });
    return s + '</tbody></table>';
  };
  // receipt style list: description, then "2 x 1,500.00" and the amount
  H.list = function () {
    return '<div class="il">' + H.rows().map((r) => '<div class="ir pb"><div class="id">' + H.desc(r) + '</div><div class="iq"><span>' + H.qty(r) + ' x ' + H.price(r) + '</span><span class="ia">' + H.amt(r) + '</span></div></div>').join('') + '</div>';
  };
  H.taxLabel = () => esc(String(d.taxName || 'Tax').trim() || 'Tax') + ' (' + fmtQty(T.taxRate) + '%)';
  H.totalRows = function () {
    const r = [['Subtotal', H.money(T.sub)]];
    if (T.disc > 0) r.push(['Discount' + (d.discType === 'fixed' ? '' : ' (' + fmtQty(num(d.discount)) + '%)'), '-' + H.money(T.disc)]);
    if (T.taxRate > 0) r.push([H.taxLabel(), H.money(T.tax)]);
    if (kind === 'invoice') {
      if (T.paid > 0) { r.push(['Total', H.money(T.total)]); r.push(['Paid', '-' + H.money(T.paid)]); r.push([d.dueLabel || 'Balance due', H.money(T.balance), 'g']); }
      else r.push([d.dueLabel || 'Total due', H.money(T.total), 'g']);
    } else {
      r.push(['Total', H.money(T.total), 'g']);
      r.push(['Paid' + (d.method ? ' (' + esc(d.method) + ')' : ''), H.money(T.paid)]);
      if (T.change > 0) r.push(['Change', H.money(T.change)]);
      if (T.balance > 0) r.push(['Balance owing', H.money(T.balance), 'w']);
    }
    return r;
  };
  H.totals = (cls) => '<div class="tot pb ' + (cls || '') + '">' + H.totalRows().map((r) => '<div class="tr' + (r[2] ? ' ' + r[2] : '') + '"><span>' + r[0] + '</span><span>' + esc(r[1]) + '</span></div>').join('') + '</div>';
  H.dueAmount = () => H.money(kind === 'invoice' ? T.balance : T.total);
  H.notes = function (label) {
    if (!H.has('notes')) return '';
    return '<div class="notes pb"><div class="lbl">' + esc(label || (kind === 'invoice' ? 'Payment details' : 'Note')) + '</div><div class="nt">' + H.t('notes', kind === 'invoice' ? 'Bank name, account name and account number, or any note' : 'Any note, for example your return policy', { ml: 1 }) + '</div></div>';
  };
  H.thanks = (cls) => H.has('thanks') ? '<div class="thx pb ' + (cls || '') + '">' + H.t('thanks', kind === 'invoice' ? 'Thank you for your business.' : 'Thank you for your purchase.') + '</div>' : '';
  H.barcode = function (w, h, color) {
    // a decorative barcode made from the document number (not a scannable code)
    const s = String(d.no || 'RCT-0001'); let x = 0, seed = 7, bars = '';
    for (let i = 0; i < s.length * 6 && x < w; i++) { seed = (seed * 31 + s.charCodeAt(i % s.length) + i) % 997; const bw = 1 + seed % 3; if (i % 2 === 0) bars += '<rect x="' + x + '" y="0" width="' + bw + '" height="' + h + '"/>'; x += bw + 1; }
    return '<svg class="bar" xmlns="' + SVGNS + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" fill="' + (color || '#111') + '">' + bars + '</svg>';
  };
  return H;
}
const txtOf = (el) => (typeof el.innerText === 'string' ? el.innerText : el.textContent);
function fmtQty(q) { const n = num(q); return String(Math.round(n * 1000) / 1000); }

/* ------------------------------------------------------------------ measuring the finished document */
const mctx = (function () { try { return document.createElement('canvas').getContext('2d'); } catch (e) { return null; } })();
const fmCache = {};
function fontMetrics(font, size) {
  if (fmCache[font] === undefined) {
    let a = 0.8, dd = 0.2;
    try {
      mctx.font = font.replace('{s}', '100');
      const m = mctx.measureText('Hg');
      if (m.fontBoundingBoxAscent) { a = m.fontBoundingBoxAscent / 100; dd = m.fontBoundingBoxDescent / 100; }
    } catch (e) { /* defaults */ }
    fmCache[font] = [a, dd];
  }
  return [fmCache[font][0] * size, fmCache[font][1] * size];
}
function radii(cs, w, h) {
  const one = (v) => { v = String(v || '0').split(' ')[0]; const n = parseFloat(v) || 0; return Math.min(v.endsWith('%') ? n / 100 * Math.min(w, h) : n, w / 2, h / 2); };
  const r = [one(cs.borderTopLeftRadius), one(cs.borderTopRightRadius), one(cs.borderBottomRightRadius), one(cs.borderBottomLeftRadius)];
  return r.some((v) => v > 0.2) ? r : null;
}
function collect(root) {
  const R = root.getBoundingClientRect(), ox = R.left, oy = R.top, ops = [];
  function side(x, y, w, h, color, style, horiz) {
    if (style === 'dashed' || style === 'dotted') {
      const t = horiz ? h : w, len = horiz ? w : h;
      const dash = style === 'dotted' ? t : Math.max(3 * t, 4), gap = style === 'dotted' ? t : Math.max(2 * t, 3);
      for (let p = 0; p < len; p += dash + gap) {
        const l = Math.min(dash, len - p);
        ops.push(horiz ? { t: 'rect', x: x + p, y, w: l, h, fill: color } : { t: 'rect', x, y: y + p, w, h: l, fill: color });
      }
    } else if (style === 'double' && (horiz ? h : w) >= 3) {
      const t = (horiz ? h : w) / 3;
      if (horiz) { ops.push({ t: 'rect', x, y, w, h: t, fill: color }); ops.push({ t: 'rect', x, y: y + 2 * t, w, h: t, fill: color }); }
      else { ops.push({ t: 'rect', x, y, w: t, h, fill: color }); ops.push({ t: 'rect', x: x + 2 * t, y, w: t, h, fill: color }); }
    } else ops.push({ t: 'rect', x, y, w, h, fill: color });
  }
  function text(node, cs) {
    const s = node.data;
    if (!s || !s.trim()) return;
    const color = parseColor(cs.color);
    if (!color) return;
    const size = parseFloat(cs.fontSize) || 12, weight = parseInt(cs.fontWeight, 10) || 400;
    const fam = cs.fontFamily || 'sans-serif', italic = cs.fontStyle === 'italic', tt = cs.textTransform;
    const ls = parseFloat(cs.letterSpacing) || 0;
    const font = (italic ? 'italic ' : '') + weight + ' {s}px ' + fam;
    const tx = (w) => tt === 'uppercase' ? w.toUpperCase() : tt === 'lowercase' ? w.toLowerCase() : w;
    const re = /\S+/g; let m;
    const range = document.createRange();
    const push = (str, rc) => {
      if (!rc || rc.width <= 0) return;
      const fm = fontMetrics(font, size);
      const base = rc.top - oy + (rc.height - fm[0] - fm[1]) / 2 + fm[0];
      ops.push({ t: 'text', x: rc.left - ox, y: base, top: rc.top - oy, h: rc.height, w: rc.width, str, size, weight, fam, italic, color });
    };
    while ((m = re.exec(s))) {
      range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      const rects = range.getClientRects();
      if (rects.length === 1 && !ls) { push(tx(m[0]), rects[0]); continue; }
      // letter spacing or a word broken over two lines: one character at a time
      let i = 0;
      for (const ch of m[0]) {
        range.setStart(node, m.index + i); range.setEnd(node, m.index + i + ch.length);
        push(tx(ch), range.getClientRects()[0]);
        i += ch.length;
      }
    }
  }
  (function walk(el) {
    if (el.hasAttribute && el.hasAttribute('data-noexport')) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const vis = cs.visibility !== 'hidden';
    const r = el.getBoundingClientRect(), x = r.left - ox, y = r.top - oy, w = r.width, h = r.height;
    if (el.namespaceURI === SVGNS) { if (vis && w > 0 && h > 0) ops.push({ t: 'svg', x, y, w, h, el, color: cs.color }); return; }
    if (vis && w > 0 && h > 0) {
      const rad = radii(cs, w, h), bg = parseColor(cs.backgroundColor);
      if (bg) ops.push({ t: 'rect', x, y, w, h, fill: bg, rad });
      const sd = ['Top', 'Right', 'Bottom', 'Left'].map((k) => ({ w: parseFloat(cs['border' + k + 'Width']) || 0, s: cs['border' + k + 'Style'], c: parseColor(cs['border' + k + 'Color']) }))
        .map((b) => (b.w > 0 && b.c && b.s !== 'none' && b.s !== 'hidden') ? b : null);
      const same = sd.every((b) => b && b.w === sd[0].w && b.s === 'solid' && sd[0].s === 'solid' && b.c.r === sd[0].c.r && b.c.g === sd[0].c.g && b.c.b === sd[0].c.b);
      if (rad && same) ops.push({ t: 'rect', x, y, w, h, stroke: sd[0].c, sw: sd[0].w, rad });
      else {
        if (sd[0]) side(x, y, w, sd[0].w, sd[0].c, sd[0].s, true);
        if (sd[2]) side(x, y + h - sd[2].w, w, sd[2].w, sd[2].c, sd[2].s, true);
        if (sd[3]) side(x, y, sd[3].w, h, sd[3].c, sd[3].s, false);
        if (sd[1]) side(x + w - sd[1].w, y, sd[1].w, h, sd[1].c, sd[1].s, false);
      }
    }
    if (el.tagName === 'IMG') { if (vis && w > 0 && h > 0 && el.src) ops.push({ t: 'img', x, y, w, h, src: el.src }); return; }
    for (const n of el.childNodes) {
      if (n.nodeType === 1) walk(n);
      else if (n.nodeType === 3 && vis) text(n, cs);
    }
  })(root);
  return ops;
}

// move rows and blocks that cross a page edge onto the next page (A4 invoices)
function paginate(doc, pageH, scale) {
  const M = 48;
  doc.querySelectorAll('.dg-sp').forEach((n) => n.remove());
  doc.querySelectorAll('[data-pushed]').forEach((n) => { n.style.marginTop = ''; n.removeAttribute('data-pushed'); });
  doc.style.minHeight = '';
  const top0 = () => doc.getBoundingClientRect().top;
  doc.querySelectorAll('.pb').forEach((el) => {
    const r = el.getBoundingClientRect(), t0 = top0();
    const t = (r.top - t0) / scale, b = (r.bottom - t0) / scale;
    if (b - t <= 0 || b - t > pageH - 2 * M) return;
    const p = Math.floor(t / pageH);
    if (b <= (p + 1) * pageH - M) return;
    const push = (p + 1) * pageH + M - t;
    if (el.tagName === 'TR') {
      const sp = document.createElement('tr'); sp.className = 'dg-sp';
      sp.innerHTML = '<td colspan="9" style="height:' + push + 'px;padding:0;border:0;background:transparent"></td>';
      el.parentNode.insertBefore(sp, el);
    } else {
      el.setAttribute('data-pushed', '1');
      el.style.marginTop = ((parseFloat(getComputedStyle(el).marginTop) || 0) + push) + 'px';
    }
  });
  const h = doc.offsetHeight, pages = Math.max(1, Math.ceil(h / pageH - 0.002));
  doc.style.minHeight = (pages * pageH) + 'px';
  return pages;
}

/* ------------------------------------------------------------------ pictures */
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image')); im.src = src; });
}
function svgSrc(op) {
  const c = op.el.cloneNode(true);
  c.setAttribute('xmlns', SVGNS); c.setAttribute('width', op.w); c.setAttribute('height', op.h);
  c.removeAttribute('class'); c.removeAttribute('style');
  let s = new XMLSerializer().serializeToString(c).replace(/currentColor/g, op.color || '#000');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}
async function opImage(op) {
  if (!op.im) op.im = await loadImg(op.t === 'svg' ? svgSrc(op) : op.src);
  return op.im;
}
function canvasPng(im, w, h) {
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
  cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
  return new Promise((res) => cv.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), 'image/png'));
}
function rrPath(w, h, r) {
  const [a, b, c, d] = r;
  return 'M' + a + ',0 H' + (w - b) + ' A' + b + ',' + b + ' 0 0 1 ' + w + ',' + b + ' V' + (h - c) + ' A' + c + ',' + c + ' 0 0 1 ' + (w - c) + ',' + h +
    ' H' + d + ' A' + d + ',' + d + ' 0 0 1 0,' + (h - d) + ' V' + a + ' A' + a + ',' + a + ' 0 0 1 ' + a + ',0 Z';
}

/* ------------------------------------------------------------------ PDF with pdf-lib */
const loaded = {};
function loadScript(src, name) {
  if (window[name]) return Promise.resolve();
  if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
  return loaded[src];
}
async function bytesOf(url) { const r = await fetch(url); if (!r.ok) throw new Error('Could not load ' + url); return new Uint8Array(await r.arrayBuffer()); }
function cleanText(s) { let o = ''; for (const ch of s) o += okCp(ch.codePointAt(0)) ? ch : '?'; return o; }

async function buildPdf(ops, W, H, pageH, title) {
  await Promise.all([loadScript('/tools/vendor/pdf-lib/pdf-lib.min.js', 'PDFLib'), loadScript('/tools/vendor/fontkit/fontkit.umd.min.js', 'fontkit')]);
  const L = window.PDFLib, pdf = await L.PDFDocument.create();
  pdf.registerFontkit(window.fontkit);
  const fb = await Promise.all([bytesOf(FONT_FILES[400]), bytesOf(FONT_FILES[700])]);
  const noto = [await pdf.embedFont(fb[0], { subset: true }), await pdf.embedFont(fb[1], { subset: true })];
  const std = {};
  const stdFont = async (n) => std[n] || (std[n] = await pdf.embedFont(L.StandardFonts[n]));
  const k = 0.75, ph = pageH || H, pages = Math.max(1, Math.round(H / ph));
  const col = (c) => L.rgb(c.r, c.g, c.b);
  const imgs = new Map();
  async function embed(op) {
    const key = op.t === 'svg' ? op : op.src;
    if (imgs.has(key)) return imgs.get(key);
    const im = await opImage(op);
    const sc = op.t === 'svg' ? 4 : Math.min(3, Math.max(1, (im.naturalWidth || op.w) / op.w));
    const e = await pdf.embedPng(await canvasPng(im, op.w * sc, op.h * sc));
    imgs.set(key, e);
    return e;
  }
  async function fontFor(op) {
    const first = op.fam.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    const bold = op.weight >= 600;
    let f = null;
    if (/georgia|times|garamond|serif/.test(first) && first !== 'sans-serif') f = await stdFont(bold ? 'TimesRomanBold' : 'TimesRoman');
    else if (/courier|mono/.test(first)) f = await stdFont(bold ? 'CourierBold' : 'Courier');
    if (f) { try { f.encodeText(op.str); return f; } catch (e) { /* not in WinAnsi, use Noto */ } }
    return noto[bold ? 1 : 0];
  }
  for (let p = 0; p < pages; p++) {
    const page = pdf.addPage([W * k, ph * k]), off = p * ph;
    for (const op of ops) {
      const top = op.t === 'text' ? op.top : op.y, hh = op.h;
      if (top > off + ph || top + hh < off) continue;
      const y = op.y - off;
      if (op.t === 'rect') {
        if (op.rad) {
          const o = { x: op.x * k, y: (ph - y) * k, scale: k };
          if (op.fill) { o.color = col(op.fill); o.opacity = op.fill.a; }
          if (op.stroke) {
            const s = op.sw, rr = op.rad.map((v) => Math.max(0, v - s / 2));
            page.drawSvgPath(rrPath(op.w - s, op.h - s, rr), { x: (op.x + s / 2) * k, y: (ph - y - s / 2) * k, scale: k, borderColor: col(op.stroke), borderWidth: s, borderOpacity: op.stroke.a });
          } else page.drawSvgPath(rrPath(op.w, op.h, op.rad), o);
        } else page.drawRectangle({ x: op.x * k, y: (ph - y - op.h) * k, width: op.w * k, height: op.h * k, color: col(op.fill), opacity: op.fill.a });
      } else if (op.t === 'text') {
        const f = await fontFor(op);
        const str = f === noto[0] || f === noto[1] ? cleanText(op.str) : op.str;
        page.drawText(str, { x: op.x * k, y: (ph - y) * k, size: op.size * k, font: f, color: col(op.color), opacity: op.color.a });
      } else {
        try { const e = await embed(op); page.drawImage(e, { x: op.x * k, y: (ph - y - op.h) * k, width: op.w * k, height: op.h * k }); } catch (e) { /* skip a picture that will not load */ }
      }
    }
  }
  pdf.setTitle(title); pdf.setCreator('Large Technologies free tools'); pdf.setProducer('pdf-lib');
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

/* ------------------------------------------------------------------ PNG on a canvas */
async function buildPng(ops, W, H) {
  const s = Math.min(2, 16000 / H, 16000 / W);
  const cv = document.createElement('canvas'); cv.width = Math.round(W * s); cv.height = Math.round(H * s);
  const c = cv.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height); c.scale(s, s);
  for (const op of ops) { if (op.t === 'img' || op.t === 'svg') { try { await opImage(op); } catch (e) { op.bad = 1; } } }
  const css = (q) => 'rgba(' + Math.round(q.r * 255) + ',' + Math.round(q.g * 255) + ',' + Math.round(q.b * 255) + ',' + q.a + ')';
  const path = (op, x, y, w, h, r) => { c.beginPath(); if (r && c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
  for (const op of ops) {
    if (op.t === 'rect') {
      if (op.fill) { c.fillStyle = css(op.fill); path(op, op.x, op.y, op.w, op.h, op.rad); c.fill(); }
      if (op.stroke) { c.strokeStyle = css(op.stroke); c.lineWidth = op.sw; path(op, op.x + op.sw / 2, op.y + op.sw / 2, op.w - op.sw, op.h - op.sw, op.rad && op.rad.map((v) => Math.max(0, v - op.sw / 2))); c.stroke(); }
    } else if (op.t === 'text') {
      c.font = (op.italic ? 'italic ' : '') + op.weight + ' ' + op.size + 'px ' + op.fam;
      c.fillStyle = css(op.color); c.textBaseline = 'alphabetic'; c.fillText(op.str, op.x, op.y);
    } else if (!op.bad) c.drawImage(op.im, op.x, op.y, op.w, op.h);
  }
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
function fontsReady() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all([document.fonts.load('400 12px DGNoto'), document.fonts.load('700 12px DGNoto')]).catch(() => {});
}

/* ------------------------------------------------------------------ storage */
const BIZ_KEY = 'lt-docs-business-v2';
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const lsSet = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); return true; } catch (e) { return false; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };

/* ------------------------------------------------------------------ the tool */
function init(cfg) {
  const root = $('dg');
  if (!root) return;
  const kind = cfg.kind, TPLS = cfg.templates, DOCKEY = 'lt-docs-' + kind + '-v2';
  const prefix = kind === 'invoice' ? 'INV-0001' : 'RCT-0001';
  const now = new Date();
  const S = {
    kind, tpl: TPLS[0].id, accent: '', title: '',
    biz: { name: '', addr: '', phone: '', email: '', logo: '' }, cust: { name: '', contact: '' },
    no: prefix, date: ymd(now), due: kind === 'invoice' ? addDays(ymd(now), 14) : '', time: kind === 'receipt' ? String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') : '',
    method: kind === 'receipt' ? 'Cash' : '', currency: 'NGN', taxName: 'VAT', taxRate: '', discount: '', discType: 'pct', paid: '',
    notes: '', thanks: kind === 'invoice' ? 'Thank you for your business.' : 'Thank you for your purchase.',
    items: [{ desc: '', qty: '1', price: '' }],
  };
  const BIZ_FIELDS = ['biz.name', 'biz.addr', 'biz.phone', 'biz.email', 'biz.logo', 'currency', 'taxName', 'taxRate'];
  const DOC_FIELDS = kind === 'invoice' ? ['tpl', 'accent', 'notes', 'thanks'] : ['tpl', 'accent', 'notes', 'thanks', 'method'];

  /* saved details */
  let lastNo = '';
  (function restore() {
    let b = lsGet(BIZ_KEY);
    if (!b) {
      // details saved by the older version of this tool
      const old = lsGet('lt-docgen-v1');
      if (old && old.f) b = { 'biz.name': old.f['dg-biz-name'] || '', 'biz.addr': old.f['dg-biz-addr'] || '', 'biz.phone': old.f['dg-biz-phone'] || '', 'biz.email': old.f['dg-biz-email'] || '', 'biz.logo': (old.logo && old.logo.dataUrl) || '', currency: old.f['dg-cur'] || '' };
    }
    if (b) BIZ_FIELDS.forEach((k) => { if (b[k] != null && b[k] !== '') setP(S, k, b[k]); });
    const o = lsGet(DOCKEY);
    if (o) { DOC_FIELDS.forEach((k) => { if (o[k] != null) setP(S, k, o[k]); }); lastNo = o.lastNo || ''; }
    if (!TPLS.some((t) => t.id === S.tpl)) S.tpl = TPLS[0].id;
    if (!CURRENCIES.some((c) => c[0] === S.currency)) S.currency = 'NGN';
    if (lastNo) S.no = nextNo(lastNo);
  })();
  let saveTimer = 0;
  function saveNow() {
    const b = {}; BIZ_FIELDS.forEach((k) => { b[k] = getP(S, k); });
    const o = { lastNo }; DOC_FIELDS.forEach((k) => { o[k] = getP(S, k); });
    let ok = lsSet(BIZ_KEY, b);
    if (!ok && b['biz.logo']) { b['biz.logo'] = ''; ok = lsSet(BIZ_KEY, b); note('Your logo is too big to remember, so only the text was saved.'); }
    lsSet(DOCKEY, o);
  }
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); };
  const note = (s) => { const n = $('dg-status'); if (n) n.textContent = s; };

  const tplOf = (id) => TPLS.find((t) => t.id === id) || TPLS[0];
  const WIDTH = { a4: 794, a5: 559, thermal: 302 };
  function docHtml(tp, d, mode) {
    const H = helpers(d, mode, kind);
    return '<div class="dt t-' + tp.id + ' p-' + tp.paper + (mode === 'edit' ? ' is-edit' : '') + '" style="' + accentVars((mode !== 'thumb' && d.accent) || tp.accent) + '">' + tp.render(d, H) + '</div>';
  }

  /* gallery */
  const gal = $('dg-gal');
  function buildGallery() {
    const sample = Object.assign({}, S, cfg.sample, { kind, accent: '' });
    sample.biz = cfg.sample.biz; sample.cust = cfg.sample.cust; sample.items = cfg.sample.items;
    gal.innerHTML = TPLS.map((t) => '<div class="dg-tc" role="button" tabindex="0" data-id="' + t.id + '" data-group="' + (t.group || 'everyday') + '" aria-pressed="' + (t.id === S.tpl) + '" aria-label="Use the ' + esc(t.name) + ' design">' +
      '<div class="dg-tb p-' + t.paper + '"><div class="dg-ts" style="width:' + WIDTH[t.paper] + 'px">' + docHtml(t, sample, 'thumb') + '</div></div>' +
      '<div class="dg-tn"><b>' + esc(t.name) + '</b>' + (t.group === 'festive' ? '<i>Festive</i>' : '') + '</div></div>').join('');
    const cnt = $('dg-count'); if (cnt) cnt.textContent = TPLS.length + ' designs';
    fitThumbs();
  }
  function fitThumbs() {
    gal.querySelectorAll('.dg-tb').forEach((b) => {
      const s = b.firstElementChild, t = tplOf(b.parentNode.dataset.id), w = b.clientWidth, dw = WIDTH[t.paper];
      if (!w) return;
      const sc = t.paper === 'thermal' ? Math.min(w * 0.78 / dw, 1) : w / dw;
      s.style.transform = 'scale(' + sc + ')';
      s.style.left = t.paper === 'thermal' ? ((w - dw * sc) / 2) + 'px' : '0';
    });
  }
  function pick(id, scroll) {
    S.tpl = id;
    gal.querySelectorAll('.dg-tc').forEach((c) => c.setAttribute('aria-pressed', c.dataset.id === id));
    $('dg-tpl').value = id;
    syncAccentInput();
    render(); save();
    if (scroll) { const ed = $('dg-editor'); if (ed && ed.scrollIntoView) ed.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  gal.addEventListener('click', (e) => { const c = e.target.closest('.dg-tc'); if (c) pick(c.dataset.id, true); });
  gal.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('dg-tc')) { e.preventDefault(); pick(e.target.dataset.id, true); } });
  const chips = $('dg-filter');
  if (chips) chips.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-g]'); if (!b) return;
    chips.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    gal.querySelectorAll('.dg-tc').forEach((c) => { c.hidden = b.dataset.g !== 'all' && c.dataset.group !== b.dataset.g; });
    fitThumbs();
  });

  /* design picker beside the preview */
  const tsel = $('dg-tpl');
  tsel.innerHTML = TPLS.map((t) => '<option value="' + t.id + '">' + esc(t.name) + '</option>').join('');
  tsel.addEventListener('change', () => pick(tsel.value));
  const step = (k) => { const i = TPLS.findIndex((t) => t.id === S.tpl); pick(TPLS[(i + k + TPLS.length) % TPLS.length].id); };
  $('dg-prev').addEventListener('click', () => step(-1));
  $('dg-next').addEventListener('click', () => step(1));
  const gotoGal = $('dg-gallery-link'); if (gotoGal) gotoGal.addEventListener('click', () => { const g = $('dg-gallery'); if (g && g.scrollIntoView) g.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  /* form */
  const form = $('dg-form');
  const cs = $('dg-cur');
  cs.innerHTML = CURRENCIES.map((c) => '<option value="' + c[0] + '">' + c[0] + ' (' + esc(c[1].trim()) + ') ' + esc(c[3]) + '</option>').join('');
  function fillForm() {
    form.querySelectorAll('[data-f]').forEach((el) => {
      const v = getP(S, el.dataset.f);
      if (el.type === 'file') return;
      el.value = v == null ? '' : v;
    });
    buildItems(); syncAccentInput(); logoUi();
  }
  function buildItems() {
    const box = $('dg-items');
    box.innerHTML = S.items.map((it, i) => '<div class="dg-item">' +
      '<input type="text" data-f="items.' + i + '.desc" aria-label="Item ' + (i + 1) + ' description" placeholder="Item or service" maxlength="160" value="' + esc(it.desc) + '">' +
      '<input type="text" inputmode="decimal" data-f="items.' + i + '.qty" aria-label="Item ' + (i + 1) + ' quantity" placeholder="1" value="' + esc(it.qty) + '">' +
      '<input type="text" inputmode="decimal" data-f="items.' + i + '.price" aria-label="Item ' + (i + 1) + ' price" placeholder="0.00" value="' + esc(it.price) + '">' +
      '<button type="button" class="dg-rm" data-rm="' + i + '" aria-label="Remove item ' + (i + 1) + '" title="Remove">&times;</button></div>').join('');
  }
  form.addEventListener('input', (e) => {
    const el = e.target, k = el.dataset && el.dataset.f;
    if (!k) return;
    setP(S, k, el.value);
    if (k === 'date' && kind === 'invoice' && $('dg-due').dataset.auto !== '0') { S.due = addDays(S.date, 14); $('dg-due').value = S.due; }
    if (k === 'due') el.dataset.auto = '0';
    schedule(); save();
  });
  form.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.f) { setP(S, e.target.dataset.f, e.target.value); render(); save(); } });
  $('dg-items').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    S.items.splice(+b.dataset.rm, 1);
    if (!S.items.length) S.items.push({ desc: '', qty: '1', price: '' });
    buildItems(); render();
  });
  $('dg-add').addEventListener('click', () => {
    S.items.push({ desc: '', qty: '1', price: '' });
    buildItems(); render();
    const ins = $('dg-items').querySelectorAll('input[data-f$=".desc"]'); ins[ins.length - 1].focus();
  });

  /* colour */
  const acc = $('dg-accent');
  function syncAccentInput() { acc.value = S.accent || tplOf(S.tpl).accent; }
  acc.addEventListener('input', () => { S.accent = acc.value; schedule(); save(); });
  $('dg-accent-reset').addEventListener('click', () => { S.accent = ''; syncAccentInput(); render(); save(); });

  /* logo */
  const logoIn = $('dg-logo');
  function logoUi() { $('dg-logo-clear').hidden = !S.biz.logo; $('dg-logo-note').textContent = S.biz.logo ? 'Logo added. It stays in your browser.' : 'Optional. PNG, JPG, WebP or SVG.'; }
  logoIn.addEventListener('change', () => {
    const f = logoIn.files && logoIn.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => loadImg(rd.result).then((im) => {
      const max = 600, w0 = im.naturalWidth || im.width || max, h0 = im.naturalHeight || im.height || max / 2, s = Math.min(1, max / Math.max(w0, h0));
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w0 * s)); cv.height = Math.max(1, Math.round(h0 * s));
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      S.biz.logo = cv.toDataURL('image/png'); logoUi(); render(); save();
    }).catch(() => { $('dg-logo-note').textContent = 'That file could not be read as a picture. Try a PNG or JPG.'; });
    rd.readAsDataURL(f);
  });
  $('dg-logo-clear').addEventListener('click', () => { S.biz.logo = ''; logoIn.value = ''; logoUi(); render(); save(); });

  /* forget and new */
  $('dg-forget').addEventListener('click', () => {
    lsDel(BIZ_KEY); lsDel(DOCKEY); lastNo = '';
    S.biz = { name: '', addr: '', phone: '', email: '', logo: '' }; S.currency = 'NGN'; S.taxRate = ''; S.taxName = 'VAT'; S.notes = ''; S.no = prefix;
    fillForm(); render();
    note('Your saved details were deleted from this browser.');
    clearTimeout(saveTimer);
  });
  $('dg-new').addEventListener('click', () => {
    lastNo = S.no; S.no = nextNo(S.no);
    S.cust = { name: '', contact: '' }; S.items = [{ desc: '', qty: '1', price: '' }]; S.paid = ''; S.discount = ''; S.date = ymd(new Date());
    if (kind === 'invoice') { S.due = addDays(S.date, 14); $('dg-due').dataset.auto = '1'; }
    fillForm(); render(); save();
    note('Started a new ' + kind + ', number ' + S.no + '.');
  });

  /* preview */
  const stage = $('dg-stage'), sheet = $('dg-sheet');
  let editing = false, timer = 0;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 60); };
  function render() {
    if (editing) return;
    const tp = tplOf(S.tpl);
    sheet.style.width = WIDTH[tp.paper] + 'px';
    sheet.innerHTML = docHtml(tp, S, 'edit');
    fitPreview();
    const nm = $('dg-tname'); if (nm) nm.textContent = tp.name;
  }
  function fitPreview() {
    const tp = tplOf(S.tpl), dw = WIDTH[tp.paper], w = stage.clientWidth, doc = sheet.firstElementChild;
    if (!doc) return;
    const sc = w ? Math.min(1, w / dw) : 1;
    sheet.style.transform = 'scale(' + sc + ')';
    sheet.style.left = w > dw * sc ? ((w - dw * sc) / 2) + 'px' : '0';
    sheet.querySelectorAll('.dg-pbreak').forEach((n) => n.remove());
    if (tp.paper === 'a4' && w) {
      const pages = paginate(doc, 1123, sc);
      for (let p = 1; p < pages; p++) { const l = document.createElement('div'); l.className = 'dg-pbreak'; l.setAttribute('data-noexport', ''); l.style.top = (p * 1123) + 'px'; l.innerHTML = '<span>Page ' + (p + 1) + '</span>'; doc.appendChild(l); }
    }
    stage.style.height = Math.ceil(doc.offsetHeight * sc) + 'px';
  }
  // click text on the document to change it
  sheet.addEventListener('focusin', (e) => {
    const el = e.target.closest('.ek'); if (!el) return;
    editing = true;
    if (el.classList.contains('is-ph')) { el.textContent = ''; el.classList.remove('is-ph'); }
    if (el.dataset.n) el.textContent = el.dataset.raw || '';
  });
  sheet.addEventListener('input', (e) => {
    const el = e.target.closest('.ek'); if (!el || el.dataset.n) return;
    const v = txtOf(el).replace(/\u00a0/g, ' ').replace(/\n$/, '');
    setP(S, el.dataset.k, el.dataset.ml ? v : v.replace(/\n/g, ' '));
    const f = form.querySelector('[data-f="' + el.dataset.k + '"]'); if (f) f.value = getP(S, el.dataset.k);
    save();
  });
  sheet.addEventListener('keydown', (e) => {
    const el = e.target.closest('.ek'); if (!el) return;
    if (e.key === 'Enter' && !el.dataset.ml) { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') el.blur();
  });
  sheet.addEventListener('paste', (e) => {
    const el = e.target.closest('.ek'); if (!el) return;
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text') || '';
    document.execCommand('insertText', false, el.dataset.ml ? t : t.replace(/\s*\n\s*/g, ' '));
  });
  sheet.addEventListener('focusout', (e) => {
    const el = e.target.closest('.ek'); if (!el) return;
    if (el.dataset.n) {
      const v = txtOf(el).replace(/[^\d.,-]/g, '').replace(/,/g, '');
      setP(S, el.dataset.k, v);
      const f = form.querySelector('[data-f="' + el.dataset.k + '"]'); if (f) f.value = v;
      save();
    }
    editing = false;
    setTimeout(() => { if (!editing) render(); }, 0);
  });

  /* export */
  async function prepare() {
    await fontsReady();
    const tp = tplOf(S.tpl);
    let host = $('dg-host');
    if (!host) { host = document.createElement('div'); host.id = 'dg-host'; host.className = 'dg-host'; host.setAttribute('aria-hidden', 'true'); document.body.appendChild(host); }
    host.innerHTML = docHtml(tp, S, 'export');
    const doc = host.firstElementChild;
    await Promise.all([].map.call(doc.querySelectorAll('img'), (im) => im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; })));
    const pageH = tp.paper === 'a4' ? 1123 : 0;
    const pages = pageH ? paginate(doc, pageH, 1) : 1;
    return { tp, host, doc, pageH, pages, W: doc.offsetWidth, H: doc.offsetHeight };
  }
  const fname = (ext) => kind + '-' + (String(S.no || '').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || (kind === 'invoice' ? 'INV' : 'RCT')) + '.' + ext;
  function used() { lastNo = S.no; save(); }
  async function run(fn) {
    const all = root.querySelectorAll('.dg-actions .btn');
    all.forEach((b) => { b.disabled = true; });
    try { await fn(); } catch (err) { note('Sorry, that did not work: ' + (err && err.message ? err.message : err) + '. Try again, or use Print and choose Save as PDF.'); }
    all.forEach((b) => { b.disabled = false; });
  }
  $('dg-pdf').addEventListener('click', () => run(async () => {
    note('Making your PDF...');
    const P = await prepare();
    const blob = await buildPdf(collect(P.doc), P.W, P.H, P.pageH, (kind === 'invoice' ? 'Invoice ' : 'Receipt ') + S.no);
    P.host.innerHTML = '';
    download(blob, fname('pdf')); used();
    note('Saved ' + fname('pdf') + (P.pages > 1 ? ', ' + P.pages + ' pages.' : '.'));
  }));
  $('dg-png').addEventListener('click', () => run(async () => {
    note('Making your image...');
    const P = await prepare();
    const blob = await buildPng(collect(P.doc), P.W, P.H);
    P.host.innerHTML = '';
    download(blob, fname('png')); used();
    note('Saved ' + fname('png') + '.');
  }));
  $('dg-print').addEventListener('click', () => run(async () => {
    const P = await prepare();
    const ps = $('print-sheet') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-sheet' }));
    // fix the size of each picture so the site print styles do not resize them
    P.doc.querySelectorAll('svg, img').forEach((n) => { const r = n.getBoundingClientRect(); n.style.width = r.width + 'px'; n.style.height = r.height + 'px'; });
    ps.className = 'dg-print'; ps.innerHTML = '';
    let st = $('dg-page-style'); if (!st) { st = document.createElement('style'); st.id = 'dg-page-style'; document.head.appendChild(st); }
    if (P.pageH) {
      st.textContent = '@page { size: A4; margin: 0; }';
      for (let p = 0; p < P.pages; p++) {
        const pg = document.createElement('div'); pg.className = 'dg-ppage';
        const c = P.doc.cloneNode(true); c.style.marginTop = (-p * P.pageH) + 'px';
        pg.appendChild(c); ps.appendChild(pg);
      }
    } else {
      st.textContent = '@page { size: ' + (P.W * 25.4 / 96).toFixed(1) + 'mm ' + (Math.ceil(P.H) * 25.4 / 96 + 1).toFixed(1) + 'mm; margin: 0; }';
      ps.appendChild(P.doc.cloneNode(true));
    }
    P.host.innerHTML = '';
    used();
    const done = () => { ps.innerHTML = ''; ps.className = ''; st.textContent = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    note('If the print window did not open, press Ctrl and P.');
  }));

  /* start */
  buildGallery();
  fillForm();
  tsel.value = S.tpl;
  render();
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { fitPreview(); fitThumbs(); }); ro.observe(stage); ro.observe(gal); }
  else window.addEventListener('resize', () => { fitPreview(); fitThumbs(); });
  fontsReady().then(() => { fitPreview(); });
  window.DocGen._state = S; // for tests
  window.DocGen._render = render;
}

window.DocGen = { init, calc, money, nextNo, fdate, CURRENCIES, svgNS: SVGNS, _buildPdf: buildPdf };
})();
