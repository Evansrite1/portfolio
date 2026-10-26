/* pdfconv-core.js: the converters behind the PDF converter page.
   Readers for Word, Excel, CSV, PowerPoint, Markdown and HTML, a small layout engine that writes
   them into a PDF with pdf-lib, and writers for .docx, .xlsx, .pptx, .csv, .txt and .html made from PDF text.
   Everything runs in the browser. Nothing is uploaded.
   Libraries are read from globalThis (fflate, PDFLib, fontkit, DOMParser) so the same file also runs in tests. */

const G = globalThis;
function lib(name) {
  const v = G[name];
  if (!v) throw new Error('A part of the converter (' + name + ') did not load. Reload the page and try again.');
  return v;
}

/* ------------------------------------------------------------------ zip and xml */
export function unzip(data) {
  let files;
  try { files = lib('fflate').unzipSync(data instanceof Uint8Array ? data : new Uint8Array(data)); }
  catch (e) { throw new Error('the file is damaged or is not a real Office file'); }
  const out = {};
  for (const k in files) out[k.replace(/\\/g, '/').replace(/^\/+/, '')] = files[k];
  return out;
}
function zget(z, p) {
  if (!p) return null;
  if (z[p]) return z[p];
  const lo = p.toLowerCase();
  for (const k in z) if (k.toLowerCase() === lo) return z[k];
  return null;
}
function ztext(z, p) {
  const u = zget(z, p);
  return u ? lib('fflate').strFromU8(u).replace(/^\ufeff/, '') : null;
}
/* parts: [[name, string or Uint8Array]] in order. Text parts are compressed, binary parts are stored. */
export function zipParts(parts) {
  const ff = lib('fflate');
  const o = {};
  for (const [n, d] of parts) o[n] = [typeof d === 'string' ? ff.strToU8(d) : d, { level: typeof d === 'string' ? 6 : 0 }];
  return ff.zipSync(o);
}

export function parseXml(s) {
  if (s == null) return null;
  const d = new (lib('DOMParser'))().parseFromString(s, 'application/xml');
  if (d.getElementsByTagName('parsererror').length) throw new Error('part of the file could not be read');
  return d;
}
const kids = (n, name) => (n ? Array.from(n.childNodes).filter((c) => c.nodeType === 1 && (!name || c.localName === name)) : []);
const kid = (n, name) => kids(n, name)[0] || null;
function path(n, ...names) { for (const nm of names) { n = kid(n, nm); if (!n) return null; } return n; }
const all = (n, name) => (n ? Array.from(n.getElementsByTagNameNS('*', name)) : []);
function at(n, q) {
  if (!n || !n.getAttribute) return null;
  const v = n.getAttribute(q);
  if (v != null) return v;
  const i = q.indexOf(':');
  const local = i >= 0 ? q.slice(i + 1) : q;
  for (const a of Array.from(n.attributes || [])) {
    if (a.localName === local && (i >= 0 ? !!a.prefix : !a.prefix)) return a.value;
  }
  return null;
}
const num = (v, d) => { const x = parseFloat(v); return isFinite(x) ? x : d; };

export function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/g, '$1')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function resolvePath(dir, t) {
  if (!t) return null;
  if (t[0] === '/') return t.slice(1);
  const out = [];
  for (const p of (dir + t).split('/')) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
  return out.join('/');
}
function readRels(z, partPath) {
  const dir = partPath.replace(/[^/]*$/, '');
  const file = partPath.slice(dir.length);
  const x = parseXml(ztext(z, dir + '_rels/' + file + '.rels'));
  const m = {};
  if (x) {
    for (const r of all(x, 'Relationship')) {
      const ext = r.getAttribute('TargetMode') === 'External';
      m[r.getAttribute('Id')] = { type: r.getAttribute('Type') || '', target: ext ? null : resolvePath(dir, decodeURIComponent(r.getAttribute('Target') || '')) };
    }
  }
  return m;
}
function mainPart(z, fallback) {
  const r = readRels(z, '');
  for (const k in r) if (/\/officeDocument$/.test(r[k].type) && r[k].target && zget(z, r[k].target)) return r[k].target;
  return fallback;
}
const relOfType = (R, re) => { for (const k in R) if (re.test(R[k].type)) return R[k].target; return null; };

function extOf(p) { const m = /\.([a-z0-9]+)$/i.exec(p || ''); return m ? m[1].toLowerCase() : ''; }
export function sniffImage(u8) {
  if (!u8 || u8.length < 4) return '';
  if (u8[0] === 0xff && u8[1] === 0xd8) return 'jpeg';
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'png';
  return '';
}

/* ------------------------------------------------------------------ fonts */
/* Embeds the Unicode fonts and returns helpers. clean() swaps characters the font cannot show for "?". */
export async function embedFonts(pdf, regBytes, boldBytes) {
  pdf.registerFontkit(lib('fontkit'));
  const r = await pdf.embedFont(regBytes, { subset: true });
  const b = await pdf.embedFont(boldBytes, { subset: true });
  let fk = r.embedder && r.embedder.font;
  if (!fk || !fk.hasGlyphForCodePoint) fk = lib('fontkit').create(regBytes);
  const cache = new Map();
  const has = (cp) => {
    let v = cache.get(cp);
    if (v === undefined) { v = !!fk.hasGlyphForCodePoint(cp); cache.set(cp, v); }
    return v;
  };
  const F = {
    r, b, replaced: 0,
    clean(s) {
      s = String(s == null ? '' : s).normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
        .replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '').replace(/[\u2028\u2029]/g, '\n');
      let out = '';
      for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp === 10) { out += ch; continue; }
        if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) continue;
        if (has(cp)) out += ch;
        else if (cp === 0xa0 || cp === 0x2007 || cp === 0x202f) out += ' ';
        else if (cp >= 0x300 && cp < 0x370) continue;
        else if (cp >= 0xfe00 && cp <= 0xfe0f) continue;
        else { out += '?'; F.replaced++; }
      }
      return out;
    }
  };
  return F;
}

/* ------------------------------------------------------------------ text layout */
/* runs: [{text, b, i, size, color}] -> lines: [{segs:[{text, font, size, color, i, w}], w, size}] */
export function wrapRuns(F, runs, maxW, defSize) {
  const lines = [];
  let cur = { segs: [], w: 0, size: 0, soft: false };
  const push = () => {
    while (cur.segs.length && /^ +$/.test(cur.segs[cur.segs.length - 1].text)) cur.w -= cur.segs.pop().w;
    const last = cur.segs[cur.segs.length - 1];
    if (last && / +$/.test(last.text)) { const t = last.text.replace(/ +$/, ''); const nw = last.font.widthOfTextAtSize(t, last.size); cur.w -= last.w - nw; last.w = nw; last.text = t; }
    if (!cur.size) cur.size = defSize;
    lines.push(cur);
    cur = { segs: [], w: 0, size: 0, soft: false };
  };
  const add = (text, w, font, run, size) => {
    const last = cur.segs[cur.segs.length - 1];
    if (last && last.font === font && last.size === size && last.color === run.color && !!last.i === !!run.i) { last.text += text; last.w += w; }
    else cur.segs.push({ text, w, font, size, color: run.color, i: !!run.i });
    cur.w += w;
    if (size > cur.size) cur.size = size;
  };
  for (const run of runs) {
    const font = run.b ? F.b : F.r;
    const size = run.size || defSize;
    const text = F.clean(run.text);
    for (const part of text.split(/(\n| +)/)) {
      if (!part) continue;
      if (part === '\n') { if (!cur.size) cur.size = size; push(); continue; }
      const w = font.widthOfTextAtSize(part, size);
      if (part[0] === ' ') { if (!cur.segs.length && cur.soft) continue; add(part, w, font, run, size); continue; }
      if (cur.w + w <= maxW) { add(part, w, font, run, size); continue; }
      if (cur.w > 0) { push(); cur.soft = true; }
      if (w <= maxW) { add(part, w, font, run, size); continue; }
      /* a word longer than the line: cut it */
      let chars = Array.from(part);
      while (chars.length) {
        const tw = font.widthOfTextAtSize(chars.join(''), size);
        if (tw <= maxW) { add(chars.join(''), tw, font, run, size); break; }
        let n = Math.max(1, Math.floor((chars.length * maxW) / tw));
        while (n > 1 && font.widthOfTextAtSize(chars.slice(0, n).join(''), size) > maxW) n--;
        while (n < chars.length && font.widthOfTextAtSize(chars.slice(0, n + 1).join(''), size) <= maxW) n++;
        const piece = chars.slice(0, n).join('');
        add(piece, font.widthOfTextAtSize(piece, size), font, run, size);
        chars = chars.slice(n);
        if (chars.length) { push(); cur.soft = true; }
      }
    }
  }
  if (cur.segs.length || !lines.length) push();
  return lines;
}

function drawLine(page, ln, x, baseline, defColor) {
  const { degrees } = lib('PDFLib');
  let cx = x;
  for (const s of ln.segs) {
    if (s.text && !/^ +$/.test(s.text)) {
      const o = { x: cx, y: baseline, size: s.size, font: s.font, color: s.color || defColor };
      if (s.i) o.ySkew = degrees(12);
      page.drawText(s.text, o);
    }
    cx += s.w;
  }
}
const LH = 1.32;
const baseOf = (size) => size * 1.02;

const STYLE = {
  h1: [2.0, 1, 0.9, 0.45], h2: [1.6, 1, 0.8, 0.4], h3: [1.3, 1, 0.7, 0.35], h4: [1.12, 1, 0.6, 0.3], h5: [1.0, 1, 0.5, 0.25], h6: [1.0, 1, 0.5, 0.25],
  p: [1, 0, 0, 0.55], li: [1, 0, 0, 0.2], code: [0.88, 0, 0.3, 0.6], quote: [1, 0, 0.3, 0.6], cap: [0.85, 0, 0, 0.5]
};

