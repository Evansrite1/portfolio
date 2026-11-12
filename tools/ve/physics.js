/* The heavier effects for the video editor.

   Glass that breaks, a pattern that grows on its own, words written along a street, and a
   paper plane over a map.

   These are the ones that take the most work, so they are kept together and away from the
   everyday drawing. The street and the map are made from shapes the editor draws itself, so
   there is no map to download and nothing to pay for. */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function rand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------ glass that breaks */
const shardCache = new Map();

/* Splits a picture into pieces of broken glass.
   The pieces are made once and kept, so the glass breaks the same way every time. */
export function glassShards(w, h, seed, cells) {
  const key = w + 'x' + h + ':' + seed + ':' + cells;
  if (shardCache.has(key)) return shardCache.get(key);
  const nx = Math.max(3, Math.min(14, cells || 7));
  const ny = Math.max(3, Math.min(14, Math.round((cells || 7) * h / w)));
  const pts = [];
  for (let j = 0; j <= ny; j++) {
    pts.push([]);
    for (let i = 0; i <= nx; i++) {
      const edge = i === 0 || j === 0 || i === nx || j === ny;
      const jx = edge ? 0 : (rand(seed + i * 3.1 + j * 7.7) - 0.5) * (w / nx) * 0.85;
      const jy = edge ? 0 : (rand(seed + i * 5.3 + j * 2.9) - 0.5) * (h / ny) * 0.85;
      pts[j].push([(i * w) / nx + jx, (j * h) / ny + jy]);
    }
  }
  const shards = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i + 1], d = pts[j + 1][i];
      const flip = rand(seed + i * 11.3 + j * 13.9) > 0.5;
      const tris = flip ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
      for (const tri of tris) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
        const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        shards.push({ tri, cx, cy, r: rand(seed + cx * 0.07 + cy * 0.031), sp: 0.4 + rand(seed + cx * 0.013) * 1.6 });
      }
    }
  }
  shardCache.set(key, shards);
  return shards;
}

/* Breaks a picture into glass and lets the pieces fly apart.
   t is how far into the break we are, in seconds. */
export function drawShatter(ctx, src, W, H, t, opts) {
  opts = opts || {};
  const dur = opts.duration || 1.4;
  const p = clamp(t / dur, 0, 1);
  const sw = src.videoWidth || src.naturalWidth || src.width;
  const sh = src.videoHeight || src.naturalHeight || src.height;
  if (!sw || !sh) return;
  const s = Math.max(W / sw, H / sh);
  const dw = sw * s, dh = sh * s;
  const ox = (W - dw) / 2, oy = (H - dh) / 2;
  const shards = glassShards(sw, sh, opts.seed || 1, opts.cells);

  for (const sh2 of shards) {
    const dist = Math.hypot(sh2.cx / sw - 0.5, sh2.cy / sh - 0.5);
    const kick = Math.max(0, p - sh2.r * 0.35) / (1 - sh2.r * 0.35);
    const push = kick * kick * 420 * sh2.sp;
    const ang = Math.atan2(sh2.cy / sh - 0.5, sh2.cx / sw - 0.5);
    const rot = kick * kick * 2.2 * (sh2.r - 0.5) * 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ox + sh2.tri[0][0] * s, oy + sh2.tri[0][1] * s);
    for (let k = 1; k < 3; k++) ctx.lineTo(ox + sh2.tri[k][0] * s, oy + sh2.tri[k][1] * s);
    ctx.closePath();
    ctx.clip();
    ctx.translate(ox + sh2.cx * s, oy + sh2.cy * s);
    ctx.rotate(rot);
    ctx.translate(-(ox + sh2.cx * s), -(oy + sh2.cy * s));
    ctx.globalAlpha = clamp(1 - kick * 0.25, 0, 1);
    try { ctx.drawImage(src, ox, oy, dw, dh); } catch (e) { /* not ready */ }
    ctx.restore();
    /* the light along the edge of each piece */
    if (kick > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(kick * 0.55, 0, 1);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, W / 400);
      ctx.beginPath();
      ctx.moveTo(ox + sh2.tri[0][0] * s + Math.cos(ang) * push, oy + sh2.tri[0][1] * s + Math.sin(ang) * push);
      for (let k = 1; k < 3; k++) ctx.lineTo(ox + sh2.tri[k][0] * s + Math.cos(ang) * push, oy + sh2.tri[k][1] * s + Math.sin(ang) * push);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }
}

/* ------------------------------------------------------------------ a pattern that grows */
/* The pattern is a reaction between two chemicals, worked out one small square at a time.
   It looks like the patterns on the back of a cow, or the spots on a leopard. */
