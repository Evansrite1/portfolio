import { $, fmtSize, plural, tick, el, setStatus, wireDrop, needPdfLib, openPdf, createThumbs, parseRanges, parseGroups, formatRanges, renderResults, baseName, icon } from '/tools/pdfcommon.js';

const st = { file: null, doc: null, buf: null, pages: 0, thumbs: null, src: null, sel: new Set(), rot: [], mode: 'extract', last: 0, busy: false };
const statusEl = $('sp-status');
const grid = $('sp-grid');
const MODES = {
  extract: { go: 'Extract pages', panel: 'sp-p-pick', pick: true },
  delete: { go: 'Delete pages', panel: 'sp-p-pick', pick: true },
  ranges: { go: 'Split by ranges', panel: 'sp-p-ranges', pick: false },
  every: { go: 'Split every N pages', panel: 'sp-p-every', pick: false },
  single: { go: 'Split into single pages', panel: 'sp-p-single', pick: false },
  rotate: { go: 'Save rotated PDF', panel: 'sp-p-rotate', pick: true }
};

/* ---------- loading ---------- */
async function loadFile(files) {
  if (st.busy) return;
  const f = files[0];
  setStatus(statusEl, 'Reading ' + f.name + '...');
  try {
    const { doc, buf, pages } = await openPdf(f);
    reset(true);
    Object.assign(st, { file: f, doc, buf, pages, src: null, sel: new Set(), rot: new Array(pages).fill(0), last: 0 });
    $('sp-name').textContent = f.name;
    $('sp-meta').textContent = plural(pages, 'page') + ', ' + fmtSize(f.size);
    $('sp-drop').hidden = true;
    $('sp-work').hidden = false;
    buildGrid();
    setMode('extract');
    syncSel();
    setStatus(statusEl, files.length > 1 ? 'Only the first file was opened. This tool works on one PDF at a time.' : '');
  } catch (err) {
    setStatus(statusEl, err.message, true);
  }
}

function reset(keepUi) {
  if (st.thumbs) st.thumbs.destroy();
  if (st.doc) st.doc.destroy();
  Object.assign(st, { file: null, doc: null, buf: null, pages: 0, thumbs: null, src: null, sel: new Set(), rot: [], last: 0 });
  grid.textContent = '';
  clearResult();
  if (!keepUi) {
    $('sp-work').hidden = true;
    $('sp-drop').hidden = false;
    setStatus(statusEl, '');
  }
}

/* ---------- page grid ---------- */
function fitCanvas(c) {
  const box = c.parentNode;
  const bw = box.clientWidth - 6, bh = box.clientHeight - 6;
  if (!c.classList.contains('done') || bw <= 0) return;
  const r = st.rot[+c.dataset.page - 1] || 0;
  const ar = c.width / c.height;
  let w, h;
  if (r % 180 === 0) { w = Math.min(bw, bh * ar); h = w / ar; }
  else { h = Math.min(bw, bh / ar); w = h * ar; }
  c.style.width = Math.round(w) + 'px';
  c.style.height = Math.round(h) + 'px';
  c.style.transform = r ? 'rotate(' + r + 'deg)' : '';
}

function buildGrid() {
  grid.textContent = '';
  const frag = document.createDocumentFragment();
  for (let p = 1; p <= st.pages; p++) {
    const li = el('li');
    const b = el('button', { type: 'button', class: 'pdf-pg', 'data-p': String(p), 'aria-pressed': 'false', 'aria-label': 'Page ' + p });
    const box = el('span', { class: 'box' }, el('canvas', { 'data-page': String(p), 'aria-hidden': 'true' }));
    const n = el('span', { class: 'n', text: String(p) });
    const t = el('span', { class: 'tick', 'aria-hidden': 'true' });
    t.innerHTML = icon('check');
    b.append(box, n, t);
    li.append(b);
    frag.append(li);
  }
  grid.append(frag);
  st.thumbs = createThumbs(st.doc, { maxSide: 200, onRender: fitCanvas });
  grid.querySelectorAll('canvas').forEach((c) => st.thumbs.observe(c));
}

let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => grid.querySelectorAll('canvas.done').forEach(fitCanvas), 120); });

