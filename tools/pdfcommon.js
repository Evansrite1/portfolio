/* Shared helpers for the PDF tools (image to PDF, merge PDF, split PDF).
   Everything runs in the browser. Files are never uploaded. */

export const $ = (id) => document.getElementById(id);

export function fmtSize(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576 >= 10 ? Math.round(bytes / 1048576) : (bytes / 1048576).toFixed(1)) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
/* Let the page breathe, but only if we have been busy for a while. MessageChannel is not slowed down in background tabs. */
let lastYield = 0;
const chan = new MessageChannel();
let chanWaiters = [];
chan.port1.onmessage = () => { const w = chanWaiters; chanWaiters = []; w.forEach((f) => f()); };
export function tick() {
  const now = performance.now();
  if (now - lastYield < 40) return Promise.resolve();
  return new Promise((r) => { chanWaiters.push(() => { lastYield = performance.now(); r(); }); chan.port2.postMessage(0); });
}

export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const k in attrs || {}) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
}

export function setStatus(node, msg, bad) {
  node.textContent = msg || '';
  node.classList.toggle('err', !!bad);
}

export function baseName(name) {
  return String(name || 'document').replace(/\.[^.\\/]+$/, '').replace(/[^\w\-. ()]+/g, '_').slice(0, 80) || 'document';
}

/* ---------- saving ---------- */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ---------- drop zone ---------- */
export function wireDrop(drop, input, pick, onFiles) {
  pick.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { const f = [...input.files]; input.value = ''; if (f.length) onFiles(f); });
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = [...(e.dataTransfer ? e.dataTransfer.files : [])]; if (f.length) onFiles(f); });
}

/* ---------- libraries ---------- */
export function needPdfLib() {
  if (!window.PDFLib) throw new Error('The PDF engine did not load. Reload the page and try again.');
  return window.PDFLib;
}

let pdfjsP = null;
export function loadPdfjs() {
  if (!pdfjsP) {
    pdfjsP = import('/tools/vendor/pdfjs/pdf.min.mjs').then((m) => {
      m.GlobalWorkerOptions.workerSrc = '/tools/vendor/pdfjs/pdf.worker.min.mjs';
      return m;
    });
  }
  return pdfjsP;
}

/* Open a PDF file for reading and thumbnails. Throws an Error with a plain message. */
export async function openPdf(file) {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  if (buf.byteLength < 8) throw new Error('"' + file.name + '" is empty or is not a PDF.');
  const head = new Uint8Array(buf, 0, Math.min(1024, buf.byteLength));
  let isPdf = false;
  for (let i = 0; i + 4 < head.length; i++) { if (head[i] === 37 && head[i + 1] === 80 && head[i + 2] === 68 && head[i + 3] === 70) { isPdf = true; break; } }
  if (!isPdf) throw new Error('"' + file.name + '" is not a PDF file.');
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
  } catch (err) {
    const n = err && err.name;
    if (n === 'PasswordException') throw new Error('"' + file.name + '" is password protected. Remove the password first (open it in your PDF viewer and save a copy without a password), then add it again.');
    if (n === 'InvalidPDFException' || n === 'FormatError' || n === 'MissingPDFException' || n === 'UnexpectedResponseException') throw new Error('"' + file.name + '" looks damaged and cannot be read.');
    throw new Error('"' + file.name + '" could not be opened (' + ((err && err.message) || 'unknown error') + ').');
  }
  if (!doc.numPages) { doc.destroy(); throw new Error('"' + file.name + '" has no pages.'); }
  return { doc, buf, pages: doc.numPages };
}