/* Table layout: widths per column and the font size that fits. */
function tableSizes(F, rows, cw, base) {
  const n = Math.max(1, ...rows.map((r) => r.length));
  const pad = 4;
  const sample = rows.slice(0, 400);
  const natAt = (size) => {
    const nat = new Array(n).fill(0);
    for (let ri = 0; ri < sample.length; ri++) {
      const r = sample[ri];
      for (let c = 0; c < n; c++) {
        const t = F.clean(r[c] == null ? '' : String(r[c]));
        if (!t) continue;
        const longest = t.split('\n').reduce((m, l) => Math.max(m, (ri === 0 ? F.b : F.r).widthOfTextAtSize(l.slice(0, 120), size)), 0);
        nat[c] = Math.max(nat[c], Math.min(longest, 240));
      }
    }
    return nat.map((w) => Math.max(w + 2 * pad, 22));
  };
  let size = base * 0.88;
  let nat = natAt(size);
  let sum = nat.reduce((a, b) => a + b, 0);
  if (sum > cw) {
    const s2 = Math.max(6, size * (cw / sum));
    if (s2 < size) { nat = nat.map((w) => w * (s2 / size)); size = s2; sum = nat.reduce((a, b) => a + b, 0); }
  }
  let widths;
  if (sum <= cw) widths = nat.map((w) => w * (cw / sum));
  else {
    let minW = Math.min(40, cw / n);
    const base2 = nat.map((w) => Math.min(w, minW));
    const rest = cw - base2.reduce((a, b) => a + b, 0);
    const extra = nat.map((w, i) => w - base2[i]);
    const es = extra.reduce((a, b) => a + b, 0) || 1;
    widths = base2.map((w, i) => w + (rest * extra[i]) / es);
  }
  return { n, widths, size, pad };
}

/* Draw a table. Returns the new y. When paginate is false it stops at maxY. */
function drawTable(ctx, rows, header, x, cw, y0) {
  const { rgb } = lib('PDFLib');
  const { F, base } = ctx;
  if (!rows.length) return y0;
  const T = tableSizes(F, rows, cw, base);
  const lh = T.size * LH;
  const border = rgb(0.72, 0.72, 0.72), shade = rgb(0.93, 0.93, 0.93), ink = ctx.ink || rgb(0.12, 0.12, 0.12);
  let y = y0;
  const layRow = (r, bold) => {
    const cells = [];
    let maxL = 1;
    for (let c = 0; c < T.n; c++) {
      const t = r[c] == null ? '' : String(r[c]);
      const w = T.widths[c] - 2 * T.pad;
      const lines = t ? wrapRuns(F, [{ text: t, b: bold, size: T.size }], Math.max(4, w), T.size) : [];
      cells.push(lines);
      maxL = Math.max(maxL, lines.length);
    }
    return { cells, h: maxL * lh + 2 * T.pad };
  };
  const headRow = header ? layRow(rows[0], true) : null;
  const drawRow = (R, bold) => {
    let h = R.h;
    const limit = ctx.maxY - y;
    if (h > limit) h = limit;
    let cx = x;
    for (let c = 0; c < T.n; c++) {
      const w = T.widths[c];
      ctx.page.drawRectangle({ x: cx, y: ctx.H - y - h, width: w, height: h, borderColor: border, borderWidth: 0.5, color: bold ? shade : undefined });
      let ly = y + T.pad;
      for (const ln of R.cells[c]) {
        if (ly + lh > y + h + 0.5) break;
        drawLine(ctx.page, ln, cx + T.pad, ctx.H - (ly + baseOf(T.size) * 0.95), ink);
        ly += lh;
      }
      cx += w;
    }
    y += h;
  };
  for (let i = 0; i < rows.length; i++) {
    const isHead = header && i === 0;
    const R = isHead ? headRow : layRow(rows[i], false);
    if (y + R.h > ctx.maxY && y > ctx.topY + 0.5) {
      if (!ctx.paginate) break;
      ctx.newPage();
      y = ctx.topY;
      if (header && !isHead) drawRow(headRow, true);
    }
    drawRow(R, isHead);
  }
  return y;
}

/* Lay out document blocks onto new pages of pdf.
   blocks: {type:'p', style, runs, level, bullet, align} | {type:'img', bytes, ext, w, h, align} | {type:'table', rows, header}
           | {type:'hr'} | {type:'pagebreak'}
   o: {F, W, H, m, base, scale, embed(block) -> Promise<PDFImage|null>} */
export async function renderBlocks(pdf, blocks, o) {
  const { rgb } = lib('PDFLib');
  const ink = rgb(0.12, 0.12, 0.12), soft = rgb(0.38, 0.38, 0.38), rule = rgb(0.75, 0.75, 0.75), shade = rgb(0.95, 0.95, 0.95);
  const { F, W, H, m } = o;
  const base = o.base || 11;
  const scale = o.scale || 1;
  const cw = W - 2 * m;
  const ctx = { F, base, H, page: null, topY: m, maxY: H - m, paginate: true, ink };
  let y = m, pages = 0, skipped = 0;
  ctx.newPage = () => { ctx.page = pdf.addPage([W, H]); pages++; y = m; };
  const room = (h) => { if (!ctx.page || (y + h > H - m && y > m + 0.5)) ctx.newPage(); };
  let prevAfter = 0;
  for (const blk of blocks) {
    if (blk.type === 'pagebreak') { if (ctx.page && y > m + 0.5) ctx.newPage(); prevAfter = 0; continue; }
    if (blk.type === 'hr') { room(14); y += 7; ctx.page.drawLine({ start: { x: m, y: H - y }, end: { x: W - m, y: H - y }, thickness: 0.7, color: rule }); y += 7; prevAfter = 0; continue; }
    if (blk.type === 'img') {
      let img = null;
      try { img = await o.embed(blk); } catch (e) { img = null; }
      if (!img) { skipped++; continue; }
      let dw = blk.w || img.width * 0.75, dh = blk.h || img.height * 0.75;
      const k = Math.min(1, cw / dw, (H - 2 * m) / dh);
      dw *= k; dh *= k;
      room(dh + 6);
      const x = blk.align === 'center' ? m + (cw - dw) / 2 : blk.align === 'right' ? W - m - dw : m;
      ctx.page.drawImage(img, { x, y: H - y - dh, width: dw, height: dh });
      y += dh + 6;
      prevAfter = 0;
      continue;
    }
    if (blk.type === 'table') {
      if (!blk.rows || !blk.rows.length) continue;
      room(base * 3);
      if (y > m + 0.5) y += Math.max(0, base * 0.4 - prevAfter);
      y = drawTable(ctx, blk.rows, !!blk.header, m, cw, y);
      y += base * 0.8;
      prevAfter = base * 0.8;
      continue;
    }
    /* paragraph */
    const st = STYLE[blk.style] || STYLE.p;
    const heading = /^h\d$/.test(blk.style);
    const defSize = base * st[0];
    const indent = blk.style === 'li' ? 18 + 18 * (blk.level || 0) : blk.style === 'quote' ? 16 : blk.style === 'code' ? 8 : 0;
    const runs = (blk.runs && blk.runs.length ? blk.runs : [{ text: '' }]).map((r) => ({
      text: r.text, b: r.b || st[1] === 1, i: r.i, color: blk.style === 'quote' ? soft : r.color,
      size: heading || blk.style === 'code' || !r.size ? defSize : r.size * scale
    }));
    const lines = wrapRuns(F, runs, cw - indent - (blk.style === 'code' ? 8 : 0), defSize);
    const before = y > m + 0.5 ? Math.max(0, defSize * st[2] - prevAfter) : 0;
    const firstH = lines[0].size * LH;
    room(before + firstH * (heading ? 2.2 : 1));
    if (y > m + 0.5) y += before;
    lines.forEach((ln, li) => {
      const lh = ln.size * LH;
      if (y + lh > H - m && y > m + 0.5) ctx.newPage();
      let x = m + indent;
      const avail = cw - indent;
      if (blk.align === 'center') x += Math.max(0, (avail - ln.w) / 2);
      else if (blk.align === 'right') x += Math.max(0, avail - ln.w);
      if (blk.style === 'code') { ctx.page.drawRectangle({ x: m, y: H - y - lh, width: cw, height: lh, color: shade }); x += 4; }
      if (blk.style === 'quote') ctx.page.drawRectangle({ x: m + 2, y: H - y - lh, width: 2.5, height: lh, color: rule });
      const bl = H - (y + baseOf(ln.size));
      if (li === 0 && blk.bullet) {
        const bt = F.clean(blk.bullet);
        const bw = F.r.widthOfTextAtSize(bt, ln.size);
        ctx.page.drawText(bt, { x: m + indent - 5 - bw, y: bl, size: ln.size, font: F.r, color: ink });
      }
      drawLine(ctx.page, ln, x, bl, ink);
      y += lh;
    });
    const after = defSize * st[3];
    y += after;
    prevAfter = after;
  }
  if (!ctx.page) ctx.newPage();
  return { pages, skipped };
}

/* ------------------------------------------------------------------ images to PDF */
export const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };

/* page and drawn size for an image of iw x ih turned by total degrees */
export function imageLayout(iw, ih, total, opts) {
  const rotated = total % 180 !== 0;
  const vw = rotated ? ih : iw, vh = rotated ? iw : ih;
  const m = opts.margin || 0;
  let pw, ph, dwv, dhv;
  if (opts.size === 'fit') {
    let k = opts.pxToPt || 0.75;
    const longest = Math.max(vw, vh) * k + 2 * m;
    if (longest > 14000) k *= 14000 / longest;
    dwv = vw * k; dhv = vh * k;
    pw = dwv + 2 * m; ph = dhv + 2 * m;
  } else {
    const [a, b] = PAGE_SIZES[opts.size] || PAGE_SIZES.a4;
    const landscape = opts.orient === 'landscape' || (opts.orient !== 'portrait' && vw > vh);
    pw = landscape ? Math.max(a, b) : Math.min(a, b);
    ph = landscape ? Math.min(a, b) : Math.max(a, b);
    const s = Math.min((pw - 2 * m) / vw, (ph - 2 * m) / vh);
    dwv = vw * s; dhv = vh * s;
  }
  return { pw, ph, dw: rotated ? dhv : dwv, dh: rotated ? dwv : dhv };
}
function placement(cx, cy, dw, dh, total) {
  const theta = (360 - total) % 360;
  if (theta === 90) return { x: cx + dh / 2, y: cy - dw / 2, theta };
  if (theta === 180) return { x: cx + dw / 2, y: cy + dh / 2, theta };
  if (theta === 270) return { x: cx - dh / 2, y: cy + dw / 2, theta };
  return { x: cx - dw / 2, y: cy - dh / 2, theta: 0 };
}
/* Add one page holding an embedded image (PDFImage). total = clockwise rotation in degrees. */
export function addImagePage(pdf, img, total, opts) {
  const { degrees } = lib('PDFLib');
  total = ((total % 360) + 360) % 360;
  const L = imageLayout(img.width, img.height, total, opts);
  const page = pdf.addPage([L.pw, L.ph]);
  const p = placement(L.pw / 2, L.ph / 2, L.dw, L.dh, total);
  page.drawImage(img, { x: p.x, y: p.y, width: L.dw, height: L.dh, rotate: degrees(p.theta) });
  return page;
}

