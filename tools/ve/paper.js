/* Paper, cut out and folded, for the video editor.

   The paper look takes a picture and makes it look like a piece of paper that was torn out of
   something: a rough edge, the texture of the paper, and a shadow underneath.

   The fold takes the same picture and opens it up like a sheet of paper that was folded in
   half, one panel at a time.

   The magazine look takes a piece of text and cuts every letter out on its own scrap of paper,
   each one turned a little differently. */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* A steady random number, so the same paper always has the same torn edge. */
function rand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* Builds the rough edge of a torn piece of paper.
   It walks around the four sides of the picture and pulls the line in and out a little.
   Call it, then fill or clip with it. */
export function tornPath(ctx, W, H, amount, seed) {
  const a = clamp(amount == null ? 0.5 : amount, 0, 1) * Math.min(W, H) * 0.045;
  const step = Math.max(6, Math.min(W, H) * 0.035);
  const jitter = (i, s) => (rand(i * 3.17 + (s || 0) * 91.3) - 0.5) * 2 * a;
  ctx.beginPath();
  let i = 0;
  const go = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const px = x1 + (x2 - x1) * u, py = y1 + (y2 - y1) * u;
      const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
      const j = jitter(i++, seed);
      const px2 = px + nx * j, py2 = py + ny * j;
      if (i === 1) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
  };
  go(0, 0, W, 0);
  go(W, 0, W, H);
  go(W, H, 0, H);
  go(0, H, 0, 0);
  ctx.closePath();
}

/* The texture of paper. It is made once and kept, because making it every frame would be slow. */
let paperTex = null;
export function paperTexture() {
  if (paperTex) return paperTex;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = rand(i * 0.017);
    const v = 128 + (n - 0.5) * 46;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 0.97; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  /* a few longer fibres */
  g.globalAlpha = 0.07;
  g.strokeStyle = '#000';
  for (let i = 0; i < 90; i++) {
    g.beginPath();
    const x = rand(i * 2.7) * size, y = rand(i * 5.1) * size;
    g.moveTo(x, y);
    g.lineTo(x + (rand(i * 7.3) - 0.5) * 40, y + (rand(i * 9.1) - 0.5) * 40);
    g.stroke();
  }
  paperTex = c;
  return c;
}

/* Draws the paper texture over a layer, but only where the layer itself is.
   The 'source-atop' setting keeps the texture off the background. */
export function layPaperTexture(ctx, W, H, strength) {
  const tex = paperTexture();
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = clamp(strength == null ? 0.4 : strength, 0, 1);
  const pat = ctx.createPattern(tex, 'repeat');
  if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

/* Opens a picture up like a folded sheet of paper.
   panels  how many folds
   t       how far open it is, 0 shut and 1 flat
   angle   how far the panels lean back, in degrees */
export function drawFold(ctx, src, W, H, panels, t, angle) {
  const n = Math.max(2, Math.min(8, panels || 4));
  const p = clamp(t, 0, 1);
  const sw = src.videoWidth || src.naturalWidth || src.width;
  const sh = src.videoHeight || src.naturalHeight || src.height;
  if (!sw || !sh) return;
  const panelW = sw / n;
  const lean = ((angle == null ? 34 : angle) * Math.PI) / 180;

  for (let i = 0; i < n; i++) {
    /* the panels open one after another, from the middle out */
    const order = i % 2 === 0 ? i / 2 : n - 1 - Math.floor(i / 2);
    const open = clamp((p - order * (0.9 / n)) * (n / 0.9), 0, 1);
    const e = 1 - Math.pow(1 - open, 3);
    if (e <= 0.001) continue;
    const shrink = Math.abs(Math.cos(lean * (1 - e)));
    const flip = i % 2 === 0 ? 1 : -1;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(flip * (0.02 + e * 0.98) * (shrink > 0.04 ? 1 : 0.02), 1);
    if (e < 1) {
      ctx.transform(1, 0, (1 - e) * (i % 2 === 0 ? 0.5 : -0.5), 1, 0, 0);
    }
    const dw = W, dh = H;
    const dx = -dw / 2 + (i * panelW) / sw * dw;
    const dwc = (panelW / sw) * dw;
    try { ctx.drawImage(src, dx, -dh / 2, dwc, dh); } catch (e2) { /* the picture is not ready */ }
    ctx.restore();
  }
}

/* Cuts every letter out on its own scrap of paper and turns each one a little. */
export function magazineLetters(ctx, layout, o, t) {
  const letters = [];
  for (const line of layout.lines) for (const g of line.letters) letters.push({ g, line });
  if (!letters.length) return;
  const scrap = o.scrap || '#f6f1e4';
  const ink = o.color || '#141414';
  const turn = o.turn || 7;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const { g, line } of letters) {
    const seed = g.index * 4.77;
    const rot = (rand(seed) - 0.5) * 2 * turn;
    const dx = (rand(seed + 1) - 0.5) * 2 * (o.jitter || 5);
    const dy = (rand(seed + 2) - 0.5) * 2 * (o.jitter || 5);
    const pad = o.pad == null ? 0.22 : o.pad;
    const x = g.x + dx, y = line.y + dy;
    ctx.save();
    ctx.translate(x + g.width / 2, y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-(x + g.width / 2), -y);
    /* the scrap of paper behind the letter */
    const pw = g.width * (1 + pad * 2), ph = (o.size || 40) * (1 + pad * 2);
    ctx.fillStyle = scrap;
    ctx.fillRect(x - g.width * pad, y - ph / 2, pw, ph);
    ctx.fillStyle = ink;
    ctx.font = o.font;
    ctx.fillText(g.ch, x, y);
    ctx.restore();
  }
  ctx.restore();
}

/* The paper looks on offer. */
export const PAPER_PRESETS = [
  { id: 'none', name: 'None' },
  { id: 'torn', name: 'Torn paper', torn: 0.7, texture: 0.45, shadow: 0.6 },
  { id: 'rough', name: 'Rough cut', torn: 1, texture: 0.25, shadow: 0.4 },
  { id: 'old', name: 'Old photo', torn: 0.35, texture: 0.7, shadow: 0.5 },
  { id: 'ticket', name: 'Ticket', torn: 0.2, texture: 0.35, shadow: 0.8 },
];

/* Builds the settings for a paper look from a name. */
export function paperPreset(id) {
  const p = PAPER_PRESETS.find((x) => x.id === id);
  if (!p || p.id === 'none') return null;
  return { torn: p.torn || 0, texture: p.texture || 0, shadow: p.shadow || 0, seed: 1 };
}
