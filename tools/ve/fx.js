/* Shapes, gradients and SVG for the video editor.

   A shape is a layer of its own: a rectangle, a star, a line or a drawing somebody made in
   another program and saved as SVG. They are drawn on the same canvas as everything else, so
   they can be moved, faded and blended like any other layer. */
import { clamp } from './ease.js';

/* The shapes on offer. Each one draws itself in a box of the size given. */
export const SHAPES = {
  rect: {
    name: 'Rectangle',
    draw(ctx, w, h) {
      const r = 0;
      ctx.beginPath();
      if (r) ctx.roundRect(-w / 2, -h / 2, w, h, r);
      else ctx.rect(-w / 2, -h / 2, w, h);
      ctx.fill();
      if (ctx.strokeStyle && ctx.lineWidth) ctx.stroke();
    },
  },
  roundrect: {
    name: 'Rounded box',
    draw(ctx, w, h) {
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.12);
      ctx.fill();
      if (ctx.strokeStyle && ctx.lineWidth) ctx.stroke();
    },
  },
  ellipse: {
    name: 'Ellipse',
    draw(ctx, w, h) {
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (ctx.strokeStyle && ctx.lineWidth) ctx.stroke();
    },
  },
  triangle: {
    name: 'Triangle',
    draw(ctx, w, h) {
      ctx.beginPath();
      ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath();
      ctx.fill();
      if (ctx.strokeStyle && ctx.lineWidth) ctx.stroke();
    },
  },
  star: {
    name: 'Star',
    draw(ctx, w, h) {
      const points = 5;
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? w * 0.2 : w * 0.5;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      if (ctx.strokeStyle && ctx.lineWidth) ctx.stroke();
    },
  },
  arrow: {
    name: 'Arrow',
    draw(ctx, w, h) {
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h * 0.16); ctx.lineTo(w * 0.12, -h * 0.16); ctx.lineTo(w * 0.12, -h / 2);
      ctx.lineTo(w / 2, 0); ctx.lineTo(w * 0.12, h / 2); ctx.lineTo(w * 0.12, h * 0.16);
      ctx.lineTo(-w / 2, h * 0.16); ctx.closePath();
      ctx.fill();
    },
  },
  line: {
    name: 'Line',
    draw(ctx, w, h) {
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0);
      ctx.stroke();
    },
  },
  heart: {
    name: 'Heart',
    draw(ctx, w, h) {
      ctx.beginPath();
      ctx.moveTo(0, h * 0.38);
      ctx.bezierCurveTo(-w * 0.62, -h * 0.05, -w * 0.42, -h * 0.58, 0, -h * 0.24);
      ctx.bezierCurveTo(w * 0.42, -h * 0.58, w * 0.62, -h * 0.05, 0, h * 0.38);
      ctx.closePath();
      ctx.fill();
    },
  },
};

export const SHAPE_ORDER = Object.keys(SHAPES);

/* Builds a fill from a set of stops.
   A fill is { type: 'solid'|'linear'|'radial', stops: [[position, colour], ...], angle: degrees } */
export function makeFill(ctx, W, H, fill) {
  if (!fill || fill.type === 'solid' || !fill.stops || !fill.stops.length) return null;
  const stops = fill.stops;
  let g;
  if (fill.type === 'radial') {
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(W, H) * 0.6);
  } else {
    const a = ((fill.angle || 0) * Math.PI) / 180;
    const r = Math.hypot(W, H) / 2;
    g = ctx.createLinearGradient(-Math.cos(a) * r, -Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r);
  }
  for (const s of stops) g.addColorStop(clamp(s[0], 0, 1), s[1]);
  return g;
}

/* SVG drawings are kept as the text of the file and turned into a picture once, then reused. */
const svgCache = new Map();

/* Turns the text of an SVG file into a picture. Returns a promise. */
export function svgImage(svg) {
  const key = svg.length + ':' + svg.slice(0, 64) + ':' + svg.slice(-64);
  if (svgCache.has(key)) return svgCache.get(key);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  svgCache.set(key, p);
  return p;
}

/* Draws an SVG on the canvas, in a box of the size given.
   When a colour is given, the drawing is filled in with it, like a stencil. */
export function drawSvg(ctx, img, w, h, colour) {
  if (!img || !img.width || !img.height) return;
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  if (!colour) { ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh); return; }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(dw)); c.height = Math.max(1, Math.ceil(dh));
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(c, -dw / 2, -dh / 2, dw, dh);
}

/* The size of a shape on the screen, as a percentage of the frame. */
export function shapeSize(clip, W, H) {
  return [((clip.w == null ? 30 : clip.w) / 100) * W, ((clip.h == null ? 30 : clip.h) / 100) * H];
}
