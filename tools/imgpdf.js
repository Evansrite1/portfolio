import { $, fmtSize, plural, tick, el, setStatus, wireDrop, needPdfLib, enableReorder, moveItem, renderResults, iconButton, icon } from '/tools/pdfcommon.js';

const items = [];
let uid = 0;
let busy = false;

const list = $('ip-list');
const statusEl = $('ip-status');
const SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
const MARGINS = { none: 0, small: 24, big: 56 };
const QUALITY = { original: null, high: { q: 0.9, max: 3000 }, medium: { q: 0.75, max: 2000 }, small: { q: 0.55, max: 1400 } };

/* ---------- reading images ---------- */
function kindOf(file, head) {
  if (head[0] === 0xff && head[1] === 0xd8) return 'jpeg';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png';
  return 'other';
}

/* EXIF orientation (1 to 8) of a JPEG, or 1 */
function exifOrientation(u8) {
  try {
    if (u8[0] !== 0xff || u8[1] !== 0xd8) return 1;
    let p = 2;
    while (p + 4 < u8.length) {
      if (u8[p] !== 0xff) return 1;
      const marker = u8[p + 1];
      const len = (u8[p + 2] << 8) | u8[p + 3];
      if (marker === 0xe1 && u8[p + 4] === 0x45 && u8[p + 5] === 0x78 && u8[p + 6] === 0x69 && u8[p + 7] === 0x66) {
        const t = p + 10;
        const le = u8[t] === 0x49;
        const r16 = (o) => (le ? u8[t + o] | (u8[t + o + 1] << 8) : (u8[t + o] << 8) | u8[t + o + 1]);
        const r32 = (o) => (le ? (u8[t + o] | (u8[t + o + 1] << 8) | (u8[t + o + 2] << 16) | (u8[t + o + 3] << 24)) >>> 0 : ((u8[t + o] << 24) | (u8[t + o + 1] << 16) | (u8[t + o + 2] << 8) | u8[t + o + 3]) >>> 0);
        const ifd = r32(4);
        const n = r16(ifd);
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (r16(e) === 0x0112) return r16(e + 8) || 1;
        }
        return 1;
      }
      if (marker === 0xda) return 1;
      p += 2 + len;
    }
  } catch (e) { /* fall through */ }
  return 1;
}

async function decode(file, opts) {
  try { return await createImageBitmap(file, Object.assign({ imageOrientation: 'from-image' }, opts || {})); }
  catch (e) { return await createImageBitmap(file, opts || {}); }
}

async function addFiles(files) {
  if (busy) return;
  const errors = [];
  let added = 0;
  setStatus(statusEl, 'Reading images...');
  for (const f of files) {
    try {
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name)) throw new Error('is not an image');
      const head = new Uint8Array(await f.slice(0, 65536).arrayBuffer());
      const kind = kindOf(f, head);
      const orient = kind === 'jpeg' ? exifOrientation(head) : 1;
      const bm = await decode(f);
      const w = bm.width, h = bm.height;
      const c = document.createElement('canvas');
      const s = Math.min(1, 220 / Math.max(w, h));
      c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bm, 0, 0, c.width, c.height);
      if (bm.close) bm.close();
      const baseRot = { 3: 180, 6: 90, 8: 270 }[orient] || 0;
      const it = { id: ++uid, file: f, kind, orient, baseRot, w, h, rot: 0, srcCanvas: c, canvas: document.createElement('canvas') };
      items.push(it);
      buildItem(it);
      added++;
    } catch (err) {
      errors.push('"' + f.name + '" ' + (err.message === 'is not an image' ? 'is not an image file.' : 'could not be read. It may be damaged or in a format this browser cannot open.'));
    }
    if (added % 5 === 0) await tick();
  }
  refresh();
  if (added) clearResult();
  setStatus(statusEl, errors.length ? errors.join(' ') : '', !!errors.length);
}

/* ---------- list ---------- */
function infoText(it) {
  const q = $('ip-quality').value;
  let how;
  if (QUALITY[q]) how = 'recompressed as JPEG';
  else if (it.kind === 'jpeg' && it.orient > 1 && !it.baseRot) how = 'rotated and recompressed';
  else if (it.kind === 'jpeg' || it.kind === 'png') how = it.kind.toUpperCase() + ' kept as is';
  else how = 'converted to JPEG';
  return it.w + ' x ' + it.h + ' px, ' + fmtSize(it.file.size) + ', ' + how;
}