/* ------------------------------------------------------------------ plain text, CSV, Markdown */
export function decodeText(u8) {
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^\ufeff/, ''); }
  catch (e) { return new TextDecoder('windows-1252').decode(u8); }
}

export function readPlainText(text) {
  const blocks = [];
  const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const p of paras) blocks.push({ type: 'p', style: 'p', runs: [{ text: p.replace(/\n+$/, '') }] });
  return blocks;
}

export function parseCsv(text) {
  text = text.replace(/^\ufeff/, '');
  const firstLines = text.slice(0, 5000).split(/\r?\n/).slice(0, 5).join('\n');
  let delim = ',', best = -1;
  for (const d of [',', ';', '\t', '|']) {
    let c = 0, q = false;
    for (const ch of firstLines) { if (ch === '"') q = !q; else if (!q && ch === d) c++; }
    if (c > best) { best = c; delim = d; }
  }
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}

function mdInline(src, base) {
  const runs = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(?=\S)(.+?)(?<=\S)\3|`([^`]+)`|!\[([^\]]*)\]\([^)]*\)|\[([^\]]+)\]\(([^)\s]*)[^)]*\)|<(https?:[^>\s]+)>|<\/?[a-zA-Z][^>]*>|\\([\\`*_{}\[\]()#+\-.!>|])/g;
  let last = 0, mt;
  const b = (base && base.b) || false, i = (base && base.i) || false;
  const text = (t) => { if (t) runs.push({ text: t, b, i }); };
  while ((mt = re.exec(src))) {
    text(src.slice(last, mt.index));
    if (mt[2] != null) runs.push(...mdInline(mt[2], { b: true, i }));
    else if (mt[4] != null) runs.push(...mdInline(mt[4], { b, i: true }));
    else if (mt[5] != null) runs.push({ text: mt[5], b, i });
    else if (mt[6] != null) { if (mt[6]) text('[' + mt[6] + ']'); }
    else if (mt[7] != null) runs.push(...mdInline(mt[7], { b, i }));
    else if (mt[9] != null) text(mt[9]);
    else if (mt[10] != null) text(mt[10]);
    last = re.lastIndex;
  }
  text(src.slice(last));
  return runs;
}
const mdCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|').replace(/\*\*|__|`/g, ''));