/* ---------- lazy page thumbnails ---------- */
export function createThumbs(doc, opts) {
  const maxSide = (opts && opts.maxSide) || 200;
  const onRender = opts && opts.onRender;
  const queue = [];
  let active = 0, dead = false;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !e.target._queued) { e.target._queued = true; io.unobserve(e.target); queue.push(e.target); }
    }
    pump();
  }, { rootMargin: '400px' });
  function pump() {
    while (!dead && active < 2 && queue.length) {
      const c = queue.shift();
      active++;
      draw(c).finally(() => { active--; pump(); });
    }
  }
  async function draw(c) {
    try {
      const page = await doc.getPage(+c.dataset.page);
      const v1 = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const s = (maxSide * dpr) / Math.max(v1.width, v1.height);
      const vp = page.getViewport({ scale: s });
      c.width = Math.max(1, Math.round(vp.width));
      c.height = Math.max(1, Math.round(vp.height));
      c.style.width = Math.max(1, Math.round(vp.width / dpr)) + 'px';
      c.style.height = Math.max(1, Math.round(vp.height / dpr)) + 'px';
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      page.cleanup();
      c.classList.add('done');
      if (onRender) onRender(c);
    } catch (err) {
      if (!dead) c.classList.add('fail');
    }
  }
  return {
    observe(c) { io.observe(c); },
    destroy() { dead = true; io.disconnect(); queue.length = 0; }
  };
}

/* ---------- page ranges ---------- */
/* "1-3, 5, 8-" -> groups [[1,2,3],[5],[8,9,...max]]. Returns { groups } or { error }. */
export function parseGroups(text, max) {
  const src = String(text || '').trim().toLowerCase();
  if (!src) return { error: 'Type the pages you want, for example 1-3, 5.' };
  if (src === 'all') return { groups: [Array.from({ length: max }, (_, i) => i + 1)] };
  const groups = [];
  for (const raw of src.split(/[,;\s]+/)) {
    if (!raw) continue;
    const m = raw.match(/^(\d+)?(?:-(\d+)?)?$/);
    if (!m || (!m[1] && !m[2])) return { error: '"' + raw + '" is not a valid page or range. Use numbers like 1-3, 5.' };
    const hasDash = raw.includes('-');
    let a = m[1] ? +m[1] : 1;
    let b = hasDash ? (m[2] ? +m[2] : max) : a;
    if (a < 1 || b < 1) return { error: 'Page numbers start at 1.' };
    if (a > max) return { error: 'Page ' + a + ' is beyond the last page (' + max + ').' };
    if (b > max) return { error: 'Page ' + b + ' is beyond the last page (' + max + ').' };
    if (a > b) return { error: 'The range "' + raw + '" runs backwards. Write it as ' + b + '-' + a + '.' };
    const g = [];
    for (let p = a; p <= b; p++) g.push(p);
    groups.push(g);
  }
  if (!groups.length) return { error: 'Type the pages you want, for example 1-3, 5.' };
  return { groups };
}

export function parseRanges(text, max) {
  const r = parseGroups(text, max);
  if (r.error) return r;
  return { pages: [].concat(...r.groups) };
}

/* [1,2,3,5] -> "1-3, 5" */
export function formatRanges(pages) {
  const p = [...pages].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < p.length;) {
    let j = i;
    while (j + 1 < p.length && p[j + 1] === p[j] + 1) j++;
    out.push(j > i ? p[i] + '-' + p[j] : '' + p[i]);
    i = j + 1;
  }
  return out.join(', ');
}

/* ---------- drag to reorder a list ---------- */
/* Every direct child of `list` is draggable. onMove(fromIndex, toIndex) is called after a drop. */
export function enableReorder(list, onMove) {
  let from = -1;
  const idx = (n) => [...list.children].indexOf(n.closest('[data-item]'));
  list.addEventListener('dragstart', (e) => {
    const it = e.target.closest && e.target.closest('[data-item]');
    if (!it || it.parentNode !== list) return;
    from = idx(it);
    it.classList.add('dragging');
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(from)); } catch (x) { /* ignore */ } }
  });
  list.addEventListener('dragend', () => {
    from = -1;
    [...list.children].forEach((c) => c.classList.remove('dragging', 'over-before', 'over-after'));
  });
  list.addEventListener('dragover', (e) => {
    if (from < 0) return;
    const it = e.target.closest && e.target.closest('[data-item]');
    if (!it) return;
    e.preventDefault();
    [...list.children].forEach((c) => c.classList.remove('over-before', 'over-after'));
    const i = idx(it);
    if (i !== from) it.classList.add(i < from ? 'over-before' : 'over-after');
  });
  list.addEventListener('drop', (e) => {
    if (from < 0) return;
    const it = e.target.closest && e.target.closest('[data-item]');
    if (!it) return;
    e.preventDefault();
    const to = idx(it);
    const f = from;
    from = -1;
    [...list.children].forEach((c) => c.classList.remove('dragging', 'over-before', 'over-after'));
    if (to >= 0 && to !== f) onMove(f, to);
  });
}