function buildItem(it) {
  const li = el('li', { class: 'pdf-item', 'data-item': '', draggable: 'true' });
  const grip = el('span', { class: 'pdf-grip', 'aria-hidden': 'true', title: 'Drag to reorder' });
  grip.innerHTML = icon('grip');
  const th = el('div', { class: 'pdf-thumb' });
  it.canvas.setAttribute('role', 'img');
  th.append(it.canvas);
  const meta = el('div', { class: 'pdf-meta' }, el('b', { text: it.file.name }));
  it.numEl = el('small');
  it.infoEl = el('small');
  meta.append(it.numEl, it.infoEl);
  const acts = el('div', { class: 'pdf-acts' });
  it.upBtn = iconButton('up', 'Move up', () => move(it, -1));
  it.downBtn = iconButton('down', 'Move down', () => move(it, 1));
  const rot = iconButton('rot', 'Rotate 90 degrees', () => { it.rot = (it.rot + 90) % 360; showRot(it); clearResult(); });
  const del = iconButton('trash', 'Remove ' + it.file.name, () => { items.splice(items.indexOf(it), 1); it.li.remove(); refresh(); clearResult(); }, 'del');
  acts.append(it.upBtn, it.downBtn, rot, del);
  li.append(grip, th, meta, acts);
  it.li = li;
  showRot(it);
}

function showRot(it) {
  const s = it.srcCanvas, c = it.canvas;
  const rotated = it.rot % 180 !== 0;
  const w = rotated ? s.height : s.width, h = rotated ? s.width : s.height;
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.save();
  x.translate(w / 2, h / 2);
  x.rotate((it.rot * Math.PI) / 180);
  x.drawImage(s, -s.width / 2, -s.height / 2);
  x.restore();
  const k = Math.min(62 / w, 78 / h);
  c.style.width = Math.round(w * k) + 'px';
  c.style.height = Math.round(h * k) + 'px';
  c.setAttribute('aria-label', 'Preview of ' + it.file.name + (it.rot ? ', rotated ' + it.rot + ' degrees' : ''));
}

function move(it, d) {
  const i = items.indexOf(it), j = i + d;
  if (j < 0 || j >= items.length) return;
  moveItem(items, i, j);
  refresh();
  clearResult();
  const btn = d < 0 ? it.upBtn : it.downBtn;
  (btn.disabled ? (d < 0 ? it.downBtn : it.upBtn) : btn).focus();
}

function refresh() {
  list.append(...items.map((it) => it.li));
  items.forEach((it, i) => {
    it.numEl.textContent = 'Page ' + (i + 1);
    it.infoEl.textContent = infoText(it);
    it.upBtn.disabled = i === 0;
    it.downBtn.disabled = i === items.length - 1;
  });
  $('ip-work').hidden = !items.length;
  $('ip-count').innerHTML = '';
  if (items.length) {
    const total = items.reduce((s, it) => s + it.file.size, 0);
    $('ip-count').append(el('b', { text: plural(items.length, 'image') }), ' added, ' + fmtSize(total) + ' in total. Drag to reorder or use the arrows.');
  }
  $('ip-go').disabled = !items.length || busy;
}

function clearResult() {
  const r = $('ip-result');
  r.hidden = true; r.textContent = '';
}

/* ---------- building the PDF ---------- */
function layout(iw, ih, total, opts) {
  const rotated = total % 180 !== 0;
  const vw = rotated ? ih : iw, vh = rotated ? iw : ih;
  const m = MARGINS[opts.margin];
  let pw, ph, dwv, dhv;
  if (opts.size === 'fit') {
    let k = 0.75;
    const longest = Math.max(vw, vh) * k + 2 * m;
    if (longest > 14000) k *= 14000 / longest;
    dwv = vw * k; dhv = vh * k;
    pw = dwv + 2 * m; ph = dhv + 2 * m;
  } else {
    let [a, b] = SIZES[opts.size];
    const landscape = opts.orient === 'landscape' || (opts.orient === 'auto' && vw > vh);
    pw = landscape ? Math.max(a, b) : Math.min(a, b);
    ph = landscape ? Math.min(a, b) : Math.max(a, b);
    const s = Math.min((pw - 2 * m) / vw, (ph - 2 * m) / vh);
    dwv = vw * s; dhv = vh * s;
  }
  // size of the unrotated image as drawn
  const dw = rotated ? dhv : dwv, dh = rotated ? dwv : dhv;
  return { pw, ph, dw, dh };
}

function placement(cx, cy, dw, dh, total) {
  const theta = (360 - total) % 360; // pdf-lib turns counter clockwise
  if (theta === 90) return { x: cx + dh / 2, y: cy - dw / 2, theta };
  if (theta === 180) return { x: cx + dw / 2, y: cy + dh / 2, theta };
  if (theta === 270) return { x: cx - dh / 2, y: cy + dw / 2, theta };
  return { x: cx - dw / 2, y: cy - dh / 2, theta: 0 };
}