function syncSel(fromText) {
  grid.querySelectorAll('.pdf-pg').forEach((b) => {
    const on = st.sel.has(+b.dataset.p);
    b.classList.toggle('sel', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (st.mode === 'delete') b.classList.toggle('gone', on); else b.classList.remove('gone');
  });
  if (!fromText) {
    $('sp-sel').value = formatRanges([...st.sel]);
    $('sp-sel').removeAttribute('aria-invalid');
    $('sp-selmsg').textContent = '';
  }
  const n = st.sel.size;
  $('sp-selcount').textContent = n ? plural(n, 'page') + ' selected' : 'No pages selected';
  updateGo();
}

grid.addEventListener('click', (e) => {
  const b = e.target.closest('.pdf-pg');
  if (!b || !MODES[st.mode].pick) return;
  const p = +b.dataset.p;
  if (e.shiftKey && st.last) {
    const [a, z] = [Math.min(st.last, p), Math.max(st.last, p)];
    for (let i = a; i <= z; i++) st.sel.add(i);
  } else if (st.sel.has(p)) st.sel.delete(p); else st.sel.add(p);
  st.last = p;
  clearResult();
  syncSel();
});

$('sp-sel').addEventListener('input', (e) => {
  const txt = e.target.value;
  if (!txt.trim()) { st.sel = new Set(); e.target.removeAttribute('aria-invalid'); $('sp-selmsg').textContent = ''; syncSel(true); return; }
  const r = parseRanges(txt, st.pages);
  e.target.setAttribute('aria-invalid', r.error ? 'true' : 'false');
  $('sp-selmsg').textContent = r.error || '';
  if (!r.error) { st.sel = new Set(r.pages); syncSel(true); }
  clearResult();
});
$('sp-all').addEventListener('click', () => { st.sel = new Set(Array.from({ length: st.pages }, (_, i) => i + 1)); syncSel(); clearResult(); });
$('sp-none').addEventListener('click', () => { st.sel = new Set(); syncSel(); clearResult(); });
$('sp-inv').addEventListener('click', () => { const n = new Set(); for (let i = 1; i <= st.pages; i++) if (!st.sel.has(i)) n.add(i); st.sel = n; syncSel(); clearResult(); });
$('sp-odd').addEventListener('click', () => { st.sel = new Set(Array.from({ length: st.pages }, (_, i) => i + 1).filter((p) => p % 2)); syncSel(); clearResult(); });
$('sp-even').addEventListener('click', () => { st.sel = new Set(Array.from({ length: st.pages }, (_, i) => i + 1).filter((p) => p % 2 === 0)); syncSel(); clearResult(); });

/* ---------- rotation ---------- */
function rotate(pages, by) {
  if (!pages.length) { setStatus(statusEl, 'Select the pages to rotate first, or use Rotate all.', true); return; }
  setStatus(statusEl, '');
  for (const p of pages) st.rot[p - 1] = (((st.rot[p - 1] + by) % 360) + 360) % 360;
  grid.querySelectorAll('canvas.done').forEach((c) => { if (pages.includes(+c.dataset.page)) fitCanvas(c); });
  clearResult();
  updateGo();
}
const allPages = () => Array.from({ length: st.pages }, (_, i) => i + 1);
$('sp-rr').addEventListener('click', () => rotate([...st.sel], 90));
$('sp-rl').addEventListener('click', () => rotate([...st.sel], -90));
$('sp-rall').addEventListener('click', () => rotate(allPages(), 90));
$('sp-rreset').addEventListener('click', () => { st.rot = new Array(st.pages).fill(0); grid.querySelectorAll('canvas.done').forEach(fitCanvas); clearResult(); updateGo(); });

/* ---------- modes ---------- */
function setMode(m) {
  st.mode = m;
  document.querySelectorAll('#sp-modes button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false'));
  document.querySelectorAll('.pdf-panel').forEach((p) => { p.hidden = p.id !== MODES[m].panel; });
  grid.classList.toggle('nosel', !MODES[m].pick);
  $('sp-go').textContent = MODES[m].go;
  $('sp-sel-lab').textContent = m === 'delete' ? 'Pages to delete' : 'Pages to extract';
  clearResult();
  syncSel();
}
$('sp-modes').addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (b) setMode(b.dataset.mode); });
['sp-ranges', 'sp-n'].forEach((id) => $(id).addEventListener('input', () => { clearResult(); updateGo(); }));

