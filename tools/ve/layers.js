/* The layer compositor for the video editor.

   Everything you can see in a frame is a layer. A layer is drawn on top of the ones below it, and
   each one can have its own position, size, tilt, see-through level, blend mode and mask.

   The editor draws one frame at a time. This file takes the list of layers for that frame and
   puts them on the canvas in the right order, with the right settings.

   The plain video, the text and the captions are all layers too. That is what lets an animation
   apply to any of them the same way. */

import { evalActions } from './anim.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* The blend modes a layer can use. The names are what the interface shows. */
export const BLEND_MODES = [
  { id: 'source-over', name: 'Normal' },
  { id: 'multiply', name: 'Multiply' },
  { id: 'screen', name: 'Screen' },
  { id: 'overlay', name: 'Overlay' },
  { id: 'darken', name: 'Darken' },
  { id: 'lighten', name: 'Lighten' },
  { id: 'color-dodge', name: 'Colour dodge' },
  { id: 'color-burn', name: 'Colour burn' },
  { id: 'hard-light', name: 'Hard light' },
  { id: 'soft-light', name: 'Soft light' },
  { id: 'difference', name: 'Difference' },
  { id: 'exclusion', name: 'Exclusion' },
  { id: 'hue', name: 'Hue' },
  { id: 'saturation', name: 'Saturation' },
  { id: 'color', name: 'Colour' },
  { id: 'luminosity', name: 'Lightness' },
];

/* The order layers are drawn in. Layers with the same number keep the order they came in. */
export function sortLayers(layers) {
  return layers
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (a.l.z || 0) - (b.l.z || 0) || a.i - b.i)
    .map((x) => x.l);
}

/* Puts a layer where it should be. The pivot is the point it turns around, and the offsets are
   given as a percentage of the frame so the same numbers work at every size. */
export function applyTransform(ctx, W, H, t) {
  if (!t) return;
  const px = (t.pivot && t.pivot.x != null ? t.pivot.x : 50) / 100 * W;
  const py = (t.pivot && t.pivot.y != null ? t.pivot.y : 50) / 100 * H;
  const dx = (t.x || 0) / 100 * W, dy = (t.y || 0) / 100 * H;
  ctx.translate(px + dx, py + dy);
  if (t.rotate) ctx.rotate((t.rotate * Math.PI) / 180);
  if (t.scale != null && t.scale !== 1) ctx.scale(t.scale, t.scale);
  ctx.translate(-px, -py);
}

/* Merges what a layer is set to with what its actions are doing at this moment. */
function mergeTransform(L, state) {
  const base = L.transform || null;
  if (!state) return base;
  const has = state.x || state.y || state.scale !== 1 || state.rotate;
  if (!has) return base;
  return {
    x: (base && base.x ? base.x : 0) + state.x,
    y: (base && base.y ? base.y : 0) + state.y,
    scale: (base && base.scale != null ? base.scale : 1) * state.scale,
    rotate: (base && base.rotate ? base.rotate : 0) + state.rotate,
    pivot: base && base.pivot ? base.pivot : L.pivot,
  };
}

/* Scratch canvases, so a masked or blurred layer can be built on its own before it is put down.
   Only a couple are kept, so a big export does not fill up memory. */
const bufs = [];
function getBuf(W, H, slot) {
  let c = bufs[slot];
  if (!c) { c = bufs[slot] = makeCanvas(W, H); }
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  g.clearRect(0, 0, W, H);
  return { c, g };
}
function makeCanvas(W, H) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(W, H);
  const c = document.createElement('canvas'); c.width = W; c.height = H; return c;
}

/* Draws the whole frame.
   layers  each one needs: z (order), opacity, blend, transform, mask, filter, blur, shadow,
           actions (the stack), time (how far into the layer we are) and draw(ctx, W, H).
           A mask is a function that paints the shape the layer is allowed to show. */
export function compose(ctx, W, H, layers) {
  if (!layers || !layers.length) return;
  for (const L of sortLayers(layers)) {
    if (!L || !L.draw) continue;
    const state = L.actions && L.actions.length ? evalActions(L.actions, L.time || 0) : null;
    const op = clamp((L.opacity == null ? 1 : L.opacity) * (state ? state.opacity : 1), 0, 1);
    if (op <= 0) continue;
    const tr = mergeTransform(L, state);
    const blur = (L.blur || 0) + (state ? state.blur : 0);
    const blend = L.blend || 'source-over';
    const filter = L.filter ? L.filter + (blur ? ' blur(' + blur.toFixed(2) + 'px)' : '') : (blur ? 'blur(' + blur.toFixed(2) + 'px)' : '');

    /* A layer that needs to be softened, masked or blended is built on its own canvas first,
       then that canvas is put down. A layer that needs none of that is drawn straight onto the
       frame, which is faster and keeps the picture exactly as it was. */
    const needsBuffer = !!L.mask || !!filter || !!L.shadow || op < 1;

    if (!needsBuffer) {
      /* A layer with nothing to change is drawn straight onto the frame, with no extra state
         wrapped around it, so the picture comes out exactly as it always has. */
      if (!tr && op === 1 && blend === 'source-over') { L.draw(ctx, W, H); continue; }
      ctx.save();
      applyTransform(ctx, W, H, tr);
      ctx.globalAlpha = op;
      ctx.globalCompositeOperation = blend;
      L.draw(ctx, W, H);
      ctx.restore();
      continue;
    }

    const layerBuf = getBuf(W, H, 0);
    const b = layerBuf.g;
    b.save();
    applyTransform(b, W, H, tr);
    if (filter) b.filter = filter;
    L.draw(b, W, H);
    b.restore();
    b.filter = 'none';

    if (L.mask) {
      const maskBuf = getBuf(W, H, 1);
      maskBuf.g.save();
      L.mask(maskBuf.g, W, H);
      maskBuf.g.restore();
      b.globalCompositeOperation = 'destination-in';
      b.drawImage(maskBuf.c, 0, 0);
      b.globalCompositeOperation = 'source-over';
    }

    if (L.shadow) {
      /* The shadow is the shape of the layer, blurred and moved a little, in one flat colour. */
      const shadowBuf = getBuf(W, H, 1);
      const s = shadowBuf.g, sh = L.shadow;
      s.filter = 'blur(' + (sh.blur || 0) + 'px)';
      s.drawImage(layerBuf.c, sh.x || 0, sh.y || 0);
      s.filter = 'none';
      s.globalCompositeOperation = 'source-in';
      s.fillStyle = sh.color || 'rgba(0,0,0,.55)';
      s.fillRect(0, 0, W, H);
      s.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalAlpha = op;
      ctx.drawImage(shadowBuf.c, 0, 0);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = op;
    ctx.globalCompositeOperation = blend;
    ctx.drawImage(layerBuf.c, 0, 0);
    ctx.restore();
  }
}

/* The blend mode names, ready for a select box. */
export function blendOptions() { return BLEND_MODES.map((b) => b.id); }

/* Checks that a blend mode is one the browser knows. */
export function validBlend(id) { return BLEND_MODES.some((b) => b.id === id); }
