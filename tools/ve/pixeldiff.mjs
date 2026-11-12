/* Compares the frames the editor draws now against the frames it drew before a change.
   Run it from the folder that holds the portfolio:

     npm i playwright && npx playwright install chromium
     node tools/ve/pixeldiff.mjs

   It serves the portfolio, opens the editor twice, once with the version in the last commit and
   once with the version on disk, draws the same moments in time in both and compares the
   pictures byte for byte. Any difference is printed with the area of the frame that changed.

   Use it after touching renderFrame, the layer compositor or the text layout, to be sure the
   editor still draws exactly what it drew before. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/* Playwright is not a dependency of the portfolio, so it is looked for rather than assumed.
   PLAYWRIGHT_PATH can point at the folder that holds it. */
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (e) {
  const require = createRequire(import.meta.url);
  const dirs = [process.env.PLAYWRIGHT_PATH, path.join(process.cwd(), 'node_modules')].filter(Boolean);
  let found = false;
  for (const dir of dirs) {
    try { ({ chromium } = require(path.join(dir, 'playwright'))); found = true; break; } catch (e2) { /* try the next one */ }
  }
  if (!found) {
    console.error('Playwright was not found. Install it first:\n\n  npm i playwright && npx playwright install chromium\n');
    process.exit(2);
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT || 8785);
const BASE = process.env.BASE_REF || 'HEAD';

const origJs = execSync(`git -C "${ROOT}" show ${BASE}:tools/veditor.js`, { maxBuffer: 1e8 }).toString();
const appHtml = await readFile(path.join(ROOT, 'tools/video-editor/app/index.html'), 'utf8');
const origHtml = appHtml.replace('/tools/veditor.js', '/tools/veditor-orig.js');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.onnx': 'application/octet-stream',
};

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/tools/veditor-orig.js') { res.writeHead(200, { 'content-type': MIME['.js'] }); return res.end(origJs); }
  if (p === '/tools/video-editor/app/orig.html') { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(origHtml); }
  if (p === '/') p = '/index.html';
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));

/* The moments in time and the pictures to draw in each one. */
const SCENARIOS = ['plain', 'text', 'caption', 'transition', 'filter', 'ratio'];
const TIMES = [0, 0.15, 0.3, 0.5, 0.8, 1.1, 1.6, 2.2, 3.0, 4.0];

const setup = async (scenario) => {
  const ve = window.__ve;
  ve.st.clips.length = 0;
  ve.st.cap = { style: 'mix', size: 6, y: 76, accent: '', anim: 'pop', emph: true, chunk: '3' };
  const mk = async (paint) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const g = c.getContext('2d'); paint(g, 640, 360);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return ve.importFile(new File([blob], 'pic.png', { type: 'image/png' }));
  };
  const mA = await mk((g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#ff2d55'); gr.addColorStop(.5, '#0a84ff'); gr.addColorStop(1, '#ffd60a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = 'bold 90px Arial'; g.fillText('Aa', 30, 140);
    g.fillStyle = '#000'; g.beginPath(); g.arc(w - 70, 70, 46, 0, 7); g.fill();
  });
  const mB = await mk((g, w, h) => {
    g.fillStyle = '#1b1b2f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) { g.fillStyle = `hsl(${i * 30} 80% 55%)`; g.fillRect(i * (w / 12), 0, w / 12, h); }
  });
  const cA = ve.addToTimeline(mA), cB = ve.addToTimeline(mB);
  cA.out = 2; cB.s = 2; cB.out = 4;
  if (scenario === 'filter') { cA.filter = 'sepia(.35) saturate(1.3)'; cA.adj = { bri: 120, con: 90, sat: 160, temp: 30, vig: 40, zoom: 120 }; }
  if (scenario === 'transition') { cA.tr = 'zoom'; cB.tr = 'fade'; }
  if (scenario === 'ratio') ve.st.ratio = '9/16';
  if (scenario !== 'plain') {
    ve.st.clips.push({ id: 'tx1', lane: 'text', s: 0.2, d: 2, str: 'Hello\nWorld', font: 'Arial, Helvetica, sans-serif', bold: true, color: '#ffffff', bg: false, outline: false, size: 8, x: 50, y: 30 });
    ve.st.clips.push({ id: 'tx2', lane: 'text', s: 0.5, d: 1.5, str: 'Outlined text', font: 'Impact, "Arial Black", sans-serif', bold: true, color: '#ffd23f', bg: true, outline: true, size: 6, x: 30, y: 70 });
    ve.st.clips.push({ id: 'tx3', lane: 'text', s: 1.0, d: 1.5, str: 'Two  spaces  kept', font: 'Georgia, serif', bold: false, color: '#00ff88', bg: false, outline: false, size: 5, x: 50, y: 50 });
  }
  if (scenario === 'caption' || scenario === 'transition') {
    for (const style of ['pop', 'karaoke', 'highlight', 'neon', 'hollow', 'sunset', 'typewriter', 'mix']) {
      ve.st.cap.style = style;
      ve.st.clips.push({ id: 'cp' + style, lane: 'cap', s: 0.3, d: 0.8, str: 'the caption text here', words: null, mi: 0 });
    }
    ve.st.cap.style = 'mix';
  }
  ve.layout(); ve.refresh();
  return true;
};