/* Work out what to build: array of { name, pages:[1-based] } or { error } */
function plan() {
  const base = baseName(st.file.name);
  const m = st.mode;
  const N = st.pages;
  if (m === 'extract') {
    const pages = [...st.sel].sort((a, b) => a - b);
    if (!pages.length) return { error: 'Select at least one page to extract.' };
    return { outs: [{ name: base + '-pages-' + formatRanges(pages).replace(/, /g, '_').slice(0, 40) + '.pdf', pages }] };
  }
  if (m === 'delete') {
    if (!st.sel.size) return { error: 'Select the pages you want to delete.' };
    const pages = allPages().filter((p) => !st.sel.has(p));
    if (!pages.length) return { error: 'You cannot delete every page. Leave at least one.' };
    return { outs: [{ name: base + '-edited.pdf', pages }] };
  }
  if (m === 'rotate') return { outs: [{ name: base + '-rotated.pdf', pages: allPages() }] };
  if (m === 'ranges') {
    const r = parseGroups($('sp-ranges').value, N);
    if (r.error) return { error: r.error };
    return { outs: r.groups.map((g, i) => ({ name: base + '-part-' + String(i + 1).padStart(2, '0') + '-pages-' + (g.length > 1 ? g[0] + '-' + g[g.length - 1] : g[0]) + '.pdf', pages: g })) };
  }
  if (m === 'every') {
    const n = Math.floor(+$('sp-n').value);
    if (!(n >= 1)) return { error: 'Enter a number of pages of 1 or more.' };
    const outs = [];
    const w = String(Math.ceil(N / n)).length;
    for (let s = 1, i = 1; s <= N; s += n, i++) {
      const e = Math.min(N, s + n - 1);
      outs.push({ name: base + '-part-' + String(i).padStart(Math.max(2, w), '0') + '-pages-' + (e > s ? s + '-' + e : s) + '.pdf', pages: Array.from({ length: e - s + 1 }, (_, k) => s + k) });
    }
    return { outs };
  }
  const w = String(N).length;
  return { outs: allPages().map((p) => ({ name: base + '-page-' + String(p).padStart(Math.max(2, w), '0') + '.pdf', pages: [p] })) };
}

function updateGo() {
  if (!st.file) return;
  const p = plan();
  $('sp-go').disabled = st.busy || !!p.error;
  const hint = $('sp-hint');
  if (p.error) { hint.textContent = p.error; hint.classList.toggle('err', st.mode === 'ranges' || st.mode === 'every'); }
  else {
    const o = p.outs;
    const pg = o.reduce((s, x) => s + x.pages.length, 0);
    hint.textContent = o.length > 1 ? 'This will create ' + plural(o.length, 'PDF') + ' (' + plural(pg, 'page') + ' in total), downloaded as a ZIP.' : 'This will create 1 PDF with ' + plural(pg, 'page') + '.';
    hint.classList.remove('err');
  }
}

function clearResult() {
  const r = $('sp-result');
  r.hidden = true; r.textContent = '';
}

/* ---------- building ---------- */
async function run() {
  if (st.busy || !st.file) return;
  const p = plan();
  if (p.error) { setStatus(statusEl, p.error, true); return; }
  st.busy = true;
  clearResult();
  updateGo();
  const prog = $('sp-prog'), pb = $('sp-pb');
  prog.hidden = false; pb.style.width = '0%';
  try {
    const { PDFDocument, degrees } = needPdfLib();
    setStatus(statusEl, 'Preparing the PDF...');
    await tick();
    if (!st.src) {
      try { st.src = await PDFDocument.load(st.buf, { updateMetadata: false }); }
      catch (err) { throw new Error('This PDF could not be processed (' + ((err && err.message) || 'unknown error') + ').'); }
    }
    const outputs = [];
    for (let i = 0; i < p.outs.length; i++) {
      const o = p.outs[i];
      if (p.outs.length > 1) setStatus(statusEl, 'Creating file ' + (i + 1) + ' of ' + p.outs.length + '...');
      const out = await PDFDocument.create();
      out.setProducer('Free split PDF tool');
      out.setCreator('Free split PDF tool');
      const copied = await out.copyPages(st.src, o.pages.map((x) => x - 1));
      copied.forEach((pg, k) => {
        const add = st.rot[o.pages[k] - 1] || 0;
        if (add) pg.setRotation(degrees(((pg.getRotation().angle + add) % 360 + 360) % 360));
        out.addPage(pg);
      });
      const bytes = await out.save();
      outputs.push({ name: o.name, blob: new Blob([bytes], { type: 'application/pdf' }) });
      pb.style.width = Math.round(((i + 1) / p.outs.length) * 100) + '%';
      if (i % 3 === 2) await tick();
    }
    renderResults($('sp-result'), outputs, baseName(st.file.name) + '-split.zip');
    if (outputs.length === 1) {
      const sum = $('sp-result').querySelector('.pdf-sum');
      sum.textContent = '';
      sum.append(el('b', { text: 'Your PDF is ready' }), ' (' + plural(p.outs[0].pages.length, 'page') + ', ' + fmtSize(outputs[0].blob.size) + ')');
    }
    setStatus(statusEl, '');
  } catch (err) {
    setStatus(statusEl, err.message || 'Something went wrong while splitting.', true);
  }
  prog.hidden = true;
  st.busy = false;
  updateGo();
}

/* ---------- wiring ---------- */
wireDrop($('sp-drop'), $('sp-file'), $('sp-pick'), loadFile);
$('sp-another').addEventListener('click', () => { if (!st.busy) reset(false); });
$('sp-go').addEventListener('click', run);
window.__sp = st;