export function moveItem(arr, from, to) {
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}

/* ---------- results list (one file = Download, several = ZIP too) ---------- */
export function renderResults(box, outputs, zipName) {
  box.textContent = '';
  box.hidden = false;
  const total = outputs.reduce((s, o) => s + o.blob.size, 0);
  const head = el('p', { class: 'pdf-sum' });
  head.append(el('b', { text: plural(outputs.length, 'file') + ' ready' }), ' (' + fmtSize(total) + ')');
  box.append(head);
  const btns = el('div', { class: 'btns' });
  if (outputs.length > 1) {
    const zbtn = el('button', { type: 'button', class: 'btn primary', text: 'Download all as ZIP' });
    zbtn.addEventListener('click', async () => {
      zbtn.disabled = true;
      const old = zbtn.textContent;
      zbtn.textContent = 'Zipping...';
      try {
        const blob = await makeZip(outputs);
        saveBlob(blob, zipName || 'pdf-files.zip');
      } catch (err) {
        head.append(' ', el('span', { class: 'err', text: 'Could not make the ZIP: ' + err.message }));
      }
      zbtn.disabled = false;
      zbtn.textContent = old;
    });
    btns.append(zbtn);
  } else {
    const b = el('button', { type: 'button', class: 'btn primary', text: 'Download PDF' });
    b.addEventListener('click', () => saveBlob(outputs[0].blob, outputs[0].name));
    btns.append(b);
  }
  box.append(btns);
  if (outputs.length > 1) {
    const ul = el('ul', { class: 'pdf-outs' });
    const shown = outputs.slice(0, 200);
    for (const o of shown) {
      const li = el('li', {}, el('span', { text: o.name }), el('small', { text: fmtSize(o.blob.size) }));
      const b = el('button', { type: 'button', class: 'btn', text: 'Download' });
      b.setAttribute('aria-label', 'Download ' + o.name);
      b.addEventListener('click', () => saveBlob(o.blob, o.name));
      li.append(b);
      ul.append(li);
    }
    box.append(ul);
    if (outputs.length > shown.length) box.append(el('p', { class: 'help', text: 'Showing the first 200 files. The ZIP contains all ' + outputs.length + '.' }));
  }
}

export async function makeZip(outputs) {
  if (!window.fflate) throw new Error('The ZIP engine did not load. Reload the page and try again.');
  const files = {};
  const seen = new Set();
  for (const o of outputs) {
    let n = o.name, k = 1;
    while (seen.has(n)) { n = o.name.replace(/(\.[^.]*)?$/, '-' + (++k) + '$1'); }
    seen.add(n);
    files[n] = new Uint8Array(await o.blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    window.fflate.zip(files, { level: 0 }, (err, data) => {
      if (err) reject(err);
      else resolve(new Blob([data], { type: 'application/zip' }));
    });
  });
}

/* ---------- small icons ---------- */
const ICONS = {
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  rot: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  rotl: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>'
};
export function icon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
}
export function iconButton(name, label, onclick, extraClass) {
  const b = el('button', { type: 'button', class: 'pdf-ib' + (extraClass ? ' ' + extraClass : ''), 'aria-label': label, title: label });
  b.innerHTML = icon(name);
  b.addEventListener('click', onclick);
  return b;
}