const turingCache = new Map();
function turingState(w, h, seed) {
  const key = w + 'x' + h + ':' + seed;
  if (turingCache.has(key)) return turingCache.get(key);
  const n = w * h;
  const u = new Float32Array(n).fill(1);
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (rand(seed + i * 0.013) > 0.996) v[i] = 1;
    if (rand(seed + i * 0.021) > 0.998) u[i] = 0.45;
  }
  const st = { u, v, u2: new Float32Array(n), v2: new Float32Array(n) };
  turingCache.set(key, st);
  return st;
}

/* Draws the pattern. t is how far it has grown. */
export function drawTuring(ctx, W, H, t, opts) {
  opts = opts || {};
  const size = opts.size || 96;
  const st = turingState(size, size, opts.seed || 3);
  const steps = Math.min(40, Math.floor(t * (opts.speed || 12)));
  const Du = 0.16, Dv = 0.08, f = opts.f == null ? 0.035 : opts.f, k = opts.k == null ? 0.062 : opts.k;
  const wrap = (i) => (i < 0 ? i + size : i >= size ? i - size : i);
  for (let s = 0; s < steps; s++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const u = st.u[i], v = st.v[i];
        const lu = st.u[y * size + wrap(x - 1)] + st.u[y * size + wrap(x + 1)] + st.u[wrap(y - 1) * size + x] + st.u[wrap(y + 1) * size + x] - 4 * u;
        const lv = st.v[y * size + wrap(x - 1)] + st.v[y * size + wrap(x + 1)] + st.v[wrap(y - 1) * size + x] + st.v[wrap(y + 1) * size + x] - 4 * v;
        const uvv = u * v * v;
        st.u2[i] = clamp(u + Du * lu - uvv + f * (1 - u), 0, 1);
        st.v2[i] = clamp(v + Dv * lv + uvv - (f + k) * v, 0, 1);
      }
    }
    st.u.set(st.u2); st.v.set(st.v2);
  }
  const c = opts.palette === 'warm' ? [[22, 12, 6], [255, 176, 59], [255, 244, 214]] : [[8, 16, 34], [62, 196, 255], [245, 252, 255]];
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const val = clamp(st.v[i] * 2.6, 0, 1);
    const a = clamp(val * 1.3, 0, 1), b = clamp((val - 0.5) * 2, 0, 1);
    img.data[i * 4] = c[0][0] + (c[1][0] - c[0][0]) * a;
    img.data[i * 4 + 1] = c[0][1] + (c[1][1] - c[0][1]) * a;
    img.data[i * 4 + 2] = c[0][2] + (c[1][2] - c[0][2]) * a;
    img.data[i * 4 + 3] = 255;
    void b;
  }
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = size;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, W, H);
  ctx.restore();
}

