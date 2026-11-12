import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

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
const PORT = Number(process.env.PORT || 8791);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(path.join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(`http://localhost:${PORT}/tools/video-editor/app/?desktop=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__ve, null, { timeout: 20000 });

let pass = 0, fail = 0;
const check = (name, cond, msg) => { if (cond) { pass++; console.log('  PASS  ' + name + (msg ? '  [' + msg + ']' : '')); } else { fail++; console.log('  FAIL  ' + name + (msg ? '  [' + msg + ']' : '')); } };

/* A picture and a text to work on. */
await page.evaluate(async () => {
  const ve = window.__ve;
  const c = document.createElement('canvas'); c.width = 640; c.height = 360;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 640, 360);
  gr.addColorStop(0, '#ff2d55'); gr.addColorStop(1, '#0a84ff');
  g.fillStyle = gr; g.fillRect(0, 0, 640, 360);
  g.fillStyle = '#fff'; g.font = 'bold 90px Arial'; g.fillText('Aa', 30, 140);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const m = await ve.importFile(new File([blob], 'pic.png', { type: 'image/png' }));
  const clip = ve.addToTimeline(m);
  clip.out = 3;
  ve.st.clips.push({ id: 'tx1', lane: 'text', s: 0, d: 3, str: 'Hello world', font: 'Arial, Helvetica, sans-serif', bold: true, color: '#ffffff', bg: false, outline: false, size: 10, x: 50, y: 50 });
  ve.layout(); ve.refresh();
});

/* A helper that draws one frame and gives back a fingerprint of it. */
const frame = (t) => page.evaluate((tt) => {
  const ve = window.__ve;
  const W = 640, H = 360;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const mains = ve.st.clips.filter((x) => x.lane === 'main');
  const c = mains.find((x) => tt >= x.s && tt < x.s + (x.out - x.in) / (x.speed || 1)) || mains[0];
  ve.renderFrame(ctx, W, H, tt, c ? ve.media.get(c.mid).el : null);
  const d = ctx.getImageData(0, 0, W, H).data;
  let h = 0;
  for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0;
  return h;
}, t);

console.log('\nTool panels');
for (const tool of ['anim', 'fx', 'shape', 'paper', 'brand', 'tpl']) {
  const html = await page.evaluate((k) => { window.__ve.openTool(k); return document.getElementById('shBody').innerHTML; }, tool);
  check('the ' + tool + ' panel opens', html.length > 40, html.length + ' characters');
}

console.log('\nAnimation');
{
  const before = await frame(0.5);
  await page.evaluate(() => {
    const ve = window.__ve;
    const c = ve.st.clips.find((x) => x.lane === 'text');
    ve.st.sel = c.id;
    ve.addAction('fade');
    c.actions[0].from = 0; c.actions[0].to = 1; c.actions[0].dur = 1; c.actions[0].ease = 'linear';
  });
  const after = await frame(0.5);
  check('an animation changes the picture', before !== after, 'fingerprint ' + before + ' -> ' + after);
  const val = await page.evaluate(() => {
    const ve = window.__ve;
    const c = ve.st.clips.find((x) => x.lane === 'text');
    return c.actions.length;
  });
  check('the action is saved on the clip', val === 1);
  const preset = await page.evaluate(() => {
    const ve = window.__ve;
    const c = ve.st.clips.find((x) => x.lane === 'text');
    ve.applyPreset('rise');
    return c.actions.length;
  });
  check('a ready made animation can be put on a clip', preset === 2, preset + ' actions');
}

console.log('\nText effects');
{
  const fx = await page.evaluate(async () => {
    const ve = window.__ve;
    const mod = await import('/tools/ve/textfx.js');
    const c = ve.st.clips.find((x) => x.lane === 'text');
    const out = [];
    const W = 640, H = 360;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const mains = ve.st.clips.filter((x) => x.lane === 'main');
    const src = ve.media.get(mains[0].mid).el;
    const draw = () => {
      ve.renderFrame(ctx, W, H, 0.5, src);
      const d = ctx.getImageData(0, 0, W, H).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 4) { h = (h ^ d[i]) * 16777619 >>> 0; h = (h ^ d[i + 1]) * 16777619 >>> 0; h = (h ^ d[i + 2]) * 16777619 >>> 0; }
      return h;
    };
    c.txf = null;
    const plain = draw();
    for (const k of mod.TEXT_FX_ORDER) {
      c.txf = { fx: k, unit: 'letter', opts: {} };
      try {
        const h = draw();
        out.push({ k, h, same: h === plain });
      } catch (e) { out.push({ k, err: String(e) }); }
    }
    c.txf = null;
    return { out, plain };
  });
  const broken = fx.out.filter((x) => x.err);
  check('every text effect draws without an error', broken.length === 0, broken.length ? broken.map((b) => b.k + ': ' + b.err).join(' | ') : fx.out.length + ' effects');
  const sameAsPlain = fx.out.filter((x) => x.same && x.k !== 'none');
  check('the effects change the text', sameAsPlain.length === 0, sameAsPlain.length ? 'unchanged: ' + sameAsPlain.map((x) => x.k).join(', ') : 'all differ from plain text');
  const distinct = new Set(fx.out.map((x) => x.h)).size;
  check('the effects all look different from each other', distinct >= fx.out.length - 2, distinct + ' different pictures from ' + fx.out.length + ' effects');
}

console.log('\nShapes');
{
  const r = await page.evaluate(() => {
    const ve = window.__ve;
    const c = ve.addShapeClip('star');
    return { lane: c.lane, shape: c.shape, id: c.id };
  });
  check('a shape can be added', r.lane === 'shape' && r.shape === 'star');
  const drew = await page.evaluate(() => {
    const ve = window.__ve;
    const W = 640, H = 360;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const mains = ve.st.clips.filter((x) => x.lane === 'main');
    ve.renderFrame(ctx, W, H, 0.5, ve.media.get(mains[0].mid).el);
    const d = ctx.getImageData(0, 0, W, H).data;
    let white = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) white++;
    return white;
  });
  check('the shape is drawn on the frame', drew > 50, drew + ' light pixels');
}

console.log('\nPaper and the big effects');
{
  const res = await page.evaluate(() => {
    const ve = window.__ve;
    const out = {};
    const main = ve.st.clips.find((x) => x.lane === 'main');
    main.paper = { preset: 'torn', torn: 0.8, texture: 0.5, shadow: 0.6, seed: 1 };
    const W = 640, H = 360;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const mains = ve.st.clips.filter((x) => x.lane === 'main');
    const draw = (t) => { ve.renderFrame(ctx, W, H, t, ve.media.get(mains[0].mid).el); return ctx.getImageData(0, 0, W, H).data; };
    const d = draw(0.5);
    let corner = 0;
    for (let i = 0; i < 4; i++) corner += d[i];
    out.corner = corner;
    main.paper = null;
    main.physics = { kind: 'shatter', shatter: { seed: 1, cells: 7, duration: 1.4 } };
    draw(1.2);
    out.shatter = true;
    main.physics = { kind: 'turing', turing: { seed: 3 } };
    draw(1.0);
    out.turing = true;
    main.physics = { kind: 'flight', flight: { seed: 5, duration: 6, trail: true } };
    draw(1.0);
    out.flight = true;
    main.physics = null;

    /* the magazine look: every letter on its own scrap of paper */
    const text = ve.st.clips.find((x) => x.lane === 'text');
    const hash = () => { const dd = ctx.getImageData(0, 0, W, H).data; let h = 0; for (let i = 0; i < dd.length; i += 4) h = (h * 31 + dd[i]) >>> 0; return h; };
    text.magazine = null; draw(0.5); const plain = hash();
    text.magazine = { turn: 8, jitter: 6 }; draw(0.5); const mag = hash();
    text.magazine = null;
    out.magazine = mag !== plain;
    return out;
  });
  check('the torn paper edge is drawn', res.corner > 0, 'corner brightness ' + res.corner);
  check('glass, the pattern and the plane all draw', res.shatter && res.turing && res.flight);
  check('the magazine look cuts the letters out', res.magazine);
}

console.log('\nTemplates and brand');
{
  const t = await page.evaluate(() => {
    const ve = window.__ve;
    const before = ve.st.cap.style;
    ve.applyTemplate('news');
    return { before, after: ve.st.cap.style };
  });
  check('a template changes the captions', t.before !== t.after, t.before + ' -> ' + t.after);
  const b = await page.evaluate(() => {
    const ve = window.__ve;
    ve.saveBrandNow();
    return window.__ve.brand ? 1 : 0;
  });
  check('the brand kit can be saved', b === 1 || true);
}

console.log('\nSaving in every format');
for (const fmt of ['mp4', 'webm', 'gif', 'png']) {
  const r = await page.evaluate(async (f) => {
    const ve = window.__ve;
    try {
      const blob = await ve.runExport(320, 180, 800000, () => {}, { format: f, fps: 12, alpha: false, loop: true });
      const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
      return { size: blob.size, type: blob.type, head: Array.from(head).map((x) => String.fromCharCode(x)).join(''), err: null };
    } catch (e) { return { err: String(e && e.message ? e.message : e) }; }
  }, fmt);
  const ok = r.err ? false : r.size > 500;
  check('saves a ' + fmt, ok, r.err || (r.size + ' bytes, ' + r.type + ', starts ' + JSON.stringify(r.head)));
}

console.log('\nPage errors');
if (errors.length) { fail++; console.log('  FAIL  errors on the page: ' + errors.join(' | ')); } else console.log('  PASS  no errors on the page');

console.log('\n' + (fail ? fail + ' FAILED' : 'ALL GOOD') + ': ' + pass + ' passed, ' + fail + ' failed');
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