async function reencode(file, spec) {
  const bm = await decode(file);
  let w = bm.width, h = bm.height;
  if (spec && spec.max) { const s = Math.min(1, spec.max / Math.max(w, h)); w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s)); }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  x.drawImage(bm, 0, 0, w, h);
  if (bm.close) bm.close();
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', spec ? spec.q : 0.92));
  c.width = c.height = 0;
  if (!blob) throw new Error('could not be converted');
  return new Uint8Array(await blob.arrayBuffer());
}

async function build() {
  if (busy || !items.length) return;
  busy = true;
  $('ip-go').disabled = true;
  clearResult();
  const prog = $('ip-prog'), pb = $('ip-pb');
  prog.hidden = false; pb.style.width = '0%';
  const opts = { size: $('ip-size').value, orient: $('ip-orient').value, margin: $('ip-margin').value };
  const spec = QUALITY[$('ip-quality').value];
  try {
    const { PDFDocument, degrees } = needPdfLib();
    const pdf = await PDFDocument.create();
    pdf.setProducer('Free image to PDF tool');
    pdf.setCreator('Free image to PDF tool');
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      setStatus(statusEl, 'Adding image ' + (i + 1) + ' of ' + items.length + '...');
      let img, base = 0;
      try {
        if (!spec && (it.kind === 'jpeg' || it.kind === 'png') && !(it.kind === 'jpeg' && it.orient > 1 && !it.baseRot)) {
          const bytes = new Uint8Array(await it.file.arrayBuffer());
          try {
            img = it.kind === 'jpeg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
            base = it.baseRot;
          } catch (e) { img = null; }
        }
        if (!img) {
          img = await pdf.embedJpg(await reencode(it.file, spec));
          base = 0;
        }
      } catch (err) {
        throw new Error('"' + it.file.name + '" could not be added (' + (err.message || 'unknown error') + ').');
      }
      const total = (base + it.rot) % 360;
      const L = layout(img.width, img.height, total, opts);
      const page = pdf.addPage([L.pw, L.ph]);
      const p = placement(L.pw / 2, L.ph / 2, L.dw, L.dh, total);
      page.drawImage(img, { x: p.x, y: p.y, width: L.dw, height: L.dh, rotate: degrees(p.theta) });
      pb.style.width = Math.round(((i + 1) / items.length) * 90) + '%';
      await tick();
    }
    setStatus(statusEl, 'Saving the PDF...');
    await tick();
    const bytes = await pdf.save();
    pb.style.width = '100%';
    const blob = new Blob([bytes], { type: 'application/pdf' });
    renderResults($('ip-result'), [{ name: items.length === 1 ? items[0].file.name.replace(/\.[^.]+$/, '') + '.pdf' : 'images.pdf', blob }]);
    const sum = $('ip-result').querySelector('.pdf-sum');
    sum.textContent = '';
    sum.append(el('b', { text: 'Your PDF is ready' }), ' (' + plural(items.length, 'page') + ', ' + fmtSize(blob.size) + ')');
    setStatus(statusEl, '');
  } catch (err) {
    setStatus(statusEl, err.message || 'Something went wrong while creating the PDF.', true);
  }
  prog.hidden = true;
  busy = false;
  $('ip-go').disabled = !items.length;
}

/* ---------- wiring ---------- */
wireDrop($('ip-drop'), $('ip-file'), $('ip-pick'), addFiles);
$('ip-add').addEventListener('click', () => $('ip-file').click());
$('ip-clear').addEventListener('click', () => { items.length = 0; list.textContent = ''; refresh(); clearResult(); setStatus(statusEl, ''); });
$('ip-go').addEventListener('click', build);
['ip-size', 'ip-orient', 'ip-margin', 'ip-quality'].forEach((id) => $(id).addEventListener('change', () => { clearResult(); items.forEach((it) => { it.infoEl.textContent = infoText(it); }); }));
$('ip-size').addEventListener('change', () => { $('ip-orient').disabled = $('ip-size').value === 'fit'; });
enableReorder(list, (from, to) => { moveItem(items, from, to); refresh(); clearResult(); });
document.addEventListener('paste', (e) => {
  const fs = [...((e.clipboardData && e.clipboardData.files) || [])].filter((f) => /^image\//.test(f.type));
  if (fs.length) addFiles(fs);
});
window.__ipItems = items;
refresh();