/* ------------------------------------------------------------------ words along a street */
/* Draws a street going away into the distance and writes the words on the road. */
export function drawStreet(ctx, text, W, H, t, opts) {
  opts = opts || {};
  const vx = W / 2, vy = H * 0.42;
  const road = opts.road || '#2a2a30';
  const kerb = opts.kerb || '#d8d4c8';
  ctx.save();
  /* the road */
  ctx.fillStyle = road;
  ctx.beginPath();
  ctx.moveTo(0, H); ctx.lineTo(vx - W * 0.06, vy); ctx.lineTo(vx + W * 0.06, vy); ctx.lineTo(W, H);
  ctx.closePath(); ctx.fill();
  /* the kerbs */
  ctx.strokeStyle = kerb;
  ctx.lineWidth = Math.max(2, W * 0.006);
  ctx.beginPath();
  ctx.moveTo(0, H); ctx.lineTo(vx - W * 0.06, vy);
  ctx.moveTo(W, H); ctx.lineTo(vx + W * 0.06, vy);
  ctx.stroke();
  /* the middle line */
  ctx.setLineDash([H * 0.05, H * 0.05]);
  ctx.strokeStyle = 'rgba(255,255,255,.6)';
  ctx.lineWidth = Math.max(2, W * 0.005);
  ctx.beginPath(); ctx.moveTo(vx, H); ctx.lineTo(vx, vy); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  /* the words, laid along the road and getting smaller as they go away */
  const chars = Array.from(String(text || ''));
  if (!chars.length) return;
  const per = opts.speed ? 1 / opts.speed : 6;
  const written = clamp(t * per, 0, chars.length);
  const size = (opts.size || 9) / 100 * H;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opts.color || '#ffffff';
  for (let i = 0; i < Math.floor(written) && i < chars.length; i++) {
    const k = i / chars.length;
    const depth = 0.12 + k * 0.88;
    const y = vy + (H - vy) * depth;
    const sc = 0.12 + depth * 0.88;
    const spread = W * 0.05 * (1 + depth);
    ctx.save();
    ctx.translate(vx, y);
    ctx.scale(sc, sc);
    ctx.translate(0, 0);
    ctx.fillText(chars[i], (i % 2 ? 1 : -1) * spread * 0.12, 0);
    ctx.restore();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ a paper plane over a map */
/* The map is drawn from shapes the editor makes itself, so there is no map to download. */
let mapCache = null;
function mapCanvas(W, H, seed) {
  const key = W + 'x' + H + ':' + seed;
  if (mapCache && mapCache.key === key) return mapCache.c;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e2d4';
  g.fillRect(0, 0, W, H);
  /* blocks */
  for (let i = 0; i < 220; i++) {
    const x = rand(seed + i * 1.7) * W, y = rand(seed + i * 2.3) * H;
    const w = 8 + rand(seed + i * 3.9) * 46, h = 8 + rand(seed + i * 5.1) * 38;
    g.fillStyle = rand(seed + i * 7.7) > 0.5 ? '#dcd4c2' : '#d2c9b4';
    g.fillRect(x, y, w, h);
  }
  /* water */
  g.strokeStyle = '#bcd6e8';
  g.lineWidth = Math.max(4, W * 0.012);
  g.beginPath();
  for (let x = -W * 0.2; x < W * 1.2; x += W * 0.05) {
    const y = H * (0.25 + Math.sin(x * 0.006 + seed) * 0.12) + rand(x * 0.01 + seed) * H * 0.05;
    x === -W * 0.2 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke();
  /* roads */
  g.strokeStyle = '#ffffff';
  for (let i = 0; i < 14; i++) {
    g.lineWidth = Math.max(2, W * (i % 5 === 0 ? 0.006 : 0.003));
    g.beginPath();
    const y = rand(seed + i * 9.1) * H;
    g.moveTo(0, y);
    for (let x = 0; x <= W; x += W / 8) g.lineTo(x, y + (rand(seed + i * 11 + x * 0.01) - 0.5) * H * 0.06);
    g.stroke();
  }
  for (let i = 0; i < 10; i++) {
    g.lineWidth = Math.max(2, W * 0.004);
    g.beginPath();
    const x = rand(seed + i * 13.3) * W;
    g.moveTo(x, 0);
    for (let y = 0; y <= H; y += H / 8) g.lineTo(x + (rand(seed + i * 17 + y * 0.01) - 0.5) * W * 0.05, y);
    g.stroke();
  }
  mapCache = { key, c };
  return c;
}

/* A paper plane flying over the map. */
export function drawFlight(ctx, W, H, t, opts) {
  opts = opts || {};
  const map = mapCanvas(W, H, opts.seed || 5);
  ctx.save();
  ctx.drawImage(map, 0, 0, W, H);
  ctx.restore();

  const dur = opts.duration || 6;
  const p = clamp(t / dur, 0, 1);
  const x = -W * 0.1 + p * W * 1.2;
  const y = H * (0.72 - Math.sin(p * Math.PI) * 0.42);
  const scale = (opts.size || 9) / 100 * W;

  /* the shadow on the ground */
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000';
  ctx.translate(x + scale * 0.5, y + scale * 0.5);
  ctx.rotate(0.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, scale * 0.75, scale * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* the plane */
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 1.7) * 0.12 - 0.12);
  ctx.fillStyle = opts.color || '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  ctx.lineWidth = Math.max(1, scale * 0.02);
  ctx.beginPath();
  ctx.moveTo(scale * 0.9, 0);
  ctx.lineTo(-scale * 0.6, -scale * 0.42);
  ctx.lineTo(-scale * 0.3, 0);
  ctx.lineTo(-scale * 0.6, scale * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-scale * 0.3, 0); ctx.lineTo(scale * 0.9, 0);
  ctx.stroke();
  ctx.restore();

  /* the path it has taken */
  if (opts.trail) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,91,82,.7)';
    ctx.lineWidth = Math.max(2, W * 0.004);
    ctx.setLineDash([W * 0.012, W * 0.012]);
    ctx.beginPath();
    for (let q = 0; q <= p; q += 0.01) {
      const qx = -W * 0.1 + q * W * 1.2;
      const qy = H * (0.72 - Math.sin(q * Math.PI) * 0.42);
      q === 0 ? ctx.moveTo(qx, qy) : ctx.lineTo(qx, qy);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/* The heavy effects on offer. */
export const PHYSICS_EFFECTS = [
  { id: 'shatter', name: 'Glass shatter', needs: 'image' },
  { id: 'turing', name: 'Living pattern', needs: 'none' },
  { id: 'street', name: 'Street writer', needs: 'text' },
  { id: 'flight', name: 'Paper plane', needs: 'none' },
];

export { clamp };