const browser = await chromium.launch();
const pages = {};
for (const [name, url] of [
  ['old', `http://localhost:${PORT}/tools/video-editor/app/orig.html?desktop=1`],
  ['new', `http://localhost:${PORT}/tools/video-editor/app/?desktop=1`],
]) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__ve, null, { timeout: 20000 });
  pages[name] = { page, errors, frames: {} };
  for (const scenario of SCENARIOS) {
    await page.evaluate(setup, scenario);
    const W = scenario === 'ratio' ? 405 : 640, H = scenario === 'ratio' ? 720 : 360;
    for (const t of TIMES) {
      const raw = await page.evaluate(({ t, W, H }) => {
        const ve = window.__ve;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true });
        const mains = ve.st.clips.filter((x) => x.lane === 'main');
        let m = null;
        for (const x of mains) { const d = (x.out - x.in) / (x.speed || 1); if (t >= x.s && t < x.s + d) { m = x; break; } }
        if (!m) m = mains[mains.length - 1];
        ve.renderFrame(g, W, H, t, m ? ve.media.get(m.mid).el : null);
        const bytes = g.getImageData(0, 0, W, H).data;
        let s = ''; const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        return btoa(s);
      }, { t, W, H });
      pages[name].frames[scenario + '@' + t] = Buffer.from(raw, 'base64');
    }
  }
  await page.close();
}

let bad = 0;
const diffs = [];
for (const key of Object.keys(pages.old.frames)) {
  const a = pages.old.frames[key], b = pages.new.frames[key];
  if (!b || a.length !== b.length) { diffs.push({ key, note: 'missing or a different size' }); bad++; continue; }
  let n = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, W = 640;
  for (let i = 0; i < a.length; i += 4) {
    let d = 0;
    for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a[i + k] - b[i + k]));
    if (d > 0) {
      n++; if (d > max) max = d;
      const p = i / 4, x = p % W, y = Math.floor(p / W);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (n) { bad++; diffs.push({ key, pixels: n, maxChange: max, area: [x0, y0, x1, y1] }); }
}

console.log('frames compared:', Object.keys(pages.old.frames).length);
console.log('frames that differ:', bad);
for (const n of ['old', 'new']) if (pages[n].errors.length) console.log(n + ' page errors:', pages[n].errors);
if (diffs.length) console.log(JSON.stringify(diffs, null, 1));
else console.log('identical, pixel for pixel');

await browser.close();
server.close();
process.exit(bad ? 1 : 0);
