/* pdfconv.js: the PDF converter page. To PDF, From PDF and Edit PDF.
   Everything runs in the browser. Files are never uploaded. */
import { $, fmtSize, plural, tick, el, setStatus, wireDrop, needPdfLib, openPdf, createThumbs, parseRanges, parseGroups, enableReorder, moveItem, renderResults, iconButton, icon, baseName } from '/tools/pdfcommon.js';
import * as C from '/tools/pdfconv-core.js';

const statusEl = $('pc-status');
const prog = $('pc-prog'), pb = $('pc-pb'), resultBox = $('pc-result');
let mode = 'to';
let busy = false;
let uid = 0;

/* ------------------------------------------------------------------ small helpers */
const scriptP = {};
function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve();
  if (!scriptP[src]) {
    scriptP[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => (window[globalName] ? res() : rej(new Error('A converter part did not start. Reload the page and try again.')));
      s.onerror = () => { delete scriptP[src]; rej(new Error('A converter part could not be loaded. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  return scriptP[src];
}
let fontBytesP = null;
function fontBytes() {
  if (!fontBytesP) {
    fontBytesP = Promise.all(['/tools/vendor/fonts/NotoSans-400Regular.subset.ttf', '/tools/vendor/fonts/NotoSans-700Bold.subset.ttf'].map(async (u) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error('The font could not be loaded. Check your connection and try again.');
      return new Uint8Array(await r.arrayBuffer());
    })).catch((e) => { fontBytesP = null; throw e; });
  }
  return fontBytesP;
}
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The browser could not make the picture. Try a lower resolution.'))), type, q));
const u8 = async (blob) => new Uint8Array(await blob.arrayBuffer());
const extOf = (name) => ((/\.([a-z0-9]+)$/i.exec(name || '') || [])[1] || '').toLowerCase();
function progress(f) { prog.hidden = false; pb.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; }
function clearResult() { resultBox.hidden = true; resultBox.textContent = ''; }
function setBusy(b) {
  busy = b;
  ['pc-to-go', 'pc-from-go', 'pc-edit-go'].forEach((id) => { $(id).disabled = b || !ready(id); });
  if (!b) prog.hidden = true;
}
function ready(id) {
  if (id === 'pc-to-go') return TO.length > 0;
  if (id === 'pc-from-go') return FROM.length > 0;
  return ED.pages.length > 0;
}
function showResults(outputs, zipName, note) {
  renderResults(resultBox, outputs, zipName);
  if (note) resultBox.append(el('p', { class: 'help', text: note }));
  resultBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ------------------------------------------------------------------ images in the browser */
let heicP = null;
function heicLib() {
  if (!heicP) heicP = loadScript('/tools/vendor/heic-to/heic-to.js', 'HeicTo').catch((e) => { heicP = null; throw e; });
  return heicP;
}
async function bitmapOf(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch (e) { return await createImageBitmap(blob); }
}
function loadImgEl(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('decode')); im.src = url; });
}
/* draw any picture onto a canvas no larger than max px on its long side */
function canvasOf(src, w, h, max, white) {
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  const x = c.getContext('2d');
  if (white) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
async function svgToPng(blob, max) {
  const text = await blob.text();
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const im = await loadImgEl(url);
    let w = im.naturalWidth, h = im.naturalHeight;
    if (!w || !h) {
      const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
      w = vb ? +vb[1] : 800; h = vb ? +vb[2] : 600;
    }
    const k = Math.max(1, Math.min(4, max / Math.max(w, h)));
    const c = canvasOf(im, w * k, h * k, max, false);
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(im, 0, 0, c.width, c.height);
    return { blob: await toBlob(c, 'image/png'), w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}
const MIME = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon' };
/* pictures found inside documents: return {kind, bytes} pdf-lib can embed, or null */
async function docImage(bytes, ext) {
  const k = C.sniffImage(bytes);
  if (k) return { kind: k, bytes };
  if (ext === 'emf' || ext === 'wmf') return null;
  try {
    if (ext === 'svg' || (bytes[0] === 0x3c)) { const r = await svgToPng(new Blob([bytes]), 1600); return { kind: 'png', bytes: await u8(r.blob) }; }
    const bm = await createImageBitmap(new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' }));
    const c = canvasOf(bm, bm.width, bm.height, 2400, false);
    if (bm.close) bm.close();
    return { kind: 'png', bytes: await u8(await toBlob(c, 'image/png')) };
  } catch (e) { return null; }
}
function embedder(pdf) {
  const cache = new Map();
  return async (blk) => {
    if (cache.has(blk.bytes)) return cache.get(blk.bytes);
    let img = null;
    const d = await docImage(blk.bytes, blk.ext);
    if (d) {
      try { img = d.kind === 'jpeg' ? await pdf.embedJpg(d.bytes) : await pdf.embedPng(d.bytes); }
      catch (e) {
        try {
          const bm = await createImageBitmap(new Blob([d.bytes]));
          const c = canvasOf(bm, bm.width, bm.height, 2400, false);
          img = await pdf.embedPng(await u8(await toBlob(c, 'image/png')));
        } catch (e2) { img = null; }
      }
    }
    cache.set(blk.bytes, img);
    return img;
  };
}

/* EXIF orientation of a JPEG (1 to 8) */
function exifOrientation(b) {
  try {
    if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
    let p = 2;
    while (p + 4 < b.length) {
      if (b[p] !== 0xff) return 1;
      const mk = b[p + 1], len = (b[p + 2] << 8) | b[p + 3];
      if (mk === 0xe1 && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) {
        const t = p + 10, le = b[t] === 0x49;
        const r16 = (o) => (le ? b[t + o] | (b[t + o + 1] << 8) : (b[t + o] << 8) | b[t + o + 1]);
        const r32 = (o) => (le ? (b[t + o] | (b[t + o + 1] << 8) | (b[t + o + 2] << 16) | (b[t + o + 3] << 24)) >>> 0 : ((b[t + o] << 24) | (b[t + o + 1] << 16) | (b[t + o + 2] << 8) | b[t + o + 3]) >>> 0);
        const ifd = r32(4), n = r16(ifd);
        for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (r16(e) === 0x0112) return r16(e + 8) || 1; }
        return 1;
      }
      if (mk === 0xda) return 1;
      p += 2 + len;
    }
  } catch (e) { /* ignore */ }
  return 1;
}
function jpegComps(b) {
  let p = 2;
  while (p + 9 < b.length) {
    if (b[p] !== 0xff) return 0;
    const mk = b[p + 1];
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return b[p + 9];
    p += 2 + ((b[p + 2] << 8) | b[p + 3]);
  }
  return 0;
}

/* ------------------------------------------------------------------ PDF rendering */
async function renderPage(page, scale, rotation) {
  let vp = page.getViewport({ scale, rotation });
  const maxPx = 16000000;
  if (vp.width * vp.height > maxPx) { const k = Math.sqrt(maxPx / (vp.width * vp.height)); vp = page.getViewport({ scale: scale * k, rotation }); }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: x, viewport: vp }).promise;
  return c;
}
const freeCanvas = (c) => { c.width = c.height = 0; };

/* ------------------------------------------------------------------ mode switch and drop zone */
const DROP = {
  to: ['Drop files here to turn them into a PDF', 'Images (JPG, PNG, WebP, GIF, HEIC, BMP, SVG), Word .docx, Excel .xlsx, CSV, PowerPoint .pptx, text, Markdown, HTML and PDF files. Add as many as you like.', 'image/*,.heic,.heif,.svg,.pdf,.docx,.xlsx,.xlsm,.csv,.tsv,.pptx,.txt,.text,.log,.md,.markdown,.html,.htm,.xhtml,.json,.xml'],
  from: ['Drop a PDF here to convert it', 'One or more PDF files. Each one is converted to the format you choose below.', 'application/pdf,.pdf'],
  edit: ['Drop PDFs here to edit them', 'Add one PDF to rotate, delete, reorder, split or compress its pages. Add several to merge them.', 'application/pdf,.pdf']
};
function setMode(m) {
  mode = m;
  for (const b of $('pc-tabs').querySelectorAll('button')) { const on = b.dataset.mode === m; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; }
  ['to', 'from', 'edit'].forEach((k) => { $('pc-' + k).hidden = k !== m; });
  $('pc-drop-title').textContent = DROP[m][0];
  $('pc-drop-help').textContent = DROP[m][1];
  $('pc-file').accept = DROP[m][2];
  $('pc-tool').dataset.mode = m;
  clearResult();
  setStatus(statusEl, '');
  try { history.replaceState(null, '', '#' + (m === 'to' ? 'to-pdf' : m === 'from' ? 'from-pdf' : 'edit-pdf')); } catch (e) { /* ignore */ }
}
$('pc-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (b && !busy) setMode(b.dataset.mode); });
$('pc-tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const order = ['to', 'from', 'edit'];
  const i = (order.indexOf(mode) + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
  if (!busy) { setMode(order[i]); $('pc-tabs').querySelector('[data-mode="' + order[i] + '"]').focus(); }
});

async function isPdfFile(f) {
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') return true;
  const h = new Uint8Array(await f.slice(0, 1024).arrayBuffer());
  for (let i = 0; i + 4 < h.length; i++) if (h[i] === 37 && h[i + 1] === 80 && h[i + 2] === 68 && h[i + 3] === 70) return true;
  return false;
}
async function onFiles(files) {
  if (busy) return;
  clearResult();
  if (mode === 'to') return addTo(files);
  const pdfs = [], other = [];
  for (const f of files) (await isPdfFile(f) ? pdfs : other).push(f);
  if (!pdfs.length && other.length) {
    setMode('to');
    await addTo(other);
    setStatus(statusEl, (statusEl.textContent ? statusEl.textContent + ' ' : '') + 'Those were not PDF files, so they were added to To PDF.');
    return;
  }
  if (mode === 'from') await addFrom(pdfs); else await addEdit(pdfs);
  if (other.length) setStatus(statusEl, (statusEl.textContent ? statusEl.textContent + ' ' : '') + plural(other.length, 'file') + ' skipped because ' + (other.length === 1 ? 'it is' : 'they are') + ' not a PDF. Use To PDF to turn ' + (other.length === 1 ? 'it' : 'them') + ' into a PDF first.', true);
}
wireDrop($('pc-drop'), $('pc-file'), $('pc-pick'), onFiles);
$('pc-plus').addEventListener('click', () => $('pc-file').click());
['pc-to-add', 'pc-from-add', 'pc-edit-add'].forEach((id) => $(id).addEventListener('click', () => $('pc-file').click()));
document.addEventListener('paste', (e) => {
  const fs = [...((e.clipboardData && e.clipboardData.files) || [])];
  if (!fs.length || busy) return;
  if (mode !== 'to' && fs.every((f) => /^image\//.test(f.type))) setMode('to');
  onFiles(fs);
});

/* ------------------------------------------------------------------ TO PDF */
const TO = [];
const toList = $('pc-to-list');
const KIND_LABEL = { docx: 'Word document', xlsx: 'Excel workbook', csv: 'Spreadsheet (CSV)', pptx: 'PowerPoint slides', text: 'Text file', md: 'Markdown file', html: 'Web page (HTML)', pdf: 'PDF', image: 'Image' };

async function detect(f) {
  const head = new Uint8Array(await f.slice(0, 2048).arrayBuffer());
  const ext = extOf(f.name);
  const ascii = String.fromCharCode(...head.subarray(0, 512)).replace(/[^\x20-\x7e\n]/g, '');
  for (let i = 0; i + 4 < Math.min(head.length, 1024); i++) if (head[i] === 37 && head[i + 1] === 80 && head[i + 2] === 68 && head[i + 3] === 70) return 'pdf';
  if (head[0] === 0x50 && head[1] === 0x4b) {
    if (/^(docx|docm|dotx|dotm)$/.test(ext)) return 'docx';
    if (/^(xlsx|xlsm|xltx|xltm)$/.test(ext)) return 'xlsx';
    if (/^(pptx|pptm|ppsx|ppsm|potx)$/.test(ext)) return 'pptx';
    if (ascii.includes('word/')) return 'docx';
    if (ascii.includes('xl/')) return 'xlsx';
    if (ascii.includes('ppt/')) return 'pptx';
    return 'zip';
  }
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11) return 'old';
  if (/^(heic|heif)$/.test(ext) || (ascii.slice(4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)/.test(ascii.slice(8, 12)) && ext !== 'avif')) return 'heic';
  if (ext === 'svg' || /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(ascii)) return 'svg';
  if (C.sniffImage(head) || /^image\//.test(f.type) || /^(gif|webp|bmp|avif|ico|tif|tiff|jfif)$/.test(ext)) return 'image';
  if (/^(md|markdown|mdown|mkd)$/.test(ext)) return 'md';
  if (/^(html|htm|xhtml|mhtml)$/.test(ext) || /^\s*(<!doctype html|<html)/i.test(ascii)) return 'html';
  if (/^(csv|tsv)$/.test(ext)) return 'csv';
  if (/^text\//.test(f.type) || /^(txt|text|log|json|xml|ini|cfg|conf|yaml|yml|js|css|py|java|c|cpp|h|cs|php|rb|go|rs|sql|sh|bat|ts|srt|vtt|rtf)$/.test(ext)) return 'text';
  if (!head.subarray(0, 512).some((b) => b === 0)) return 'text';
  return 'unknown';
}

async function addTo(files) {
  const errors = [];
  for (let n = 0; n < files.length; n++) {
    const f = files[n];
    setStatus(statusEl, 'Reading ' + f.name + ' (' + (n + 1) + ' of ' + files.length + ')...');
    try {
      const kind = await detect(f);
      const it = { id: ++uid, file: f, kind, rot: 0, info: '' };
      if (kind === 'old') throw new Error('"' + f.name + '" is an old Office file (.doc, .xls or .ppt). Open it in Word, Excel or PowerPoint, save it as .docx, .xlsx or .pptx, and add that file.');
      if (kind === 'zip' || kind === 'unknown') throw new Error('"' + f.name + '" is not a file type this tool can turn into a PDF.');
      if (kind === 'image' || kind === 'heic' || kind === 'svg') await prepImage(it);
      else if (kind === 'pdf') {
        const { doc, buf, pages } = await openPdf(f);
        Object.assign(it, { doc, buf, pages, info: plural(pages, 'page') + ', ' + fmtSize(f.size) });
      } else await prepDoc(it);
      buildToItem(it);
      TO.push(it);
    } catch (err) {
      errors.push(err.message && err.message.startsWith('"') ? err.message : '"' + f.name + '" could not be read: ' + (err.message || 'unknown error') + '.');
    }
    await tick();
  }
  refreshTo();
  setStatus(statusEl, errors.join(' '), !!errors.length);
}

async function prepImage(it) {
  const f = it.file;
  let src = f, w, h, thumbSrc;
  if (it.kind === 'heic') {
    setStatus(statusEl, 'Loading the HEIC converter (only once)...');
    await heicLib();
    try { src = await window.HeicTo({ blob: f, type: 'image/jpeg', quality: 0.92 }); }
    catch (e) { throw new Error('"' + f.name + '" could not be converted. The HEIC file may be damaged.'); }
    it.imgKind = 'jpeg';
  } else if (it.kind === 'svg') {
    try { const r = await svgToPng(f, 2400); src = r.blob; } catch (e) { throw new Error('"' + f.name + '" is an SVG this browser cannot draw.'); }
    it.imgKind = 'png';
  } else {
    const head = new Uint8Array(await f.slice(0, 65536).arrayBuffer());
    it.imgKind = C.sniffImage(head) || 'other';
    it.orient = it.imgKind === 'jpeg' ? exifOrientation(head) : 1;
  }
  let bm;
  try { bm = await bitmapOf(src); }
  catch (e) { throw new Error('"' + f.name + '" could not be opened. It may be damaged or in a format this browser cannot show.'); }
  w = bm.width; h = bm.height;
  thumbSrc = canvasOf(bm, w, h, 220, true);
  if (bm.close) bm.close();
  it.src = src;
  it.w = w; it.h = h;
  it.baseRot = { 3: 180, 6: 90, 8: 270 }[it.orient] || 0;
  it.thumbSrc = thumbSrc;
  it.kind = 'image';
  it.info = w + ' x ' + h + ' px, ' + fmtSize(f.size);
}

async function prepDoc(it) {
  const f = it.file;
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (it.kind === 'docx') {
    if (!window.fflate) throw new Error('the ZIP reader did not load');
    it.parsed = C.readDocx(bytes);
    const paras = it.parsed.blocks.filter((b) => b.type === 'p').length;
    it.info = plural(paras, 'paragraph') + (it.parsed.imageCount ? ', ' + plural(it.parsed.imageCount, 'picture') : '') + ', ' + fmtSize(f.size);
  } else if (it.kind === 'xlsx') {
    it.parsed = C.readXlsx(bytes);
    if (!it.parsed.sheets.length) throw new Error('"' + f.name + '" has no visible sheets.');
    const rows = it.parsed.sheets.reduce((s, x) => s + x.rows.length, 0);
    it.info = plural(it.parsed.sheets.length, 'sheet') + ', ' + plural(rows, 'row') + ', ' + fmtSize(f.size);
  } else if (it.kind === 'pptx') {
    it.parsed = C.readPptx(bytes);
    if (!it.parsed.slides.length) throw new Error('"' + f.name + '" has no slides.');
    it.info = plural(it.parsed.slides.length, 'slide') + ', ' + fmtSize(f.size);
  } else {
    const text = C.decodeText(bytes);
    it.text = text;
    if (it.kind === 'csv') { it.rows = C.parseCsv(text); it.info = plural(it.rows.length, 'row') + ', ' + fmtSize(f.size); }
    else if (it.kind === 'html') { it.parsed = C.readHtml(text); it.info = fmtSize(f.size); }
    else it.info = plural(text.split('\n').length, 'line') + ', ' + fmtSize(f.size);
  }
  it.info = KIND_LABEL[it.kind] + ', ' + it.info;
}

function buildToItem(it) {
  const li = el('li', { class: 'pdf-item', 'data-item': '', draggable: 'true' });
  const grip = el('span', { class: 'pdf-grip', 'aria-hidden': 'true', title: 'Drag to reorder' });
  grip.innerHTML = icon('grip');
  const th = el('div', { class: 'pdf-thumb' });
  if (it.kind === 'image') {
    it.canvas = document.createElement('canvas');
    it.canvas.setAttribute('role', 'img');
    th.append(it.canvas);
    drawRot(it);
  } else if (it.kind === 'pdf') {
    const c = el('canvas', { 'data-page': '1', role: 'img', 'aria-label': 'First page of ' + it.file.name });
    th.append(c);
    it.thumbs = createThumbs(it.doc, {
      maxSide: 110,
      onRender(cv) {
        const k = Math.min(62 / parseFloat(cv.style.width), 78 / parseFloat(cv.style.height), 1);
        cv.style.width = Math.round(parseFloat(cv.style.width) * k) + 'px';
        cv.style.height = Math.round(parseFloat(cv.style.height) * k) + 'px';
        cv.style.transform = it.rot ? 'rotate(' + it.rot + 'deg)' : '';
      }
    });
    it.thumbs.observe(c);
    it.canvas = c;
  } else {
    th.append(el('span', { class: 'pc-badge pc-b-' + it.kind, text: (extOf(it.file.name) || it.kind).toUpperCase().slice(0, 5) }));
  }
  const meta = el('div', { class: 'pdf-meta' }, el('b', { text: it.file.name }));
  it.numEl = el('small');
  meta.append(it.numEl, el('small', { text: it.info }));
  const acts = el('div', { class: 'pdf-acts' });
  it.upBtn = iconButton('up', 'Move up', () => moveTo(it, -1));
  it.downBtn = iconButton('down', 'Move down', () => moveTo(it, 1));
  acts.append(it.upBtn, it.downBtn);
  if (it.kind === 'image' || it.kind === 'pdf') acts.append(iconButton('rot', 'Rotate 90 degrees', () => { it.rot = (it.rot + 90) % 360; drawRot(it); clearResult(); }));
  acts.append(iconButton('trash', 'Remove ' + it.file.name, () => { TO.splice(TO.indexOf(it), 1); it.li.remove(); dropItem(it); refreshTo(); clearResult(); }, 'del'));
  li.append(grip, th, meta, acts);
  it.li = li;
}
function dropItem(it) {
  if (it.thumbs) it.thumbs.destroy();
  if (it.doc) it.doc.destroy();
}
function drawRot(it) {
  if (it.kind === 'pdf') { it.canvas.style.transform = it.rot ? 'rotate(' + it.rot + 'deg)' : ''; return; }
  const s = it.thumbSrc, c = it.canvas;
  const turned = it.rot % 180 !== 0;
  const w = turned ? s.height : s.width, h = turned ? s.width : s.height;
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.save(); x.translate(w / 2, h / 2); x.rotate((it.rot * Math.PI) / 180); x.drawImage(s, -s.width / 2, -s.height / 2); x.restore();
  const k = Math.min(62 / w, 78 / h);
  c.style.width = Math.round(w * k) + 'px';
  c.style.height = Math.round(h * k) + 'px';
  c.setAttribute('aria-label', 'Preview of ' + it.file.name + (it.rot ? ', rotated ' + it.rot + ' degrees' : ''));
}
function moveTo(it, d) {
  const i = TO.indexOf(it), j = i + d;
  if (j < 0 || j >= TO.length) return;
  moveItem(TO, i, j);
  refreshTo();
  clearResult();
  const btn = d < 0 ? it.upBtn : it.downBtn;
  (btn.disabled ? (d < 0 ? it.downBtn : it.upBtn) : btn).focus();
}
function refreshTo() {
  toList.append(...TO.map((it) => it.li));
  TO.forEach((it, i) => {
    it.numEl.textContent = TO.length > 1 ? 'Number ' + (i + 1) + ' in the PDF' : '';
    it.upBtn.disabled = i === 0;
    it.downBtn.disabled = i === TO.length - 1;
  });
  $('pc-to-work').hidden = !TO.length;
  const cnt = $('pc-to-count');
  cnt.textContent = '';
  if (TO.length) cnt.append(el('b', { text: plural(TO.length, 'file') }), ' added, ' + fmtSize(TO.reduce((s, it) => s + it.file.size, 0)) + '. Drag to reorder or use the arrows.');
  const kinds = new Set(TO.map((t) => t.kind));
  $('pc-o-img').hidden = !kinds.has('image');
  $('pc-o-doc').hidden = ![...kinds].some((k) => /^(docx|xlsx|csv|text|md|html)$/.test(k));
  $('pc-o-combine').hidden = TO.length < 2;
  $('pc-to-go').disabled = !TO.length || busy;
  $('pc-orient').disabled = $('pc-size').value === 'fit';
}
enableReorder(toList, (from, to) => { moveItem(TO, from, to); refreshTo(); clearResult(); });
$('pc-to-clear').addEventListener('click', () => { TO.splice(0).forEach(dropItem); toList.textContent = ''; refreshTo(); clearResult(); setStatus(statusEl, ''); });
['pc-size', 'pc-orient', 'pc-margin', 'pc-quality', 'pc-tsize', 'pc-combine'].forEach((id) => $(id).addEventListener('change', () => { clearResult(); refreshTo(); }));

const QUALITY = { original: null, high: { q: 0.9, max: 3000 }, medium: { q: 0.75, max: 2000 }, small: { q: 0.55, max: 1400 } };
const IMG_MARGIN = { none: 0, small: 24, big: 56 };
const DOC_MARGIN = { none: 28, small: 54, big: 72 };

async function reencodeImage(blob, spec) {
  const bm = await bitmapOf(blob);
  const c = canvasOf(bm, bm.width, bm.height, spec ? spec.max : 100000, true);
  if (bm.close) bm.close();
  const out = await toBlob(c, 'image/jpeg', spec ? spec.q : 0.92);
  freeCanvas(c);
  return u8(out);
}

const docCtx = new WeakMap();
async function fontsFor(pdf) {
  if (docCtx.has(pdf)) return docCtx.get(pdf);
  await loadScript('/tools/vendor/fontkit/fontkit.umd.min.js', 'fontkit');
  const [r, b] = await fontBytes();
  const F = await C.embedFonts(pdf, r, b);
  docCtx.set(pdf, F);
  return F;
}

function docPage(opts, landscapeHint, fitSize) {
  let [w, h] = opts.size === 'fit' && fitSize ? fitSize : C.PAGE_SIZES[opts.size === 'letter' ? 'letter' : 'a4'];
  const land = opts.orient === 'landscape' || (opts.orient === 'auto' && landscapeHint);
  if (opts.size !== 'fit' || !fitSize) { const a = Math.min(w, h), b = Math.max(w, h); w = land ? b : a; h = land ? a : b; }
  return [w, h];
}

async function addToPdf(pdf, it, opts, stats) {
  const { degrees, PDFDocument } = needPdfLib();
  if (it.kind === 'image') {
    let img = null, base = 0;
    const spec = QUALITY[opts.quality];
    if (!spec && (it.imgKind === 'jpeg' || it.imgKind === 'png') && !(it.imgKind === 'jpeg' && it.orient > 1 && !it.baseRot)) {
      try {
        const bytes = await u8(it.src);
        img = it.imgKind === 'jpeg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
        base = it.baseRot || 0;
      } catch (e) { img = null; }
    }
    if (!img) { img = await pdf.embedJpg(await reencodeImage(it.src, spec)); base = 0; }
    C.addImagePage(pdf, img, base + it.rot, { size: opts.size, orient: opts.orient, margin: IMG_MARGIN[opts.margin] });
    return;
  }
  if (it.kind === 'pdf') {
    let src = null;
    try { src = await PDFDocument.load(it.buf, { updateMetadata: false }); } catch (e) { src = null; }
    if (src) {
      const pages = await pdf.copyPages(src, src.getPageIndices());
      for (const p of pages) {
        if (it.rot) p.setRotation(degrees((p.getRotation().angle + it.rot) % 360));
        pdf.addPage(p);
      }
      return;
    }
    /* protected or unusual file: put each page in as a picture */
    stats.flattened.push(it.file.name);
    for (let i = 1; i <= it.pages; i++) {
      const page = await it.doc.getPage(i);
      const rot = (page.rotate + it.rot) % 360;
      const c = await renderPage(page, 150 / 72, rot);
      const img = await pdf.embedJpg(await u8(await toBlob(c, 'image/jpeg', 0.85)));
      const vp = page.getViewport({ scale: 1, rotation: rot });
      pdf.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
      freeCanvas(c);
      page.cleanup();
      await tick();
    }
    return;
  }
  const F = await fontsFor(pdf);
  const embed = embedder(pdf);
  if (it.kind === 'pptx') {
    const r = await C.renderSlides(pdf, it.parsed, { F, embed });
    stats.skipped += r.skipped;
    return;
  }
  const base = { small: 9.5, normal: 11, large: 13 }[opts.tsize] || 11;
  let blocks, hint = false, fit = null, margin = DOC_MARGIN[opts.margin];
  if (it.kind === 'docx') {
    blocks = it.parsed.blocks;
    if (it.parsed.pageW) fit = [it.parsed.pageW, it.parsed.pageH];
    if (opts.size === 'fit' && it.parsed.margin) margin = Math.max(24, Math.min(90, it.parsed.margin));
    stats.skipped += it.parsed.skippedImages;
    hint = fit && fit[0] > fit[1];
  } else if (it.kind === 'xlsx') {
    blocks = [];
    const many = it.parsed.sheets.length > 1;
    it.parsed.sheets.forEach((s, i) => {
      if (i) blocks.push({ type: 'pagebreak' });
      if (many) blocks.push({ type: 'p', style: 'h2', runs: [{ text: s.name }] });
      if (s.rows.length) blocks.push({ type: 'table', rows: s.rows, header: true });
      else blocks.push({ type: 'p', style: 'p', runs: [{ text: '(empty sheet)' }] });
    });
    hint = it.parsed.sheets.some((s) => (s.rows[0] || []).length > 6);
    if (it.parsed.truncated) stats.notes.push('"' + it.file.name + '" has more than ' + C.MAX_ROWS.toLocaleString() + ' rows in a sheet, so only the first ' + C.MAX_ROWS.toLocaleString() + ' were included.');
  } else if (it.kind === 'csv') {
    blocks = [{ type: 'table', rows: it.rows.slice(0, C.MAX_ROWS), header: true }];
    hint = (it.rows[0] || []).length > 6;
    if (it.rows.length > C.MAX_ROWS) stats.notes.push('"' + it.file.name + '" has more than ' + C.MAX_ROWS.toLocaleString() + ' rows, so only the first ' + C.MAX_ROWS.toLocaleString() + ' were included.');
  } else if (it.kind === 'md') blocks = C.parseMarkdown(it.text);
  else if (it.kind === 'html') { blocks = it.parsed.blocks; stats.skipped += it.parsed.skippedImages; }
  else blocks = C.readPlainText(it.text);
  const [W, H] = docPage(opts, hint, fit);
  const res = await C.renderBlocks(pdf, blocks, { F, W, H, m: margin, base, scale: base / 11, embed });
  stats.skipped += res.skipped;
}

async function buildTo() {
  if (busy || !TO.length) return;
  setBusy(true);
  clearResult();
  progress(0);
  const opts = { size: $('pc-size').value, orient: $('pc-orient').value, margin: $('pc-margin').value, quality: $('pc-quality').value, tsize: $('pc-tsize').value };
  const combine = TO.length < 2 || $('pc-combine').checked;
  const stats = { skipped: 0, notes: [], flattened: [] };
  const outputs = [];
  try {
    const { PDFDocument } = needPdfLib();
    const made = [];
    const fresh = async () => { const d = await PDFDocument.create(); d.setProducer('Free PDF converter'); d.setCreator('Free PDF converter'); made.push(d); return d; };
    let pdf = combine ? await fresh() : null;
    for (let i = 0; i < TO.length; i++) {
      const it = TO[i];
      setStatus(statusEl, 'Adding ' + it.file.name + ' (' + (i + 1) + ' of ' + TO.length + ')...');
      const target = combine ? pdf : await fresh();
      try { await addToPdf(target, it, opts, stats); }
      catch (err) { throw new Error('"' + it.file.name + '" could not be added: ' + (err.message || 'unknown error')); }
      if (!combine) outputs.push({ name: baseName(it.file.name) + '.pdf', blob: new Blob([await target.save()], { type: 'application/pdf' }) });
      progress(((i + 1) / TO.length) * 0.9);
      await tick();
    }
    let pages = 0;
    if (combine) {
      setStatus(statusEl, 'Saving the PDF...');
      await tick();
      pages = pdf.getPageCount();
      outputs.push({ name: TO.length === 1 ? baseName(TO[0].file.name) + '.pdf' : 'combined.pdf', blob: new Blob([await pdf.save()], { type: 'application/pdf' }) });
    }
    progress(1);
    const notes = stats.notes.slice();
    const replaced = made.reduce((s, d) => s + ((docCtx.get(d) || {}).replaced || 0), 0);
    if (replaced) notes.push(plural(replaced, 'character') + ' could not be shown with the built-in font (for example Chinese, Arabic or emoji) and became "?".');
    if (stats.skipped) notes.push(plural(stats.skipped, 'picture or chart', 'pictures or charts') + ' could not be included (for example EMF or WMF drawings, charts, or linked web images).');
    if (stats.flattened.length) notes.push(stats.flattened.join(', ') + ' could not be copied as is (it may be protected), so its pages were added as pictures.');
    showResults(outputs, 'converted-pdfs.zip', notes.join(' '));
    if (combine) {
      const sum = resultBox.querySelector('.pdf-sum');
      sum.textContent = '';
      sum.append(el('b', { text: 'Your PDF is ready' }), ' (' + plural(pages, 'page') + ', ' + fmtSize(outputs[0].blob.size) + ')');
    }
    setStatus(statusEl, '');
  } catch (err) {
    setStatus(statusEl, err.message || 'Something went wrong while creating the PDF.', true);
  }
  setBusy(false);
}
$('pc-to-go').addEventListener('click', buildTo);

/* ------------------------------------------------------------------ FROM PDF */
const FROM = [];
const fromList = $('pc-from-list');
let fmt = 'jpg';
const FMT_NOTE = {
  jpg: 'Every page becomes a JPG picture. Several pages download together as a ZIP.',
  png: 'Every page becomes a sharp PNG picture, larger than JPG. Several pages download together as a ZIP.',
  txt: 'The text of every page in a plain .txt file. Pictures and layout are not kept.',
  docx: 'An editable Word file with the text of each page, headings and paragraphs. Pictures, tables and exact layout are not kept.',
  html: 'A web page with the text of each page, headings and paragraphs. Pictures and exact layout are not kept.',
  xlsx: 'An Excel workbook. Text is placed in rows and columns by its position on the page. Works best for simple tables.',
  csv: 'A CSV file of rows and columns found from the position of the text. Opens in Excel, Google Sheets or Numbers.',
  pptx: 'A PowerPoint file with one slide per page. Each slide is a picture of the page, so it looks the same but the text cannot be edited.'
};
async function addFrom(files) {
  const errors = [];
  for (let n = 0; n < files.length; n++) {
    const f = files[n];
    setStatus(statusEl, 'Reading ' + f.name + ' (' + (n + 1) + ' of ' + files.length + ')...');
    try {
      const { doc, buf, pages } = await openPdf(f);
      const it = { id: ++uid, file: f, doc, buf, pages };
      const li = el('li', { class: 'pdf-item pc-noreorder' });
      const th = el('div', { class: 'pdf-thumb' });
      const c = el('canvas', { 'data-page': '1', role: 'img', 'aria-label': 'First page of ' + f.name });
      th.append(c);
      it.thumbs = createThumbs(doc, { maxSide: 110, onRender(cv) { const k = Math.min(62 / parseFloat(cv.style.width), 78 / parseFloat(cv.style.height), 1); cv.style.width = Math.round(parseFloat(cv.style.width) * k) + 'px'; cv.style.height = Math.round(parseFloat(cv.style.height) * k) + 'px'; } });
      it.thumbs.observe(c);
      const meta = el('div', { class: 'pdf-meta' }, el('b', { text: f.name }), el('small', { text: plural(pages, 'page') + ', ' + fmtSize(f.size) }));
      const acts = el('div', { class: 'pdf-acts' });
      acts.append(iconButton('trash', 'Remove ' + f.name, () => { FROM.splice(FROM.indexOf(it), 1); li.remove(); dropItem(it); refreshFrom(); clearResult(); }, 'del'));
      li.append(th, meta, acts);
      it.li = li;
      FROM.push(it);
      fromList.append(li);
    } catch (err) { errors.push(err.message); }
    await tick();
  }
  refreshFrom();
  setStatus(statusEl, errors.join(' '), !!errors.length);
}
function refreshFrom() {
  $('pc-from-work').hidden = !FROM.length;
  const cnt = $('pc-from-count');
  cnt.textContent = '';
  if (FROM.length) cnt.append(el('b', { text: plural(FROM.length, 'PDF') }), ', ' + plural(FROM.reduce((s, it) => s + it.pages, 0), 'page') + ' in total.');
  $('pc-from-go').disabled = !FROM.length || busy;
  const isImg = fmt === 'jpg' || fmt === 'png' || fmt === 'pptx';
  $('pc-o-dpi').hidden = !isImg;
  $('pc-o-jq').hidden = fmt !== 'jpg';
  $('pc-o-sheets').hidden = fmt !== 'xlsx';
  $('pc-o-breaks').hidden = !/^(txt|docx|html)$/.test(fmt);
  $('pc-fmt-note').textContent = FMT_NOTE[fmt];
  $('pc-from-go').textContent = 'Convert to ' + $('pc-fmt').querySelector('[data-fmt="' + fmt + '"]').dataset.label;
}
$('pc-fmt').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-fmt]');
  if (!b || busy) return;
  fmt = b.dataset.fmt;
  for (const x of $('pc-fmt').querySelectorAll('button')) x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
  clearResult();
  refreshFrom();
});
$('pc-from-clear').addEventListener('click', () => { FROM.splice(0).forEach(dropItem); fromList.textContent = ''; refreshFrom(); clearResult(); setStatus(statusEl, ''); });
['pc-pages', 'pc-dpi', 'pc-jq', 'pc-sheets', 'pc-breaks'].forEach((id) => $(id).addEventListener('change', clearResult));

function pagesOf(it) {
  const t = $('pc-pages').value.trim();
  if (!t) return Array.from({ length: it.pages }, (_, i) => i + 1);
  const r = parseRanges(t, it.pages);
  if (r.error) throw new Error('"' + it.file.name + '": ' + r.error);
  return r.pages;
}
const pad = (n, total) => String(n).padStart(String(total).length < 2 ? 2 : String(total).length, '0');

async function extractText(it, pages, onPage) {
  const out = [];
  for (const n of pages) {
    const page = await it.doc.getPage(n);
    const tc = await page.getTextContent();
    const lines = C.textLines(tc.items);
    out.push({ n, lines, blocks: C.linesToBlocks(lines), chars: lines.reduce((s, l) => s + l.chars, 0), w: page.view[2] - page.view[0], h: page.view[3] - page.view[1] });
    page.cleanup();
    onPage();
    await tick();
  }
  return out;
}

async function buildFrom() {
  if (busy || !FROM.length) return;
  setBusy(true);
  clearResult();
  progress(0);
  const outputs = [];
  const notes = [];
  try {
    const jobs = FROM.map((it) => ({ it, pages: pagesOf(it) }));
    const total = jobs.reduce((s, j) => s + j.pages.length, 0);
    let done = 0;
    const step = () => { done++; progress(done / total); };
    const dpi = +$('pc-dpi').value;
    const breaks = $('pc-breaks').checked;
    let noText = [];
    for (const { it, pages } of jobs) {
      const name = baseName(it.file.name);
      if (fmt === 'jpg' || fmt === 'png' || fmt === 'pptx') {
        const slides = [];
        for (const n of pages) {
          setStatus(statusEl, 'Drawing page ' + n + ' of ' + it.pages + ' in ' + it.file.name + '...');
          const page = await it.doc.getPage(n);
          const c = await renderPage(page, dpi / 72, page.rotate);
          const type = fmt === 'png' ? 'image/png' : 'image/jpeg';
          const blob = await toBlob(c, type, fmt === 'pptx' ? 0.85 : +$('pc-jq').value);
          if (fmt === 'pptx') { const vp = page.getViewport({ scale: 1, rotation: page.rotate }); slides.push({ bytes: await u8(blob), type: 'jpeg', w: vp.width, h: vp.height }); }
          else outputs.push({ name: name + '-page-' + pad(n, it.pages) + (fmt === 'png' ? '.png' : '.jpg'), blob });
          freeCanvas(c);
          page.cleanup();
          step();
          await tick();
        }
        if (fmt === 'pptx') {
          setStatus(statusEl, 'Building the PowerPoint file...');
          await tick();
          outputs.push({ name: name + '.pptx', blob: new Blob([C.makePptx(slides, { title: name })], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }) });
        }
        continue;
      }
      setStatus(statusEl, 'Reading the text of ' + it.file.name + '...');
      const pg = await extractText(it, pages, step);
      const chars = pg.reduce((s, p) => s + p.chars, 0);
      if (!chars) { noText.push(it.file.name); continue; }
      if (pg.some((p) => !p.chars)) notes.push(it.file.name + ': ' + plural(pg.filter((p) => !p.chars).length, 'page has', 'pages have') + ' no text (probably scanned pictures).');
      if (fmt === 'txt') outputs.push({ name: name + '.txt', blob: new Blob([C.makeText(pg, breaks)], { type: 'text/plain;charset=utf-8' }) });
      else if (fmt === 'html') outputs.push({ name: name + '.html', blob: new Blob([C.makeHtml(pg, name, breaks)], { type: 'text/html;charset=utf-8' }) });
      else if (fmt === 'docx') outputs.push({ name: name + '.docx', blob: new Blob([C.makeDocx(pg, { pageW: pg[0].w, pageH: pg[0].h, pageBreaks: breaks, title: name })], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) });
      else if (fmt === 'xlsx') {
        let sheets;
        if ($('pc-sheets').checked) sheets = pg.map((p) => ({ name: 'Page ' + p.n, rows: C.linesToTable(p.lines) }));
        else { const rows = []; pg.forEach((p, i) => { if (i) rows.push([]); rows.push(...C.linesToTable(p.lines)); }); sheets = [{ name, rows }]; }
        outputs.push({ name: name + '.xlsx', blob: new Blob([C.makeXlsx(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) });
      } else if (fmt === 'csv') {
        const rows = [];
        pg.forEach((p, i) => { if (i) rows.push([]); rows.push(...C.linesToTable(p.lines)); });
        outputs.push({ name: name + '.csv', blob: new Blob([C.makeCsv(rows)], { type: 'text/csv;charset=utf-8' }) });
      }
    }
    progress(1);
    if (noText.length) {
      const msg = noText.join(', ') + (noText.length === 1 ? ' has' : ' have') + ' no text to extract. ' + (noText.length === 1 ? 'It looks' : 'They look') + ' like scanned pages, which are pictures of text. Reading those needs OCR, which this tool does not do. You can still turn the pages into JPG or PNG pictures.';
      if (!outputs.length) throw new Error(msg);
      notes.unshift(msg);
    }
    showResults(outputs, baseName(FROM.length === 1 ? FROM[0].file.name : 'converted') + '-' + fmt + '.zip', notes.join(' '));
    setStatus(statusEl, '');
  } catch (err) {
    setStatus(statusEl, err.message || 'Something went wrong while converting.', true);
  }
  setBusy(false);
}
$('pc-from-go').addEventListener('click', buildFrom);

/* ------------------------------------------------------------------ EDIT PDF */
const ED = { files: [], pages: [] };
const grid = $('pc-grid');
let lastClick = -1;
async function addEdit(files) {
  const errors = [];
  for (let n = 0; n < files.length; n++) {
    const f = files[n];
    setStatus(statusEl, 'Reading ' + f.name + ' (' + (n + 1) + ' of ' + files.length + ')...');
    try {
      const { doc, buf, pages } = await openPdf(f);
      const fo = { id: ++uid, file: f, doc, buf, pages, letter: String.fromCharCode(65 + (ED.files.length % 26)) };
      fo.thumbs = createThumbs(doc, { maxSide: 150 });
      ED.files.push(fo);
      for (let i = 0; i < pages; i++) ED.pages.push(makePage(fo, i));
    } catch (err) { errors.push(err.message); }
    await tick();
  }
  refreshEdit();
  setStatus(statusEl, errors.join(' '), !!errors.length);
}
function makePage(fo, i) {
  const pg = { key: ++uid, fo, i, rot: 0, sel: false };
  const li = el('li', { 'data-item': '', draggable: 'true', class: 'pc-pgli' });
  const btn = el('button', { type: 'button', class: 'pdf-pg' });
  const box = el('span', { class: 'box' });
  const c = el('canvas', { 'data-page': String(i + 1) });
  box.append(c);
  const tickEl = el('span', { class: 'tick', 'aria-hidden': 'true' });
  tickEl.innerHTML = icon('check');
  pg.label = el('span', { class: 'n' });
  btn.append(box, pg.label, tickEl);
  btn.addEventListener('click', (e) => {
    const idx = ED.pages.indexOf(pg);
    if (e.shiftKey && lastClick >= 0) { const [a, b] = [Math.min(lastClick, idx), Math.max(lastClick, idx)]; for (let k = a; k <= b; k++) ED.pages[k].sel = true; }
    else pg.sel = !pg.sel;
    lastClick = idx;
    paintSel();
  });
  const acts = el('span', { class: 'pc-pgacts' });
  acts.append(
    iconButton('left', 'Move page earlier', () => movePage(pg, -1)),
    iconButton('rot', 'Rotate page right', () => { pg.rot = (pg.rot + 90) % 360; paintRot(pg); clearResult(); }),
    iconButton('trash', 'Remove page', () => { ED.pages.splice(ED.pages.indexOf(pg), 1); li.remove(); refreshEdit(); clearResult(); }, 'del'),
    iconButton('right', 'Move page later', () => movePage(pg, 1))
  );
  li.append(btn, acts);
  pg.li = li; pg.btn = btn; pg.canvas = c;
  fo.thumbs.observe(c);
  return pg;
}
function paintRot(pg) { pg.canvas.style.transform = pg.rot ? 'rotate(' + pg.rot + 'deg)' + (pg.rot % 180 ? ' scale(0.75)' : '') : ''; }
function paintSel() {
  let n = 0;
  for (const pg of ED.pages) { pg.btn.classList.toggle('sel', pg.sel); pg.btn.setAttribute('aria-pressed', pg.sel ? 'true' : 'false'); if (pg.sel) n++; }
  $('pc-selcount').textContent = ED.pages.length ? plural(ED.pages.length, 'page') + (n ? ', ' + n + ' selected' : '') + '. Click pages to select them, drag to reorder.' : '';
  ['pc-e-rl', 'pc-e-rr', 'pc-e-del'].forEach((id) => { $(id).disabled = !n; });
}
function movePage(pg, d) {
  const i = ED.pages.indexOf(pg), j = i + d;
  if (j < 0 || j >= ED.pages.length) return;
  moveItem(ED.pages, i, j);
  refreshEdit();
  clearResult();
}
function refreshEdit() {
  grid.append(...ED.pages.map((p) => p.li));
  const multi = ED.files.length > 1;
  ED.pages.forEach((p, k) => {
    p.label.textContent = (k + 1) + (multi ? '  (' + p.fo.letter + ' p' + (p.i + 1) + ')' : p.i !== k ? '  (was ' + (p.i + 1) + ')' : '');
    p.btn.setAttribute('aria-label', 'Page ' + (k + 1) + ', from ' + p.fo.file.name + ' page ' + (p.i + 1) + (p.rot ? ', rotated ' + p.rot + ' degrees' : ''));
  });
  const fl = $('pc-edit-files');
  fl.textContent = '';
  for (const fo of ED.files) fl.append(el('li', {}, el('b', { text: multi ? fo.letter + ': ' : '' }), fo.file.name + ' (' + plural(fo.pages, 'page') + ')'));
  $('pc-edit-work').hidden = !ED.files.length;
  $('pc-edit-go').disabled = !ED.pages.length || busy;
  paintSel();
  const sp = $('pc-split').value;
  $('pc-o-n').hidden = sp !== 'every';
  $('pc-o-ranges').hidden = sp !== 'ranges';
  $('pc-o-cq').hidden = $('pc-comp').value === 'none';
}
enableReorder(grid, (from, to) => { moveItem(ED.pages, from, to); refreshEdit(); clearResult(); });
$('pc-e-all').addEventListener('click', () => { ED.pages.forEach((p) => { p.sel = true; }); paintSel(); });
$('pc-e-none').addEventListener('click', () => { ED.pages.forEach((p) => { p.sel = false; }); paintSel(); });
const rotSel = (d) => { ED.pages.forEach((p) => { if (p.sel) { p.rot = (p.rot + d + 360) % 360; paintRot(p); } }); clearResult(); };
$('pc-e-rl').addEventListener('click', () => rotSel(-90));
$('pc-e-rr').addEventListener('click', () => rotSel(90));
$('pc-e-del').addEventListener('click', () => { for (const p of ED.pages.filter((q) => q.sel)) p.li.remove(); ED.pages = ED.pages.filter((p) => !p.sel); refreshEdit(); clearResult(); });
$('pc-e-rev').addEventListener('click', () => { ED.pages.reverse(); refreshEdit(); clearResult(); });
$('pc-e-reset').addEventListener('click', () => {
  ED.pages.forEach((p) => p.li.remove());
  const keep = new Map(ED.pages.map((p) => [p.fo.id + ':' + p.i, p]));
  ED.pages = [];
  for (const fo of ED.files) for (let i = 0; i < fo.pages; i++) { const p = keep.get(fo.id + ':' + i) || makePage(fo, i); p.rot = 0; p.sel = false; paintRot(p); ED.pages.push(p); }
  refreshEdit();
  clearResult();
});
$('pc-edit-clear').addEventListener('click', () => {
  ED.files.forEach((fo) => { fo.thumbs.destroy(); fo.doc.destroy(); });
  ED.files = []; ED.pages = []; grid.textContent = '';
  refreshEdit(); clearResult(); setStatus(statusEl, '');
});
['pc-split', 'pc-comp', 'pc-cq', 'pc-n', 'pc-ranges'].forEach((id) => $(id).addEventListener('change', () => { clearResult(); refreshEdit(); }));

const STRENGTH = { light: { max: 2400, q: 0.8, dpi: 150 }, medium: { max: 1600, q: 0.68, dpi: 110 }, strong: { max: 1100, q: 0.52, dpi: 80 } };
function reencodeFor(level) {
  return async (bytes, info) => {
    let src, w = info.w, h = info.h;
    if (info.kind === 'jpeg') {
      if (jpegComps(bytes) === 4) return null;
      src = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
      w = src.width; h = src.height;
    } else {
      const id = new ImageData(w, h);
      const d = id.data, r = info.raw;
      for (let p = 0, q = 0, n = w * h; p < n; p++) {
        if (info.comps === 3) { d[q] = r[p * 3]; d[q + 1] = r[p * 3 + 1]; d[q + 2] = r[p * 3 + 2]; }
        else { d[q] = d[q + 1] = d[q + 2] = r[p]; }
        d[q + 3] = 255; q += 4;
      }
      src = document.createElement('canvas');
      src.width = w; src.height = h;
      src.getContext('2d').putImageData(id, 0, 0);
    }
    const c = canvasOf(src, w, h, level.max, true);
    if (src.close) src.close(); else freeCanvas(src);
    const out = await u8(await toBlob(c, 'image/jpeg', level.q));
    const res = { bytes: out, w: c.width, h: c.height };
    freeCanvas(c);
    return res;
  };
}

async function buildEdit() {
  if (busy || !ED.pages.length) return;
  const { PDFDocument, degrees } = needPdfLib();
  const split = $('pc-split').value, comp = $('pc-comp').value, level = STRENGTH[$('pc-cq').value];
  let groups;
  const count = ED.pages.length;
  if (split === 'one') groups = [Array.from({ length: count }, (_, i) => i)];
  else if (split === 'single') groups = Array.from({ length: count }, (_, i) => [i]);
  else if (split === 'every') {
    const n = Math.max(1, parseInt($('pc-n').value, 10) || 1);
    groups = [];
    for (let i = 0; i < count; i += n) groups.push(Array.from({ length: Math.min(n, count - i) }, (_, k) => i + k));
  } else {
    const r = parseGroups($('pc-ranges').value, count);
    if (r.error) { setStatus(statusEl, r.error + ' Page numbers follow the new order shown above.', true); return; }
    groups = r.groups.map((g) => g.map((p) => p - 1));
  }
  setBusy(true);
  clearResult();
  progress(0);
  try {
    const before = ED.files.reduce((s, f) => s + f.file.size, 0);
    const final = await PDFDocument.create();
    final.setProducer('Free PDF converter');
    if (comp === 'flatten') {
      for (let k = 0; k < count; k++) {
        const pg = ED.pages[k];
        setStatus(statusEl, 'Turning page ' + (k + 1) + ' of ' + count + ' into a picture...');
        const page = await pg.fo.doc.getPage(pg.i + 1);
        const rot = (page.rotate + pg.rot) % 360;
        const c = await renderPage(page, level.dpi / 72, rot);
        const img = await final.embedJpg(await u8(await toBlob(c, 'image/jpeg', level.q)));
        const vp = page.getViewport({ scale: 1, rotation: rot });
        final.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
        freeCanvas(c);
        page.cleanup();
        progress(((k + 1) / count) * 0.85);
        await tick();
      }
    } else {
      setStatus(statusEl, 'Putting the pages together...');
      await tick();
      const copied = new Map();
      for (const fo of ED.files) {
        const need = [...new Set(ED.pages.filter((p) => p.fo === fo).map((p) => p.i))];
        if (!need.length) continue;
        let src;
        try { src = await PDFDocument.load(fo.buf, { updateMetadata: false }); }
        catch (e) {
          if (/encrypt/i.test(e && e.message)) throw new Error('"' + fo.file.name + '" is protected against changes. Choose "Turn pages into pictures" under Make it smaller to work with it, or remove the protection first.');
          throw new Error('"' + fo.file.name + '" could not be read for editing (' + (e.message || 'unknown error') + ').');
        }
        const pages = await final.copyPages(src, need);
        need.forEach((i, k) => copied.set(fo.id + ':' + i, pages[k]));
        await tick();
      }
      for (const pg of ED.pages) {
        const p = copied.get(pg.fo.id + ':' + pg.i);
        if (pg.rot) p.setRotation(degrees((p.getRotation().angle + pg.rot) % 360));
        final.addPage(p);
      }
      progress(0.3);
      if (comp === 'images') {
        setStatus(statusEl, 'Making the pictures inside the PDF smaller...');
        await C.shrinkImages(final, reencodeFor(level), (d, t) => { progress(0.3 + (d / t) * 0.55); setStatus(statusEl, 'Making picture ' + d + ' of ' + t + ' smaller...'); });
      }
    }
    setStatus(statusEl, 'Saving...');
    await tick();
    const outputs = [];
    const stem = baseName(ED.files.length === 1 ? ED.files[0].file.name : 'merged');
    if (groups.length === 1 && groups[0].length === count) {
      outputs.push({ name: stem + (ED.files.length > 1 ? '' : '-edited') + '.pdf', blob: new Blob([await final.save()], { type: 'application/pdf' }) });
    } else {
      for (let g = 0; g < groups.length; g++) {
        const sub = await PDFDocument.create();
        const pages = await sub.copyPages(final, groups[g]);
        pages.forEach((p) => sub.addPage(p));
        const lbl = groups[g].length === 1 ? 'page-' + pad(groups[g][0] + 1, count) : 'pages-' + (groups[g][0] + 1) + '-' + (groups[g][groups[g].length - 1] + 1);
        outputs.push({ name: stem + '-' + lbl + '.pdf', blob: new Blob([await sub.save()], { type: 'application/pdf' }) });
        progress(0.85 + ((g + 1) / groups.length) * 0.15);
        await tick();
      }
    }
    progress(1);
    let note = '';
    if (comp !== 'none' && outputs.length === 1) {
      const after = outputs[0].blob.size;
      note = after < before ? 'Size went from ' + fmtSize(before) + ' to ' + fmtSize(after) + '.' : 'The file did not get smaller (' + fmtSize(before) + ' before, ' + fmtSize(after) + ' after). It may hold mostly text and drawings, which are already small.' + (comp === 'images' ? ' For scanned pages, try "Turn pages into pictures".' : '');
    }
    if (comp === 'flatten') note += (note ? ' ' : '') + 'The pages are now pictures, so their text can no longer be selected or searched.';
    showResults(outputs, stem + '-split.zip', note);
    setStatus(statusEl, '');
  } catch (err) {
    setStatus(statusEl, err.message || 'Something went wrong while saving.', true);
  }
  setBusy(false);
}
$('pc-edit-go').addEventListener('click', buildEdit);

/* ------------------------------------------------------------------ start */
const start = (location.hash || '').replace('#', '');
setMode(start === 'from-pdf' ? 'from' : start === 'edit-pdf' ? 'edit' : 'to');
refreshTo();
refreshFrom();
refreshEdit();
window.__pc = { TO, FROM, ED };