export function parseMarkdown(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  const flush = () => {
    if (!para.length) return;
    let t = '';
    para.forEach((l, k) => { const hard = / {2,}$|\\$/.test(l); t += l.replace(/ {2,}$|\\$/, '').trim() + (k < para.length - 1 ? (hard ? '\n' : ' ') : ''); });
    blocks.push({ type: 'p', style: 'p', runs: mdInline(t) });
    para = [];
  };
  const isSep = (l) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let mt;
    if ((mt = /^\s*(```+|~~~+)/.exec(line))) {
      flush();
      const fence = mt[1];
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) code.push(lines[i++]);
      blocks.push({ type: 'p', style: 'code', runs: [{ text: code.join('\n') }] });
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    if ((mt = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) { flush(); blocks.push({ type: 'p', style: 'h' + mt[1].length, runs: mdInline(mt[2]) }); continue; }
    if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); blocks.push({ type: 'hr' }); continue; }
    if (para.length && /^ {0,3}=+\s*$/.test(line)) { const t = para.join(' '); para = []; blocks.push({ type: 'p', style: 'h1', runs: mdInline(t) }); continue; }
    if (para.length && /^ {0,3}-+\s*$/.test(line)) { const t = para.join(' '); para = []; blocks.push({ type: 'p', style: 'h2', runs: mdInline(t) }); continue; }
    if (line.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      flush();
      const rows = [mdCells(line)];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(mdCells(lines[i++]));
      i--;
      blocks.push({ type: 'table', rows, header: true });
      continue;
    }
    if ((mt = /^\s*>\s?(.*)$/.exec(line))) {
      flush();
      const q = [mt[1]];
      while (i + 1 < lines.length && /^\s*>/.test(lines[i + 1])) q.push(lines[++i].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'p', style: 'quote', runs: mdInline(q.join(' ')) });
      continue;
    }
    if ((mt = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line))) {
      flush();
      const level = Math.min(5, Math.floor(mt[1].replace(/\t/g, '    ').length / 2));
      let t = mt[3];
      const task = /^\[( |x|X)\]\s+/.exec(t);
      if (task) t = (task[1] === ' ' ? '[ ] ' : '[x] ') + t.slice(task[0].length);
      while (i + 1 < lines.length && lines[i + 1].trim() && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*([-*+]|\d{1,9}[.)])\s+/.test(lines[i + 1])) t += ' ' + lines[++i].trim();
      blocks.push({ type: 'p', style: 'li', level, bullet: /\d/.test(mt[2]) ? mt[2].replace(')', '.') : '\u2022', runs: mdInline(t) });
      continue;
    }
    if (!para.length && /^( {4}|\t)/.test(line)) {
      const code = [line.replace(/^( {4}|\t)/, '')];
      while (i + 1 < lines.length && (/^( {4}|\t)/.test(lines[i + 1]) || !lines[i + 1].trim())) code.push(lines[++i].replace(/^( {4}|\t)/, ''));
      while (code.length && !code[code.length - 1].trim()) code.pop();
      blocks.push({ type: 'p', style: 'code', runs: [{ text: code.join('\n') }] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

/* ------------------------------------------------------------------ HTML */
function dataUri(src) {
  const mt = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(src || '');
  if (!mt) return null;
  try {
    let bytes;
    if (mt[3]) { const bin = atob(mt[4].replace(/\s+/g, '')); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    else bytes = new TextEncoder().encode(decodeURIComponent(mt[4]));
    return { bytes, ext: (mt[1].split('/')[1] || '').replace('+xml', '').replace('jpg', 'jpeg') };
  } catch (e) { return null; }
}

export function readHtml(str) {
  const d = new (lib('DOMParser'))().parseFromString(str, 'text/html');
  const blocks = [];
  let runs = [];
  let cur = { style: 'p' };
  let skippedImages = 0;
  const flush = () => {
    if (runs.some((r) => r.text.trim())) {
      if (cur.style !== 'code') { runs[0].text = runs[0].text.replace(/^\s+/, ''); const l = runs[runs.length - 1]; l.text = l.text.replace(/\s+$/, ''); }
      blocks.push(Object.assign({ type: 'p', runs }, cur));
    }
    runs = [];
    cur = { style: cur.keep || 'p', keep: cur.keep, level: cur.level, bullet: undefined };
    if (!cur.keep) cur = { style: 'p' };
  };
  const SKIP = /^(script|style|noscript|template|head|title|svg|canvas|iframe|object|embed|video|audio|select|input|button|textarea|map|math)$/;
  const BLOCK = /^(p|div|section|article|header|footer|main|nav|aside|figure|figcaption|address|dl|dt|dd|form|fieldset|legend|center|details|summary|body|html)$/;
  const listStack = [];
  function walk(n, f) {
    if (n.nodeType === 3) {
      let t = n.nodeValue;
      if (!f.pre) { t = t.replace(/\s+/g, ' '); if (t === ' ' && (!runs.length || /\s$/.test(runs[runs.length - 1].text))) return; }
      if (t) runs.push({ text: t, b: f.b, i: f.i });
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.localName;
    if (SKIP.test(tag)) return;
    const css = (n.getAttribute('style') || '').toLowerCase();
    if (/display\s*:\s*none/.test(css) || n.hasAttribute('hidden')) return;
    const g = Object.assign({}, f);
    if (/^(b|strong|th)$/.test(tag) || /font-weight\s*:\s*(bold|[6-9]00)/.test(css)) g.b = true;
    if (/^(i|em|cite|var|dfn)$/.test(tag) || /font-style\s*:\s*italic/.test(css)) g.i = true;
    const align = (/text-align\s*:\s*(center|right)/.exec(css) || [])[1] || ({ center: 'center', right: 'right' })[(n.getAttribute('align') || '').toLowerCase()];
    const kidsWalk = () => { for (const c of Array.from(n.childNodes)) walk(c, g); };
    if (/^h[1-6]$/.test(tag)) { flush(); cur = { style: tag, align }; kidsWalk(); flush(); return; }
    if (tag === 'br') { runs.push({ text: '\n', b: f.b, i: f.i }); return; }
    if (tag === 'hr') { flush(); blocks.push({ type: 'hr' }); return; }
    if (tag === 'pre') { flush(); cur = { style: 'code' }; g.pre = true; kidsWalk(); flush(); return; }
    if (tag === 'blockquote') { flush(); cur = { style: 'quote', keep: 'quote' }; kidsWalk(); cur.keep = null; flush(); cur = { style: 'p' }; return; }
    if (tag === 'ul' || tag === 'ol') {
      flush();
      listStack.push({ ol: tag === 'ol', n: parseInt(n.getAttribute('start') || '1', 10) || 1 });
      kidsWalk();
      flush();
      listStack.pop();
      return;
    }
    if (tag === 'li') {
      flush();
      const L = listStack[listStack.length - 1] || { ol: false, n: 1 };
      cur = { style: 'li', level: Math.max(0, listStack.length - 1), bullet: L.ol ? (L.n++) + '.' : '\u2022' };
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType === 1 && /^(ul|ol)$/.test(c.localName)) { walk(c, g); continue; }
        walk(c, g);
      }
      flush();
      return;
    }
    if (tag === 'table') {
      flush();
      const rows = [];
      let header = false;
      for (const tr of Array.from(n.querySelectorAll('tr'))) {
        if (tr.closest('table') !== n) continue;
        const cells = Array.from(tr.children).filter((c) => /^(td|th)$/.test(c.localName));
        if (!rows.length && cells.length && cells.every((c) => c.localName === 'th')) header = true;
        if (!rows.length && tr.parentNode && tr.parentNode.localName === 'thead') header = true;
        rows.push(cells.map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim()));
      }
      if (rows.length) blocks.push({ type: 'table', rows, header });
      return;
    }
    if (tag === 'img') {
      const di = dataUri(n.getAttribute('src'));
      if (!di) { skippedImages++; const alt = n.getAttribute('alt'); if (alt) runs.push({ text: '[' + alt + ']', b: f.b, i: f.i }); return; }
      flush();
      const w = parseFloat(n.getAttribute('width')), h = parseFloat(n.getAttribute('height'));
      blocks.push({ type: 'img', bytes: di.bytes, ext: di.ext, w: w ? w * 0.75 : 0, h: h ? h * 0.75 : 0, align: 'left' });
      return;
    }
    if (BLOCK.test(tag)) { flush(); if (align && cur.style === 'p') cur.align = align; kidsWalk(); flush(); return; }
    kidsWalk();
  }
  walk(d.body || d.documentElement, { b: false, i: false, pre: false });
  flush();
  return { blocks, skippedImages, title: (d.title || '').trim() };
}

/* ------------------------------------------------------------------ Word .docx */
function numFmtText(fmt, n) {
  if (fmt === 'bullet') return '\u2022';
  if (fmt === 'lowerLetter' || fmt === 'upperLetter') {
    let s = '', x = n;
    while (x > 0) { x--; s = String.fromCharCode(97 + (x % 26)) + s; x = Math.floor(x / 26); }
    return fmt === 'upperLetter' ? s.toUpperCase() : s;
  }
  if (fmt === 'lowerRoman' || fmt === 'upperRoman') {
    const R = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let s = '', x = n;
    for (const [v, t] of R) while (x >= v) { s += t; x -= v; }
    return fmt === 'upperRoman' ? s.toUpperCase() : s;
  }
  if (fmt === 'none') return '';
  return String(n);
}
const onOff = (n) => !!n && !/^(0|false|off|none)$/i.test(at(n, 'w:val') || '');

export function readDocx(u8) {
  const z = unzip(u8);
  const docPath = mainPart(z, 'word/document.xml');
  const x = parseXml(ztext(z, docPath));
  if (!x || x.documentElement.localName !== 'document') throw new Error('this is not a Word .docx file');
  const R = readRels(z, docPath);
  /* styles */
  const styles = {};
  const sx = parseXml(ztext(z, relOfType(R, /\/styles$/) || 'word/styles.xml'));
  if (sx) {
    for (const s of all(sx, 'style')) {
      const id = at(s, 'w:styleId');
      const ppr = kid(s, 'pPr');
      styles[id] = {
        name: (at(kid(s, 'name'), 'w:val') || '').toLowerCase(),
        basedOn: at(kid(s, 'basedOn'), 'w:val'),
        outline: at(kid(ppr, 'outlineLvl'), 'w:val'),
        numPr: kid(ppr, 'numPr'),
        jc: at(kid(ppr, 'jc'), 'w:val'),
        b: kid(kid(s, 'rPr'), 'b') ? onOff(kid(kid(s, 'rPr'), 'b')) : null
      };
    }
  }
  const styleChain = (id) => { const out = []; for (let k = 0; id && styles[id] && k < 8; k++) { out.push(styles[id]); id = styles[id].basedOn; } return out; };
  /* numbering */
  const nums = {}, abs = {};
  const nx = parseXml(ztext(z, relOfType(R, /\/numbering$/) || 'word/numbering.xml'));
  if (nx) {
    for (const a of all(nx, 'abstractNum')) {
      const lv = {};
      for (const l of kids(a, 'lvl')) lv[at(l, 'w:ilvl')] = { fmt: at(kid(l, 'numFmt'), 'w:val') || 'decimal', text: at(kid(l, 'lvlText'), 'w:val'), start: parseInt(at(kid(l, 'start'), 'w:val') || '1', 10) };
      abs[at(a, 'w:abstractNumId')] = lv;
    }
    for (const n of all(nx, 'num')) nums[at(n, 'w:numId')] = abs[at(kid(n, 'abstractNumId'), 'w:val')] || {};
  }
  const counters = {};
  const listLabel = (numId, ilvl) => {
    const lv = nums[numId] || {};
    const L = lv[ilvl] || { fmt: 'bullet' };
    const key = numId + ':';
    counters[key + ilvl] = (counters[key + ilvl] == null ? (L.start || 1) - 1 : counters[key + ilvl]) + 1;
    for (let d = +ilvl + 1; d < 10; d++) delete counters[key + d];
    if (L.fmt === 'bullet') return '\u2022';
    if (!L.text) return numFmtText(L.fmt, counters[key + ilvl]) + '.';
    return L.text.replace(/%(\d)/g, (s, k) => { const lvl = +k - 1; const c = counters[key + lvl] != null ? counters[key + lvl] : ((lv[lvl] && lv[lvl].start) || 1); return numFmtText((lv[lvl] || {}).fmt || 'decimal', c); });
  };
  const blocks = [];
  let imageCount = 0, skippedImages = 0;

  function imageBlock(rid, cx, cy) {
    const rel = R[rid];
    const bytes = rel && rel.target ? zget(z, rel.target) : null;
    if (!bytes) { skippedImages++; return null; }
    imageCount++;
    return { type: 'img', bytes, ext: extOf(rel.target), w: cx ? cx / 12700 : 0, h: cy ? cy / 12700 : 0, align: 'left' };
  }

  function paragraph(p) {
    const pPr = kid(p, 'pPr');
    const sid = at(kid(pPr, 'pStyle'), 'w:val');
    const chain = styleChain(sid);
    let style = 'p', level = 0, bullet;
    let hl = 0;
    const ol = at(kid(pPr, 'outlineLvl'), 'w:val');
    for (const s of chain) {
      const m = /^heading\s*(\d)$/.exec(s.name);
      if (m) { hl = +m[1]; break; }
      if (s.name === 'title') { hl = 1; break; }
      if (s.name === 'subtitle') { hl = 2; break; }
      if (s.outline != null && +s.outline < 9) { hl = +s.outline + 1; break; }
    }
    if (!hl && ol != null && +ol < 9) hl = +ol + 1;
    if (hl) style = 'h' + Math.min(6, hl);
    else if (chain.some((s) => /quote/.test(s.name))) style = 'quote';
    let numPr = kid(pPr, 'numPr');
    if (!numPr) for (const s of chain) if (s.numPr) { numPr = s.numPr; break; }
    if (numPr && !hl) {
      const numId = at(kid(numPr, 'numId'), 'w:val');
      const ilvl = at(kid(numPr, 'ilvl'), 'w:val') || '0';
      if (numId && numId !== '0') { style = 'li'; level = Math.min(6, +ilvl || 0); bullet = listLabel(numId, ilvl); }
    }
    let jc = at(kid(pPr, 'jc'), 'w:val');
    if (!jc) for (const s of chain) if (s.jc) { jc = s.jc; break; }
    const align = jc === 'center' ? 'center' : (jc === 'right' || jc === 'end') ? 'right' : undefined;
    const styleBold = chain.length && chain[0].b;
    let runs = [];
    let first = true;
    const emit = (force) => {
      if (runs.length || force) blocks.push({ type: 'p', style, level, bullet: first ? bullet : undefined, align, runs });
      if (runs.length || force) first = false;
      runs = [];
    };
    let inField = 0;
    function run(r) {
      const rPr = kid(r, 'rPr');
      const bN = kid(rPr, 'b'), iN = kid(rPr, 'i');
      const b = bN ? onOff(bN) : !!styleBold;
      const i = iN ? onOff(iN) : false;
      const sz = at(kid(rPr, 'sz'), 'w:val');
      const size = sz ? +sz / 2 : 0;
      if (kid(rPr, 'vanish')) return;
      for (const c of kids(r)) {
        const t = c.localName;
        if (t === 'fldChar') { const ty = at(c, 'w:fldCharType'); if (ty === 'begin') inField = 1; else if (ty === 'separate') inField = 0; else if (ty === 'end') inField = 0; continue; }
        if (inField) continue;
        if (t === 't') runs.push({ text: c.textContent, b, i, size });
        else if (t === 'tab' || t === 'ptab') runs.push({ text: '    ', b, i, size });
        else if (t === 'br') {
          if (at(c, 'w:type') === 'page') { emit(false); blocks.push({ type: 'pagebreak' }); }
          else runs.push({ text: '\n', b, i, size });
        } else if (t === 'cr') runs.push({ text: '\n', b, i, size });
        else if (t === 'noBreakHyphen') runs.push({ text: '-', b, i, size });
        else if (t === 'lastRenderedPageBreak') continue;
        else if (t === 'drawing' || t === 'pict' || t === 'object') {
          const blips = all(c, 'blip');
          const ext = all(c, 'extent')[0];
          const cx = ext ? num(at(ext, 'cx'), 0) : 0, cy = ext ? num(at(ext, 'cy'), 0) : 0;
          const ids = blips.map((bl) => at(bl, 'r:embed')).filter(Boolean);
          for (const im of all(c, 'imagedata')) { const id = at(im, 'r:id'); if (id) ids.push(id); }
          for (const id of ids.slice(0, 1)) {
            const ib = imageBlock(id, cx, cy);
            if (ib) { emit(false); ib.align = align || 'left'; blocks.push(ib); }
          }
          const txt = all(c, 'txbxContent');
          for (const tb of txt) for (const pp of all(tb, 'p')) { const s = pp.textContent.trim(); if (s) runs.push({ text: (runs.length ? ' ' : '') + s, b, i, size }); }
        }
      }
    }
    function inline(n) {
      for (const c of kids(n)) {
        const t = c.localName;
        if (t === 'r') run(c);
        else if (t === 'hyperlink' || t === 'ins' || t === 'smartTag' || t === 'customXml' || t === 'fldSimple' || t === 'bdo' || t === 'dir' || t === 'moveTo') inline(c);
        else if (t === 'sdt') inline(kid(c, 'sdtContent'));
        else if (t === 'oMath' || t === 'oMathPara') runs.push({ text: all(c, 't').map((q) => q.textContent).join('') });
        else if (t === 'AlternateContent') inline(kid(c, 'Fallback') || kid(c, 'Choice'));
      }
    }
    inline(p);
    if (runs.length || first) emit(true);
  }

  function table(tbl) {
    const rows = [];
    let header = false;
    kids(tbl, 'tr').forEach((tr, ri) => {
      if (ri === 0 && kid(kid(tr, 'trPr'), 'tblHeader')) header = true;
      const cells = [];
      for (const tc of kids(tr, 'tc').concat(kids(tr, 'sdt').map((s) => kids(kid(s, 'sdtContent'), 'tc')).flat())) {
        const vm = kid(kid(tc, 'tcPr'), 'vMerge');
        const txt = all(tc, 'p').map((p) => all(p, 't').filter((t) => t.parentNode && t.parentNode.localName === 'r').map((t) => t.textContent).join('')).join('\n').trim();
        cells.push(vm && at(vm, 'w:val') !== 'restart' && !txt ? '' : txt);
        const span = parseInt(at(kid(kid(tc, 'tcPr'), 'gridSpan'), 'w:val') || '1', 10);
        for (let s = 1; s < span; s++) cells.push('');
      }
      rows.push(cells);
    });
    if (rows.length) blocks.push({ type: 'table', rows, header });
  }

  function body(n) {
    for (const c of kids(n)) {
      const t = c.localName;
      if (t === 'p') paragraph(c);
      else if (t === 'tbl') table(c);
      else if (t === 'sdt') body(kid(c, 'sdtContent'));
      else if (t === 'customXml' || t === 'ins') body(c);
      else if (t === 'AlternateContent') body(kid(c, 'Fallback') || kid(c, 'Choice'));
    }
  }
  const b = path(x.documentElement, 'body');
  body(b);
  const sect = kids(b, 'sectPr').pop() || all(b, 'sectPr').pop();
  const pg = kid(sect, 'pgSz'), mar = kid(sect, 'pgMar');
  let pageW = pg ? num(at(pg, 'w:w'), 11906) / 20 : 0, pageH = pg ? num(at(pg, 'w:h'), 16838) / 20 : 0;
  const margin = mar ? Math.min(num(at(mar, 'w:left'), 1440), num(at(mar, 'w:top'), 1440)) / 20 : 0;
  if (!(pageW > 100 && pageH > 100)) pageW = pageH = 0;
  return { blocks, pageW, pageH, margin, imageCount, skippedImages };
}

/* ------------------------------------------------------------------ Excel .xlsx */
const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
function colIndex(ref) { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
function serialDate(v, withTime) {
  const ms = Math.round((v - 25569) * 86400000);
  const d = new Date(ms);
  if (isNaN(d)) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  let s = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  if (v < 1) s = '';
  if (withTime && v % 1) s += (s ? ' ' : '') + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  return s;
}
export const MAX_ROWS = 10000;
export function readXlsx(u8) {
  const z = unzip(u8);
  const wbPath = mainPart(z, 'xl/workbook.xml');
  const wb = parseXml(ztext(z, wbPath));
  if (!wb || wb.documentElement.localName !== 'workbook') throw new Error('this is not an Excel .xlsx file');
  const R = readRels(z, wbPath);
  const sst = [];
  const sx = parseXml(ztext(z, relOfType(R, /\/sharedStrings$/) || 'xl/sharedStrings.xml'));
  if (sx) for (const si of kids(sx.documentElement, 'si')) sst.push(kids(si, 't').map((t) => t.textContent).join('') + kids(si, 'r').map((r) => kids(r, 't').map((t) => t.textContent).join('')).join(''));
  const xfDate = [], xfPct = [];
  const st = parseXml(ztext(z, relOfType(R, /\/styles$/) || 'xl/styles.xml'));
  if (st) {
    const custom = {};
    for (const nf of all(st, 'numFmt')) custom[at(nf, 'numFmtId')] = at(nf, 'formatCode') || '';
    for (const xf of kids(kid(st.documentElement, 'cellXfs'), 'xf')) {
      const id = +(at(xf, 'numFmtId') || 0);
      const code = (custom[id] || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
      xfDate.push(BUILTIN_DATE.has(id) || (/[dy]/i.test(code) && !/^[#0.,%]+$/.test(code)) || /h+:m+/i.test(code) ? (/h/i.test(code) || id === 22 ? 2 : 1) : 0);
      xfPct.push(id === 9 || id === 10 || /%/.test(code));
    }
  }
  const sheets = [];
  let truncated = false;
  for (const s of all(wb, 'sheet')) {
    if (at(s, 'state') === 'hidden' || at(s, 'state') === 'veryHidden') continue;
    const rel = R[at(s, 'r:id')];
    const sh = rel && rel.target ? parseXml(ztext(z, rel.target)) : null;
    if (!sh) continue;
    const rows = [];
    let maxC = -1;
    const data = all(sh, 'sheetData')[0];
    let rIdx = 0;
    for (const row of kids(data, 'row')) {
      const rn = parseInt(at(row, 'r') || '0', 10);
      const ri = rn ? rn - 1 : rIdx;
      rIdx = ri + 1;
      if (ri >= MAX_ROWS) { truncated = true; break; }
      const out = [];
      let ci = 0;
      for (const c of kids(row, 'c')) {
        const ref = at(c, 'r');
        const idx = ref ? colIndex(ref) : ci;
        ci = idx + 1;
        if (idx < 0 || idx > 300) continue;
        const t = at(c, 't');
        const vN = kid(c, 'v');
        const v = vN ? vN.textContent : '';
        let val = '';
        if (t === 's') val = sst[+v] || '';
        else if (t === 'inlineStr') val = all(c, 't').map((q) => q.textContent).join('');
        else if (t === 'str' || t === 'e' || t === 'd') val = v;
        else if (t === 'b') val = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : v;
        else if (v !== '') {
          const n = +v;
          const sIdx = +(at(c, 's') || 0);
          if (!isFinite(n)) val = v;
          else if (xfDate[sIdx]) val = serialDate(n, xfDate[sIdx] === 2);
          else if (xfPct[sIdx]) val = String(Number((n * 100).toPrecision(10))) + '%';
          else val = String(Number(n.toPrecision(12)));
        }
        if (val !== '') { out[idx] = val; if (idx > maxC) maxC = idx; }
      }
      rows[ri] = out;
    }
    const filled = [];
    for (let i = 0; i < rows.length; i++) { const r = rows[i] || []; const a = []; for (let c = 0; c <= maxC; c++) a.push(r[c] == null ? '' : r[c]); filled.push(a); }
    while (filled.length && filled[filled.length - 1].every((c) => c === '')) filled.pop();
    while (filled.length && filled[0].every((c) => c === '')) filled.shift();
    let firstC = maxC + 1;
    for (const r of filled) { const k = r.findIndex((c) => c !== ''); if (k >= 0 && k < firstC) firstC = k; }
    sheets.push({ name: at(s, 'name') || 'Sheet', rows: firstC > 0 && firstC <= maxC ? filled.map((r) => r.slice(firstC)) : filled });
  }
  return { sheets, truncated };
}

/* ------------------------------------------------------------------ PowerPoint .pptx */
function hexColor(h) {
  if (!/^[0-9a-f]{6}$/i.test(h || '')) return null;
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
function colorOf(fillParent, scheme) {
  const sf = kid(fillParent, 'solidFill');
  if (!sf) return null;
  const s = kid(sf, 'srgbClr');
  if (s) return hexColor(at(s, 'val'));
  const sc = kid(sf, 'schemeClr');
  if (sc && scheme) return scheme[at(sc, 'val')] || null;
  const sys = kid(sf, 'sysClr');
  if (sys) return hexColor(at(sys, 'lastClr'));
  return null;
}
function readScheme(z, masterPath) {
  const mr = readRels(z, masterPath);
  const th = parseXml(ztext(z, relOfType(mr, /\/theme$/)));
  const sch = {};
  const cs = th ? all(th, 'clrScheme')[0] : null;
  for (const c of kids(cs)) {
    const s = kid(c, 'srgbClr'), y = kid(c, 'sysClr');
    sch[c.localName] = hexColor(s ? at(s, 'val') : y ? at(y, 'lastClr') : '');
  }
  sch.bg1 = sch.lt1; sch.tx1 = sch.dk1; sch.bg2 = sch.lt2; sch.tx2 = sch.dk2;
  return sch;
}
function xfrmOf(n) {
  if (!n) return null;
  const off = kid(n, 'off'), ext = kid(n, 'ext');
  if (!off || !ext) return null;
  return { x: num(at(off, 'x'), 0), y: num(at(off, 'y'), 0), w: num(at(ext, 'cx'), 0), h: num(at(ext, 'cy'), 0), chOff: kid(n, 'chOff'), chExt: kid(n, 'chExt') };
}
function phInfo(sp) {
  const nv = kid(sp, 'nvSpPr') || kid(sp, 'nvPicPr') || kid(sp, 'nvGraphicFramePr');
  const ph = path(nv, 'nvPr', 'ph');
  if (!ph) return null;
  return { type: at(ph, 'type') || 'obj', idx: at(ph, 'idx') };
}
function lvlSizes(lst) {
  const out = {};
  for (let i = 1; i <= 9; i++) { const d = path(lst, 'lvl' + i + 'pPr', 'defRPr'); const sz = d && at(d, 'sz'); if (sz) out[i - 1] = +sz / 100; }
  return out;
}
function phMap(xml) {
  const m = { idx: {}, type: {} };
  if (!xml) return m;
  for (const sp of all(xml, 'sp')) {
    const ph = phInfo(sp);
    if (!ph) continue;
    const info = { xfrm: xfrmOf(path(sp, 'spPr', 'xfrm')), anchor: at(path(sp, 'txBody', 'bodyPr'), 'anchor'), sizes: lvlSizes(path(sp, 'txBody', 'lstStyle')) };
    if (ph.idx != null && !m.idx[ph.idx]) m.idx[ph.idx] = info;
    if (!m.type[ph.type]) m.type[ph.type] = info;
  }
  return m;
}
const TITLE = /^(title|ctrTitle)$/;
export function readPptx(u8) {
  const z = unzip(u8);
  const presPath = mainPart(z, 'ppt/presentation.xml');
  const pres = parseXml(ztext(z, presPath));
  if (!pres || pres.documentElement.localName !== 'presentation') throw new Error('this is not a PowerPoint .pptx file');
  const R = readRels(z, presPath);
  const sz = all(pres, 'sldSz')[0];
  const cx = sz ? num(at(sz, 'cx'), 12192000) : 12192000, cy = sz ? num(at(sz, 'cy'), 6858000) : 6858000;
  const cache = {};
  const emptyMaster = { map: phMap(null), scheme: {}, title: {}, body: {}, other: {} };
  const layoutInfo = (p) => {
    if (!p) return { map: phMap(null), xml: null, master: emptyMaster };
    if (cache[p]) return cache[p];
    const lx = parseXml(ztext(z, p));
    const lr = readRels(z, p);
    const masterPath = relOfType(lr, /\/slideMaster$/);
    let master = cache[masterPath];
    if (!master && masterPath) {
      const mx = parseXml(ztext(z, masterPath));
      const ts = mx ? all(mx, 'txStyles')[0] : null;
      master = cache[masterPath] = { map: phMap(mx), xml: mx, scheme: readScheme(z, masterPath), title: lvlSizes(kid(ts, 'titleStyle')), body: lvlSizes(kid(ts, 'bodyStyle')), other: lvlSizes(kid(ts, 'otherStyle')) };
    }
    return (cache[p] = { map: phMap(lx), xml: lx, master: master || emptyMaster });
  };
  const bgOf = (xml, scheme) => { const bp = xml ? all(xml, 'bgPr')[0] : null; return bp ? colorOf(bp, scheme) : null; };
  const slides = [];
  let skipped = 0;
  for (const sid of all(pres, 'sldId')) {
    const rel = R[at(sid, 'r:id')];
    if (!rel || !rel.target) continue;
    const sx = parseXml(ztext(z, rel.target));
    if (!sx) continue;
    if (at(sx.documentElement, 'show') === '0') continue;
    const sr = readRels(z, rel.target);
    const L = layoutInfo(relOfType(sr, /\/slideLayout$/));
    const M = L.master;
    const scheme = M.scheme;
    const bg = bgOf(sx, scheme) || bgOf(L.xml, scheme) || bgOf(M.xml, scheme);
    const items = [];
    const inherit = (ph) => {
      if (!ph) return null;
      const mt = ph.type === 'ctrTitle' ? 'title' : ph.type === 'subTitle' || ph.type === 'obj' ? 'body' : ph.type;
      return (ph.idx != null && L.map.idx[ph.idx]) || L.map.type[ph.type] || M.map.type[mt] || M.map.type[ph.type] || null;
    };
    const walk = (tree, T) => {
      for (const n of kids(tree)) {
        const t = n.localName;
        if (t === 'AlternateContent') { walk(kid(n, 'Fallback') || kid(n, 'Choice'), T); continue; }
        if (t === 'grpSp') {
          const g = xfrmOf(path(n, 'grpSpPr', 'xfrm'));
          if (g && g.chOff && g.chExt) {
            const cox = num(at(g.chOff, 'x'), 0), coy = num(at(g.chOff, 'y'), 0), cex = num(at(g.chExt, 'cx'), 0) || 1, cey = num(at(g.chExt, 'cy'), 0) || 1;
            const sx2 = g.w / cex, sy2 = g.h / cey;
            walk(n, (b) => T({ x: g.x + (b.x - cox) * sx2, y: g.y + (b.y - coy) * sy2, w: b.w * sx2, h: b.h * sy2 }));
          } else walk(n, T);
          continue;
        }
        const ph = phInfo(n);
        const inh = inherit(ph);
        if (t === 'sp') {
          let xf = xfrmOf(path(n, 'spPr', 'xfrm')) || (inh && inh.xfrm);
          if (!xf) continue;
          const box = T(xf);
          const spPr = kid(n, 'spPr');
          const fill = colorOf(spPr, scheme);
          const geom = at(kid(spPr, 'prstGeom'), 'prst') || 'rect';
          const ln = kid(spPr, 'ln');
          const lineCol = ln && !kid(ln, 'noFill') ? colorOf(ln, scheme) : null;
          if (fill || lineCol) items.push({ type: 'shape', box, fill, line: lineCol, geom });
          const tb = kid(n, 'txBody');
          if (!tb) continue;
          const isTitle = ph && TITLE.test(ph.type);
          const isBody = ph && (ph.type === 'body' || ph.type === 'obj');
          const lvlDefault = (lv) => {
            const fromInh = inh && inh.sizes && inh.sizes[lv];
            if (fromInh) return fromInh;
            const ms = isTitle ? M.title : ph ? M.body : M.other;
            if (ms && ms[lv]) return ms[lv];
            if (isTitle) return ph.type === 'ctrTitle' ? 44 : 36;
            if (ph && ph.type === 'subTitle') return 22;
            if (isBody) return Math.max(12, 24 - 2 * lv);
            return 18;
          };
          const own = lvlSizes(kid(tb, 'lstStyle'));
          const paras = [];
          for (const p of kids(tb, 'p')) {
            const pPr = kid(p, 'pPr');
            const lvl = +(at(pPr, 'lvl') || 0);
            const defSize = own[lvl] || lvlDefault(lvl);
            const algn = at(pPr, 'algn');
            const runs = [];
            for (const r of kids(p)) {
              if (r.localName === 'br') { runs.push({ text: '\n', size: defSize }); continue; }
              if (r.localName !== 'r' && r.localName !== 'fld') continue;
              const rPr = kid(r, 'rPr');
              const s2 = at(rPr, 'sz');
              runs.push({ text: (kid(r, 't') || { textContent: '' }).textContent, b: at(rPr, 'b') === '1', i: at(rPr, 'i') === '1', size: s2 ? +s2 / 100 : defSize, color: colorOf(rPr, scheme) });
            }
            const hasText = runs.some((r) => r.text.trim());
            let bullet = null;
            if (hasText && !kid(pPr, 'buNone')) {
              const bc = kid(pPr, 'buChar');
              if (kid(pPr, 'buAutoNum')) bullet = 'auto';
              else if (bc) bullet = '\u2022';
              else if (isBody) bullet = '\u2022';
            }
            paras.push({ runs, lvl, defSize, align: algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : undefined, bullet });
          }
          const bodyPr = kid(tb, 'bodyPr');
          const anchor = at(bodyPr, 'anchor') || (inh && inh.anchor) || (isTitle ? 'ctr' : 't');
          if (paras.some((p) => p.runs.some((r) => r.text.trim()))) items.push({ type: 'text', box, paras, anchor, vert: at(bodyPr, 'vert') });
        } else if (t === 'pic') {
          const xf = xfrmOf(path(n, 'spPr', 'xfrm')) || (inh && inh.xfrm);
          const blip = all(n, 'blip')[0];
          const rid = blip && (at(blip, 'r:embed') || at(blip, 'r:link'));
          const r2 = rid && sr[rid];
          const bytes = r2 && r2.target ? zget(z, r2.target) : null;
          if (!xf || !bytes) { skipped++; continue; }
          items.push({ type: 'img', box: T(xf), bytes, ext: extOf(r2.target) });
        } else if (t === 'graphicFrame') {
          const xf = xfrmOf(kid(n, 'xfrm')) || (inh && inh.xfrm);
          const tbl = all(n, 'tbl')[0];
          if (!xf) continue;
          if (!tbl) { skipped++; continue; }
          const rows = kids(tbl, 'tr').map((tr) => kids(tr, 'tc').map((tc) => all(tc, 'p').map((p) => all(p, 't').map((q) => q.textContent).join('')).join('\n').trim()));
          items.push({ type: 'table', box: T(xf), rows });
        }
      }
    };
    walk(all(sx, 'spTree')[0], (b) => b);
    slides.push({ bg, items });
  }
  return { cx, cy, slides, skipped };
}

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/* One PDF page per slide, at the slide size. */
export async function renderSlides(pdf, deck, o) {
  const { rgb } = lib('PDFLib');
  const { F } = o;
  const k = 1 / 12700;
  const W = deck.cx * k, H = deck.cy * k;
  let skipped = deck.skipped || 0;
  const toRgb = (c) => rgb(c[0], c[1], c[2]);
  for (const s of deck.slides) {
    const page = pdf.addPage([W, H]);
    const bg = s.bg || [1, 1, 1];
    if (s.bg) page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: toRgb(bg) });
    for (const it of s.items) {
      const bx = it.box.x * k, by = it.box.y * k, bw = it.box.w * k, bh = it.box.h * k;
      if (it.type === 'shape') {
        const opt = { color: it.fill ? toRgb(it.fill) : undefined, borderColor: it.line ? toRgb(it.line) : undefined, borderWidth: it.line ? 1 : 0 };
        if (it.geom === 'ellipse') page.drawEllipse(Object.assign({ x: bx + bw / 2, y: H - by - bh / 2, xScale: bw / 2, yScale: bh / 2 }, opt));
        else if (bw > 0 && bh > 0) page.drawRectangle(Object.assign({ x: bx, y: H - by - bh, width: bw, height: bh }, opt));
        continue;
      }
      if (it.type === 'img') {
        let img = null;
        try { img = await o.embed(it); } catch (e) { img = null; }
        if (!img) { skipped++; continue; }
        page.drawImage(img, { x: bx, y: H - by - bh, width: bw, height: bh });
        continue;
      }
      if (it.type === 'table') {
        const ctx = { F, base: 12, H, page, topY: by, maxY: Math.min(H, by + Math.max(bh, 20) * 3), paginate: false };
        drawTable(ctx, it.rows, false, bx, bw, by);
        continue;
      }
      if (it.type === 'text') {
        const under = s.items.filter((q) => q.type === 'shape' && q.fill && q.box.x <= it.box.x + 1 && q.box.y <= it.box.y + 1 && q.box.x + q.box.w >= it.box.x + it.box.w - 1 && q.box.y + q.box.h >= it.box.y + it.box.h - 1).pop();
        const backC = under ? under.fill : bg;
        const defColor = lum(backC) < 0.45 ? rgb(1, 1, 1) : rgb(0.1, 0.1, 0.1);
        const insX = 7.2, insY = 3.6;
        const innerW = Math.max(10, bw - 2 * insX);
        let laid = null;
        for (let sc = 1; sc >= 0.3; sc -= 0.07) {
          let autoN = 0;
          const out = [];
          let total = 0;
          for (const p of it.paras) {
            const runs = p.runs.map((r) => ({ text: r.text, b: r.b, i: r.i, size: r.size * sc, color: r.color ? toRgb(r.color) : undefined }));
            const indent = p.lvl * 18 * sc + (p.bullet ? 14 * sc : 0);
            const lines = wrapRuns(F, runs.length ? runs : [{ text: '', size: p.defSize * sc }], Math.max(10, innerW - indent), p.defSize * sc);
            let bullet = null;
            if (p.bullet === 'auto') bullet = (++autoN) + '.';
            else if (p.bullet) bullet = p.bullet;
            if (!p.bullet) autoN = 0;
            const h = lines.reduce((a, l) => a + l.size * 1.2, 0) + p.defSize * sc * 0.25;
            out.push({ p, lines, indent, bullet, sc });
            total += h;
          }
          laid = { out, total };
          if (total <= bh - 2 * insY + 2) break;
        }
        let y = by + insY;
        const free = bh - 2 * insY - laid.total;
        if (free > 0) y += it.anchor === 'ctr' ? free / 2 : it.anchor === 'b' ? free : 0;
        for (const q of laid.out) {
          q.lines.forEach((ln, li) => {
            const lh = ln.size * 1.2;
            let x = bx + insX + q.indent;
            const avail = innerW - q.indent;
            if (q.p.align === 'center') x += Math.max(0, (avail - ln.w) / 2);
            else if (q.p.align === 'right') x += Math.max(0, avail - ln.w);
            const bl = H - (y + ln.size * 0.95);
            if (li === 0 && q.bullet) {
              const bt = F.clean(q.bullet);
              page.drawText(bt, { x: bx + insX + q.p.lvl * 18 * q.sc, y: bl, size: ln.size, font: F.r, color: (ln.segs[0] && ln.segs[0].color) || defColor });
            }
            drawLine(page, ln, x, bl, defColor);
            y += lh;
          });
          y += q.p.defSize * q.sc * 0.25;
        }
      }
    }
  }
  return { pages: deck.slides.length, skipped };
}

/* ------------------------------------------------------------------ PDF text -> lines, paragraphs, tables */
/* items: pdfjs textContent items. Returns lines from top to bottom with cells split at wide gaps. */
export function textLines(items) {
  const its = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string' || !it.str) continue;
    const t = it.transform || [1, 0, 0, 1, 0, 0];
    const size = Math.hypot(t[2], t[3]) || it.height || 10;
    its.push({ s: it.str, x: t[4], y: t[5], w: it.width || it.str.length * size * 0.5, size });
  }
  its.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines = [];
  let cur = null;
  for (const it of its) {
    if (cur && Math.abs(it.y - cur.y) <= Math.min(it.size, cur.size) * 0.45) cur.items.push(it);
    else { cur = { y: it.y, size: it.size, items: [it] }; lines.push(cur); }
  }
  for (const ln of lines) {
    ln.items.sort((a, b) => a.x - b.x);
    let text = '', cells = [], cell = null, prev = null, maxSize = 0, chars = 0;
    for (const it of ln.items) {
      maxSize = Math.max(maxSize, it.size);
      const blank = !it.s.trim();
      if (prev) {
        const gap = it.x - (prev.x + prev.w);
        if (gap > it.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.s)) text += ' ';
        if (!blank && (gap > Math.max(it.size, prev.size) * 1.2 || !cell)) cell = null;
      }
      text += it.s;
      if (!blank) {
        chars += it.s.length;
        if (!cell) { cell = { x: it.x, x1: it.x + it.w, text: it.s.trim() }; cells.push(cell); }
        else { const gap = it.x - cell.x1; cell.text += (gap > it.size * 0.15 && !/\s$/.test(cell.text) ? ' ' : '') + it.s.trim(); cell.x1 = it.x + it.w; }
      }
      if (!blank) prev = it;
      else if (!prev) prev = null;
    }
    ln.text = text.replace(/\s+/g, ' ').trim();
    ln.cells = cells;
    ln.size = maxSize || ln.size;
    ln.chars = chars;
    ln.x = ln.items[0].x;
    delete ln.items;
  }
  return lines.filter((l) => l.text);
}

function bodySize(lines) {
  const c = {};
  for (const l of lines) { const k = Math.round(l.size * 2) / 2; c[k] = (c[k] || 0) + l.chars; }
  let best = 10, bn = -1;
  for (const k in c) if (c[k] > bn) { bn = c[k]; best = +k; }
  return best;
}
const BULLET = /^([\u2022\u25cf\u25aa\u25e6\u2023\u2043\u2219*-]|\d{1,3}[.)]|[a-z][.)])\s+/;
/* lines -> [{type:'h', level, text} | {type:'p', text}] */
export function linesToBlocks(lines) {
  const body = bodySize(lines);
  const out = [];
  let cur = null, prev = null;
  for (const l of lines) {
    const ratio = l.size / body;
    const head = ratio >= 1.25 && l.text.length < 200;
    const level = ratio >= 1.8 ? 1 : ratio >= 1.4 ? 2 : 3;
    const gap = prev ? prev.y - l.y : 0;
    const breakIt = !cur || !prev || Math.abs(l.size - prev.size) > prev.size * 0.12 || gap > prev.size * 1.75 || gap < 0 || BULLET.test(l.text) || l.cells.length > 1 || prev.cells.length > 1 || (cur.type === 'h') !== head;
    if (breakIt) {
      cur = head ? { type: 'h', level, text: l.text } : { type: 'p', text: l.text };
      out.push(cur);
    } else if (/[A-Za-z]-$/.test(cur.text) && /^[a-z]/.test(l.text)) cur.text = cur.text.slice(0, -1) + l.text;
    else cur.text += ' ' + l.text;
    prev = l;
  }
  return out;
}

/* lines -> rows of cells, using the left edges of cells to find columns */
export function linesToTable(lines) {
  if (!lines.length) return [];
  const body = bodySize(lines);
  const tol = body * 1.2;
  const xs = [];
  for (const l of lines) for (const c of l.cells) xs.push(c.x);
  xs.sort((a, b) => a - b);
  const anchors = [];
  for (const x of xs) { if (!anchors.length || x - anchors[anchors.length - 1].last > tol) anchors.push({ x, last: x, n: 1 }); else { anchors[anchors.length - 1].last = x; anchors[anchors.length - 1].n++; } }
  const cols = anchors.map((a) => a.x);
  const rows = [];
  for (const l of lines) {
    const row = new Array(cols.length).fill('');
    for (const c of l.cells) {
      let k = 0;
      for (let i = 0; i < cols.length; i++) if (cols[i] <= c.x + tol * 0.5) k = i;
      row[k] = row[k] ? row[k] + ' ' + c.text : c.text;
    }
    rows.push(row);
  }
  let last = 0;
  for (const r of rows) for (let i = r.length - 1; i >= 0; i--) if (r[i]) { last = Math.max(last, i); break; }
  return rows.map((r) => r.slice(0, last + 1));
}

/* ------------------------------------------------------------------ writers: txt, html, csv */
export function makeText(pages, pageBreaks) {
  const parts = pages.map((p, i) => {
    const t = [];
    let prev = null;
    for (const l of p.lines) {
      if (prev && prev.y - l.y > prev.size * 1.75) t.push('');
      t.push(l.text);
      prev = l;
    }
    return (pageBreaks && pages.length > 1 ? '----- Page ' + (i + 1) + ' -----\n\n' : '') + t.join('\n');
  });
  return parts.join('\n\n') + '\n';
}

export function makeHtml(pages, title, pageBreaks) {
  const esc = (s) => xmlEsc(s);
  let body = '';
  pages.forEach((p, i) => {
    body += '<section class="page" id="page-' + (i + 1) + '">\n';
    if (pageBreaks && pages.length > 1) body += '<p class="pno">Page ' + (i + 1) + '</p>\n';
    for (const b of p.blocks) {
      if (b.type === 'h') body += '<h' + (b.level + 1) + '>' + esc(b.text) + '</h' + (b.level + 1) + '>\n';
      else body += '<p>' + esc(b.text) + '</p>\n';
    }
    body += '</section>\n';
  });
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + esc(title) + '</title>\n<style>\nbody{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.55;color:#1d1d1f;background:#f4f4f5;margin:0;padding:24px 16px}\n.page{max-width:820px;margin:0 auto 24px;background:#fff;padding:40px 48px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.12)}\n.pno{color:#888;font-size:.8rem;margin:0 0 12px}\nh2,h3,h4{line-height:1.25}\n@media (max-width:600px){.page{padding:24px 18px}}\n@media print{body{background:#fff;padding:0}.page{box-shadow:none;margin:0;page-break-after:always}}\n</style>\n</head>\n<body>\n' + body + '</body>\n</html>\n';
}

export function makeCsv(rows) {
  const q = (c) => { const s = c == null ? '' : String(c); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '\ufeff' + rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ writer: Word .docx */
const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
function coreProps(title) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return XMLH + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xmlEsc(title) + '</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>';
}
/* pages: [{blocks:[{type:'h'|'p', level, text}]}] */
export function makeDocx(pages, o) {
  o = o || {};
  const tw = (pt) => Math.round(pt * 20);
  const W = o.pageW || 595.28, H = o.pageH || 841.89;
  const run = (t) => {
    const parts = String(t).split('\n');
    return parts.map((p, i) => (i ? '<w:r><w:br/></w:r>' : '') + '<w:r><w:t xml:space="preserve">' + xmlEsc(p) + '</w:t></w:r>').join('');
  };
  let body = '';
  pages.forEach((p, i) => {
    if (i > 0 && o.pageBreaks) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    for (const b of p.blocks) {
      if (b.type === 'h') body += '<w:p><w:pPr><w:pStyle w:val="Heading' + Math.min(3, b.level) + '"/></w:pPr>' + run(b.text) + '</w:p>';
      else body += '<w:p>' + run(b.text) + '</w:p>';
    }
    if (!p.blocks.length) body += '<w:p/>';
  });
  body += '<w:sectPr><w:pgSz w:w="' + tw(W) + '" w:h="' + tw(H) + '"' + (W > H ? ' w:orient="landscape"' : '') + '/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';
  const doc = XMLH + '<w:document xmlns:w="' + NS_W + '" xmlns:r="' + NS_R + '"><w:body>' + body + '</w:body></w:document>';
  const hs = (id, name, size, before) => '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="' + before + '" w:after="120"/><w:outlineLvl w:val="' + (+id.slice(-1) - 1) + '"/></w:pPr><w:rPr><w:b/><w:sz w:val="' + size + '"/></w:rPr></w:style>';
  const styles = XMLH + '<w:styles xmlns:w="' + NS_W + '"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    hs('Heading1', 'heading 1', 36, 360) + hs('Heading2', 'heading 2', 30, 280) + hs('Heading3', 'heading 3', 26, 240) + '</w:styles>';
  return zipParts([
    ['[Content_Types].xml', XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', XMLH + '<Relationships xmlns="' + NS_PR + '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
    ['word/_rels/document.xml.rels', XMLH + '<Relationships xmlns="' + NS_PR + '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['word/document.xml', doc],
    ['word/styles.xml', styles],
    ['docProps/core.xml', coreProps(o.title || 'Document')]
  ]);
}

/* ------------------------------------------------------------------ writer: Excel .xlsx */
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
const NUMERIC = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
export function cellNumber(s) {
  s = String(s).trim();
  if (!NUMERIC.test(s) || /^[-+]?0\d/.test(s) || s.replace(/[^\d]/g, '').length > 15) return null;
  const n = Number(s.replace(/,/g, ''));
  return isFinite(n) ? n : null;
}
function sheetName(n, used) {
  let s = String(n || 'Sheet').replace(/[\[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Sheet';
  let k = 1, base = s;
  while (used.has(s.toLowerCase())) { k++; s = base.slice(0, 28) + ' ' + k; }
  used.add(s.toLowerCase());
  return s;
}
/* sheets: [{name, rows:[[string]]}] */
export function makeXlsx(sheets) {
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const used = new Set();
  const parts = [];
  if (!sheets.length) sheets = [{ name: 'Sheet1', rows: [] }];
  const names = sheets.map((s) => sheetName(s.name, used));
  sheets.forEach((s, si) => {
    const widths = [];
    let rowsX = '';
    s.rows.forEach((r, ri) => {
      let cells = '';
      r.forEach((c, ci) => {
        if (c == null || c === '') return;
        const ref = colName(ci) + (ri + 1);
        const n = cellNumber(c);
        const str = String(c).slice(0, 32767);
        widths[ci] = Math.max(widths[ci] || 0, Math.min(60, str.length));
        if (n != null) cells += '<c r="' + ref + '"><v>' + n + '</v></c>';
        else cells += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(str) + '</t></is></c>';
      });
      rowsX += '<row r="' + (ri + 1) + '">' + cells + '</row>';
    });
    let cols = '';
    for (let i = 0; i < widths.length; i++) if (widths[i]) cols += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.max(8, widths[i] + 2) + '" customWidth="1"/>';
    parts.push(['xl/worksheets/sheet' + (si + 1) + '.xml', XMLH + '<worksheet xmlns="' + NS + '" xmlns:r="' + NS_R + '">' + (cols ? '<cols>' + cols + '</cols>' : '') + '<sheetData>' + rowsX + '</sheetData></worksheet>']);
  });
  const wb = XMLH + '<workbook xmlns="' + NS + '" xmlns:r="' + NS_R + '"><sheets>' + names.map((n, i) => '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>';
  const wbRels = XMLH + '<Relationships xmlns="' + NS_PR + '">' + names.map((n, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const styles = XMLH + '<styleSheet xmlns="' + NS + '"><fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const ct = XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + names.map((n, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>';
  return zipParts([
    ['[Content_Types].xml', ct],
    ['_rels/.rels', XMLH + '<Relationships xmlns="' + NS_PR + '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', wb],
    ['xl/_rels/workbook.xml.rels', wbRels],
    ['xl/styles.xml', styles]
  ].concat(parts));
}

/* ------------------------------------------------------------------ writer: PowerPoint .pptx (one picture per slide) */
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const PNS = 'xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '"';
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
function themeXml() {
  const clr = (n, v) => '<a:' + n + '><a:srgbClr val="' + v + '"/></a:' + n + '>';
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const ln = (w) => '<a:ln w="' + w + '" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>';
  const eff = '<a:effectStyle><a:effectLst/></a:effectStyle>';
  return XMLH + '<a:theme xmlns:a="' + NS_A + '" name="Office Theme"><a:themeElements><a:clrScheme name="Office">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    clr('dk2', '44546A') + clr('lt2', 'E7E6E6') + clr('accent1', '4472C4') + clr('accent2', 'ED7D31') + clr('accent3', 'A5A5A5') + clr('accent4', 'FFC000') + clr('accent5', '5B9BD5') + clr('accent6', '70AD47') + clr('hlink', '0563C1') + clr('folHlink', '954F72') +
    '</a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="Office"><a:fillStyleLst>' + fill + fill + fill + '</a:fillStyleLst><a:lnStyleLst>' + ln(6350) + ln(12700) + ln(19050) + '</a:lnStyleLst><a:effectStyleLst>' + eff + eff + eff + '</a:effectStyleLst><a:bgFillStyleLst>' + fill + fill + fill + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
}
/* slides: [{bytes, type:'jpeg'|'png', w, h}] where w and h are the page size (any unit, only the shape counts) */
export function makePptx(slides, o) {
  o = o || {};
  const first = slides[0] || { w: 16, h: 9 };
  let cx = 12192000, cy = Math.round((cx * first.h) / first.w);
  if (cy > 51206400) { cy = 51206400; cx = Math.round((cy * first.w) / first.h); }
  if (cy < 914400) cy = 914400;
  cx = Math.max(914400, Math.min(51206400, cx));
  const parts = [];
  const ctSlides = [];
  let pres = '<p:sldIdLst>';
  let presRels = '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>';
  slides.forEach((s, i) => {
    const n = i + 1;
    const ext = s.type === 'png' ? 'png' : 'jpeg';
    const k = Math.min(cx / s.w, cy / s.h);
    const w = Math.round(s.w * k), h = Math.round(s.h * k);
    const x = Math.round((cx - w) / 2), y = Math.round((cy - h) / 2);
    parts.push(['ppt/slides/slide' + n + '.xml', XMLH + '<p:sld ' + PNS + '><p:cSld><p:spTree>' + GRP +
      '<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ' + n + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + w + '" cy="' + h + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>' +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>']);
    parts.push(['ppt/slides/_rels/slide' + n + '.xml.rels', XMLH + '<Relationships xmlns="' + NS_PR + '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image' + n + '.' + ext + '"/></Relationships>']);
    parts.push(['ppt/media/image' + n + '.' + ext, s.bytes]);
    ctSlides.push('<Override PartName="/ppt/slides/slide' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>');
    pres += '<p:sldId id="' + (255 + n) + '" r:id="rId' + (n + 1) + '"/>';
    presRels += '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + n + '.xml"/>';
  });
  pres += '</p:sldIdLst>';
  const m = slides.length + 2;
  presRels += '<Relationship Id="rId' + m + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>' +
    '<Relationship Id="rId' + (m + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>' +
    '<Relationship Id="rId' + (m + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
    '<Relationship Id="rId' + (m + 3) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>';
  const presentation = XMLH + '<p:presentation ' + PNS + ' saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' + pres + '<p:sldSz cx="' + cx + '" cy="' + cy + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  const master = XMLH + '<p:sldMaster ' + PNS + '><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>' + GRP + '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>';
  const layout = XMLH + '<p:sldLayout ' + PNS + ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>' + GRP + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  const ct = XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>' +
    '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>' +
    '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' + ctSlides.join('') + '</Types>';
  return zipParts([
    ['[Content_Types].xml', ct],
    ['_rels/.rels', XMLH + '<Relationships xmlns="' + NS_PR + '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
    ['ppt/presentation.xml', presentation],
    ['ppt/_rels/presentation.xml.rels', XMLH + '<Relationships xmlns="' + NS_PR + '">' + presRels + '</Relationships>'],
    ['ppt/slideMasters/slideMaster1.xml', master],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', XMLH + '<Relationships xmlns="' + NS_PR + '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>'],
    ['ppt/slideLayouts/slideLayout1.xml', layout],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', XMLH + '<Relationships xmlns="' + NS_PR + '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>'],
    ['ppt/theme/theme1.xml', themeXml()],
    ['ppt/presProps.xml', XMLH + '<p:presentationPr ' + PNS + '/>'],
    ['ppt/viewProps.xml', XMLH + '<p:viewPr ' + PNS + '><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>'],
    ['ppt/tableStyles.xml', XMLH + '<a:tblStyleLst xmlns:a="' + NS_A + '" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>'],
    ['docProps/core.xml', coreProps(o.title || 'Presentation')]
  ].concat(parts));
}

/* ------------------------------------------------------------------ shrinking images inside a PDF (pdf-lib document) */
/* reencode(bytes, info) -> Promise<{bytes, w, h} | null>. info: {kind:'jpeg'|'raw', w, h, comps, raw?}
   Only JPEG images and plain 8-bit RGB or gray Flate images are touched. Text and vector drawing stay as they are. */
export async function shrinkImages(pdfDoc, reencode, onProgress) {
  const { PDFName, PDFRawStream, PDFNumber, PDFArray } = lib('PDFLib');
  const N = (s) => PDFName.of(s);
  const ctx = pdfDoc.context;
  const list = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(N('Subtype')) !== N('Image')) continue;
    if (obj.contents.length < 40000) continue;
    list.push([ref, obj]);
  }
  let saved = 0, done = 0;
  for (const [ref, obj] of list) {
    done++;
    if (onProgress) onProgress(done, list.length);
    const d = obj.dict;
    let filter = d.get(N('Filter'));
    if (filter instanceof PDFArray) filter = filter.size() === 1 ? filter.get(0) : null;
    if (d.get(N('ImageMask'))) continue;
    const bpc = d.get(N('BitsPerComponent'));
    if (bpc && bpc.asNumber && bpc.asNumber() !== 8) continue;
    const w = d.get(N('Width')), h = d.get(N('Height'));
    if (!w || !h) continue;
    let cs = d.get(N('ColorSpace'));
    if (cs && !(cs instanceof PDFName)) cs = ctx.lookup(cs);
    let comps = 0;
    if (cs === N('DeviceRGB')) comps = 3;
    else if (cs === N('DeviceGray')) comps = 1;
    else if (cs instanceof PDFArray && cs.get(0) === N('ICCBased')) { const icc = ctx.lookup(cs.get(1)); const n = icc && icc.dict && icc.dict.get(N('N')); comps = n && n.asNumber ? n.asNumber() : 0; }
    if (comps !== 1 && comps !== 3) continue;
    if (d.get(N('Decode'))) continue;
    let info;
    if (filter === N('DCTDecode')) info = { kind: 'jpeg', w: w.asNumber(), h: h.asNumber(), comps };
    else if (filter === N('FlateDecode') && !d.get(N('DecodeParms'))) {
      let raw;
      try { raw = lib('fflate').unzlibSync(obj.contents); } catch (e) { continue; }
      if (raw.length < w.asNumber() * h.asNumber() * comps) continue;
      info = { kind: 'raw', w: w.asNumber(), h: h.asNumber(), comps, raw };
    } else continue;
    let res = null;
    try { res = await reencode(obj.contents, info); } catch (e) { res = null; }
    if (!res || res.bytes.length >= obj.contents.length * 0.9) continue;
    const nd = d.clone(ctx);
    nd.set(N('Width'), PDFNumber.of(res.w));
    nd.set(N('Height'), PDFNumber.of(res.h));
    nd.set(N('Filter'), N('DCTDecode'));
    nd.set(N('ColorSpace'), N(res.gray ? 'DeviceGray' : 'DeviceRGB'));
    nd.set(N('BitsPerComponent'), PDFNumber.of(8));
    nd.set(N('Length'), PDFNumber.of(res.bytes.length));
    nd.delete(N('DecodeParms'));
    ctx.assign(ref, PDFRawStream.of(nd, res.bytes));
    saved += obj.contents.length - res.bytes.length;
  }
  return { saved, images: list.length };
}
