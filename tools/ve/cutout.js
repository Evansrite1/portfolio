/* Taking the background away, for the video editor.

   The editor uses the same small AI model the background remover tool uses. It finds the main
   subject on its own, and then you can paint on the result to add or take away bits, so you
   can choose exactly what stays.

   The model runs on this computer. Nothing is uploaded. */
const BASE = '/tools/vendor/';
const SIZE = 320, MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

let ortLoad = null, session = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('The AI engine did not load.'));
    document.head.appendChild(s);
  });
}

/* Brings the model in. It is about 15 MB and comes once, then the browser keeps it. */
export function ensureModel(onStatus) {
  if (session) return Promise.resolve(session);
  if (!ortLoad) {
    if (onStatus) onStatus('Getting the AI engine ready...');
    ortLoad = loadScript(BASE + 'ort/ort.min.js').then(() => {
      window.ort.env.wasm.wasmPaths = BASE + 'ort/';
      window.ort.env.wasm.numThreads = 1;
      window.ort.env.wasm.proxy = false;
      return window.ort.InferenceSession.create(BASE + 'models/u2netp.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    }).then((s) => { session = s; return s; }, (e) => { ortLoad = null; throw e; });
  }
  return ortLoad;
}

/* Finds the subject in a picture.
   Returns a canvas the size of the picture, white where the subject is and black where it is not. */
export async function findSubject(canvas, onStatus) {
  const s = await ensureModel(onStatus);
  if (onStatus) onStatus('Finding the subject...');
  const small = document.createElement('canvas');
  small.width = small.height = SIZE;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(canvas, 0, 0, SIZE, SIZE);
  const px = sctx.getImageData(0, 0, SIZE, SIZE).data;
  const plane = SIZE * SIZE;
  const f = new Float32Array(3 * plane);
  let mx = 1e-6;
  for (let i = 0; i < px.length; i += 4) mx = Math.max(mx, px[i], px[i + 1], px[i + 2]);
  for (let i = 0; i < plane; i++) {
    f[i] = (px[i * 4] / mx - MEAN[0]) / STD[0];
    f[plane + i] = (px[i * 4 + 1] / mx - MEAN[1]) / STD[1];
    f[2 * plane + i] = (px[i * 4 + 2] / mx - MEAN[2]) / STD[2];
  }
  const feeds = {};
  feeds[s.inputNames[0]] = new window.ort.Tensor('float32', f, [1, 3, SIZE, SIZE]);
  const res = await s.run(feeds);
  const out = res[s.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < out.length; k++) { if (out[k] < lo) lo = out[k]; if (out[k] > hi) hi = out[k]; }
  const span = Math.max(1e-6, hi - lo);
  const g = document.createElement('canvas');
  g.width = g.height = SIZE;
  const gctx = g.getContext('2d');
  const id = gctx.createImageData(SIZE, SIZE);
  for (let k = 0; k < out.length; k++) {
    const v = Math.round(((out[k] - lo) / span) * 255);
    id.data[k * 4] = id.data[k * 4 + 1] = id.data[k * 4 + 2] = v;
    id.data[k * 4 + 3] = 255;
  }
  gctx.putImageData(id, 0, 0);
  /* stretch it back up to the size of the picture, which keeps the edge smooth */
  const big = document.createElement('canvas');
  big.width = canvas.width; big.height = canvas.height;
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(g, 0, 0, big.width, big.height);
  return big;
}

/* Paints on the mask, to add a bit or take a bit away.
   mode is 'add' or 'erase'. */
export function paintMask(mask, x, y, radius, mode, strength) {
  const ctx = mask.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  const a = strength == null ? 1 : strength;
  g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* Softens the edge of the mask, so the cut does not look chopped. */
export function softenMask(mask, radius) {
  if (!radius) return mask;
  const w = mask.width, h = mask.height;
  const ctx = mask.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = d[i * 4] / 255;
  const tmp = new Float32Array(w * h);
  const r = Math.max(1, Math.round(radius));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0, n = 0;
    for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { sum += src[y * w + xx]; n++; } }
    tmp[y * w + x] = sum / n;
  }
  const out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let sum = 0, n = 0;
    for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { sum += tmp[yy * w + x]; n++; } }
    out[y * w + x] = sum / n;
  }
  for (let i = 0; i < w * h; i++) {
    const v = Math.round(Math.min(1, Math.max(0, out[i])) * 255);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return mask;
}

/* Takes the background away from a picture, using the mask.
   Returns a new picture with the background see-through. */
export function applyMask(src, mask) {
  const c = document.createElement('canvas');
  c.width = src.width || src.naturalWidth;
  c.height = src.height || src.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  return c;
}

/* Removes a flat colour from a picture, for green screen work.
   The picture is made see-through where the colour is close to the one given. */
export function keyOut(src, colour, tolerance) {
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const r0 = (colour >> 16) & 255, g0 = (colour >> 8) & 255, b0 = colour & 255;
  const tol = (tolerance == null ? 60 : tolerance) * 2.2;
  for (let p = 0; p < d.length; p += 4) {
    const dr = d[p] - r0, dg = d[p + 1] - g0, db = d[p + 2] - b0;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < tol) { d[p + 3] = 0; continue; }
    if (dist < tol * 1.6) {
      const a = (dist - tol) / (tol * 0.6);
      d[p + 3] = Math.round(d[p + 3] * Math.min(1, a));
      const k = 1 - a;
      d[p] = Math.max(0, Math.min(255, (d[p] - k * r0) / Math.max(0.2, a)));
      d[p + 1] = Math.max(0, Math.min(255, (d[p + 1] - k * g0) / Math.max(0.2, a)));
      d[p + 2] = Math.max(0, Math.min(255, (d[p + 2] - k * b0) / Math.max(0.2, a)));
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* The colour under a point, for picking a key colour. */
export function pickColour(src, x, y) {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, 1, 1, Math.floor(x), Math.floor(y), 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  return (d[0] << 16) | (d[1] << 8) | d[2];
}
