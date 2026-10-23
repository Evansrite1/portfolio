import { $, fmtSize, plural, tick, el, setStatus, wireDrop, needPdfLib, openPdf, createThumbs, parseRanges, enableReorder, moveItem, renderResults, iconButton, icon } from '/tools/pdfcommon.js';

const items = [];
let uid = 0;
let busy = false;
const list = $('mp-list');
const statusEl = $('mp-status');

async function addFiles(files) {
  if (busy) return;
  const errors = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    setStatus(statusEl, 'Reading ' + f.name + ' (' + (i + 1) + ' of ' + files.length + ')...');
    try {
      const { doc, buf, pages } = await openPdf(f);
      const it = { id: ++uid, file: f, doc, buf, pages, range: '', ok: true };
      buildItem(it);
      items.push(it);
      refresh();
    } catch (err) {
      errors.push(err.message);
    }
    await tick();
  }
  setStatus(statusEl, errors.join(' '), !!errors.length);
}

function selectedPages(it) {
  if (!it.range.trim()) return { pages: Array.from({ length: it.pages }, (_, i) => i + 1) };
  return parseRanges(it.range, it.pages);
}

function buildItem(it) {
  const li = el('li', { class: 'pdf-item', 'data-item': '', draggable: 'true' });
  const grip = el('span', { class: 'pdf-grip', 'aria-hidden': 'true', title: 'Drag to reorder' });
  grip.innerHTML = icon('grip');
  const th = el('div', { class: 'pdf-thumb' });
  const c = el('canvas', { 'data-page': '1', role: 'img', 'aria-label': 'First page of ' + it.file.name });
  th.append(c);
  it.thumbs = createThumbs(it.doc, {
    maxSide: 110,
    onRender(cv) {
      const k = Math.min(62 / parseFloat(cv.style.width), 78 / parseFloat(cv.style.height), 1);
      cv.style.width = Math.round(parseFloat(cv.style.width) * k) + 'px';
      cv.style.height = Math.round(parseFloat(cv.style.height) * k) + 'px';
    }
  });
  it.thumbs.observe(c);
  const meta = el('div', { class: 'pdf-meta' }, el('b', { text: it.file.name }));
  it.numEl = el('small');
  it.infoEl = el('small', { text: plural(it.pages, 'page') + ', ' + fmtSize(it.file.size) });
  const rng = el('div', { class: 'rng' });
  const inp = el('input', { type: 'text', id: 'mp-r-' + it.id, placeholder: 'All pages', autocomplete: 'off', spellcheck: 'false' });
  const lab = el('label', { for: 'mp-r-' + it.id, text: 'Pages to use' });
  it.msgEl = el('small', { class: 'help', role: 'status' });
  inp.addEventListener('input', () => {
    it.range = inp.value;
    const r = selectedPages(it);
    it.ok = !r.error;
    inp.setAttribute('aria-invalid', r.error ? 'true' : 'false');
    it.msgEl.textContent = r.error ? r.error : (it.range.trim() ? r.pages.length + ' of ' + it.pages + ' pages will be used' : '');
    it.msgEl.classList.toggle('err', !!r.error);
    refresh();
    clearResult();
  });
  rng.append(lab, inp, it.msgEl);
  meta.append(it.numEl, it.infoEl, rng);
  const acts = el('div', { class: 'pdf-acts' });
  it.upBtn = iconButton('up', 'Move up', () => move(it, -1));
  it.downBtn = iconButton('down', 'Move down', () => move(it, 1));
  const del = iconButton('trash', 'Remove ' + it.file.name, () => {
    items.splice(items.indexOf(it), 1);
    it.thumbs.destroy();
    it.doc.destroy();
    it.li.remove();
    refresh();
    clearResult();
  }, 'del');
  acts.append(it.upBtn, it.downBtn, del);
  li.append(grip, th, meta, acts);
  it.li = li;
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
  let total = 0, bad = false;
  items.forEach((it, i) => {
    it.numEl.textContent = 'File ' + (i + 1);
    it.upBtn.disabled = i === 0;
    it.downBtn.disabled = i === items.length - 1;
    const r = selectedPages(it);
    if (r.error) bad = true; else total += r.pages.length;
  });
  $('mp-work').hidden = !items.length;
  const cnt = $('mp-count');
  cnt.textContent = '';
  if (items.length) cnt.append(el('b', { text: plural(items.length, 'PDF') }), ' added. The merged PDF will have ', el('b', { text: plural(total, 'page') }), '.');
  $('mp-go').disabled = busy || items.length < 1 || bad;
  $('mp-go').textContent = items.length === 1 ? 'Save as new PDF' : 'Merge PDFs';
}

function clearResult() {
  const r = $('mp-result');
  r.hidden = true; r.textContent = '';
}

async function merge() {
  if (busy || !items.length) return;
  busy = true;
  clearResult();
  refresh();
  const prog = $('mp-prog'), pb = $('mp-pb');
  prog.hidden = false; pb.style.width = '0%';
  try {
    const { PDFDocument } = needPdfLib();
    const out = await PDFDocument.create();
    out.setProducer('Free merge PDF tool');
    out.setCreator('Free merge PDF tool');
    let pagesDone = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      setStatus(statusEl, 'Merging ' + it.file.name + ' (' + (i + 1) + ' of ' + items.length + ')...');
      await tick();
      let src;
      try {
        src = await PDFDocument.load(it.buf, { ignoreEncryption: false, updateMetadata: false });
      } catch (err) {
        const enc = /encrypt/i.test(err && err.message);
        throw new Error(enc ? '"' + it.file.name + '" is password protected and cannot be merged. Remove its password first.' : '"' + it.file.name + '" could not be merged because it looks damaged (' + ((err && err.message) || 'unknown error') + '). Remove it from the list and try again.');
      }
      const r = selectedPages(it);
      const idx = r.pages.map((p) => p - 1);
      const copied = await out.copyPages(src, idx);
      copied.forEach((p) => out.addPage(p));
      pagesDone += copied.length;
      pb.style.width = Math.round(((i + 1) / items.length) * 90) + '%';
    }
    setStatus(statusEl, 'Saving the merged PDF...');
    await tick();
    const bytes = await out.save();
    pb.style.width = '100%';
    const blob = new Blob([bytes], { type: 'application/pdf' });
    renderResults($('mp-result'), [{ name: 'merged.pdf', blob }]);
    const sum = $('mp-result').querySelector('.pdf-sum');
    sum.textContent = '';
    sum.append(el('b', { text: 'Your merged PDF is ready' }), ' (' + plural(pagesDone, 'page') + ', ' + fmtSize(blob.size) + ')');
    setStatus(statusEl, '');
  } catch (err) {
    setStatus(statusEl, err.message || 'Something went wrong while merging.', true);
  }
  prog.hidden = true;
  busy = false;
  refresh();
}

wireDrop($('mp-drop'), $('mp-file'), $('mp-pick'), addFiles);
$('mp-add').addEventListener('click', () => $('mp-file').click());
$('mp-clear').addEventListener('click', () => {
  items.forEach((it) => { it.thumbs.destroy(); it.doc.destroy(); });
  items.length = 0; list.textContent = '';
  refresh(); clearResult(); setStatus(statusEl, '');
});
$('mp-go').addEventListener('click', merge);
enableReorder(list, (from, to) => { moveItem(items, from, to); refresh(); clearResult(); });
window.__mpItems = items;
refresh();
