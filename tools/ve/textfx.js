/* Text effects for the video editor.

   Each effect takes a block of text that has already been measured and draws it. The effects
   move single letters, whole words or whole lines, so they all work off the positions the text
   layout gives.

   An effect is a function that draws the whole block:

     draw(ctx, groups, o, t)

   ctx     the canvas, already moved to where the block sits
   groups  the text in pieces. A piece is one letter, one word or one line, whichever was asked
           for. Every piece knows where its letters are, so a piece can be moved as one.
   o       the options: colour, size, outline, shadow, and anything the effect needs
   t       how far into the effect we are, in seconds

   The editor draws text through here, so a letter can be moved, spun, faded or hidden on its
   own, and a word or a line can be moved as one piece. */
import { layoutText } from './text.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;

/* A steady random number, so a reshuffle looks the same every time the video is drawn. */
function rand(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/* Splits the text into pieces.
   unit is 'letter', 'word' or 'line'. */
export function groupText(layout, unit) {
  const groups = [];
  if (unit === 'word') {
    for (const line of layout.lines) {
      for (const w of line.words) {
        const letters = line.letters.filter((g) => g.word === w.index);
        if (!letters.length) continue;
        groups.push({ letters, line, x: w.x, y: line.y, width: w.width, text: w.text, index: groups.length });
      }
    }
  } else if (unit === 'line') {
    for (const line of layout.lines) {
      if (!line.letters.length) continue;
      groups.push({ letters: line.letters, line, x: line.x, y: line.y, width: line.width, text: line.text, index: groups.length });
    }
  } else {
    for (const line of layout.lines) {
      for (const g of line.letters) {
        groups.push({ letters: [g], line, x: g.x, y: line.y, width: g.width, text: g.ch, index: groups.length });
      }
    }
  }
  return groups;
}

/* Draws every piece, letting the effect change each one.
   The style is the same for every piece unless the effect says otherwise. */
function eachGroup(ctx, groups, o, t, fn) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.color || '#ffffff';
  if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lineWidth || 3; ctx.lineJoin = 'round'; }
  if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.shadowBlur || 0; ctx.shadowOffsetY = o.shadowOffsetY || 0; }
  for (const g of groups) {
    const m = fn ? fn(g, g.index) : null;
    if (m && m.hidden) continue;
    for (const l of g.letters) {
      const x = l.x + (m && m.dx ? m.dx : 0);
      const y = g.y + (m && m.dy ? m.dy : 0);
      const cx = x + l.width / 2;
      ctx.save();
      if (m && (m.scale != null || m.rotate)) {
        ctx.translate(cx, y);
        if (m.rotate) ctx.rotate((m.rotate * Math.PI) / 180);
        if (m.scale != null) ctx.scale(m.scale, m.scale);
        ctx.translate(-cx, -y);
      }
      if (m && m.alpha != null) ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * m.alpha;
      if (m && m.fill) ctx.fillStyle = m.fill;
      if (m && m.stroke) ctx.strokeStyle = m.stroke;
      if (o.stroke) ctx.strokeText(l.ch, x, y);
      ctx.fillText(l.ch, x, y);
      ctx.restore();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ the effects */
export const TEXT_FX = {
  none: {
    name: 'None',
    draw(ctx, groups, o) { eachGroup(ctx, groups, o, 0, null); },
  },

  /* The text appears one piece at a time, like it is being typed. */
  typewriter: {
    name: 'Typewriter',
    draw(ctx, groups, o, t) {
      const total = groups.length;
      const per = o.speed ? 1 / o.speed : 0.08;
      const shown = clamp(Math.floor(t / per) + 1, 0, total);
      eachGroup(ctx, groups, o, t, (g, i) => ({ hidden: i >= shown }));
      if (o.cursor && shown > 0 && shown <= total) {
        const g = groups[shown - 1];
        const last = g.letters[g.letters.length - 1];
        ctx.save();
        ctx.fillStyle = o.color || '#fff';
        ctx.fillRect(last.x + last.width + 1, g.y - (o.size || 40) * 0.42, Math.max(2, (o.size || 40) * 0.06), (o.size || 40) * 0.84);
        ctx.restore();
      }
    },
  },

  /* A circle of light travels across the text. What is in the light is bright, the rest is dim. */
  spotlight: {
    name: 'Spotlight',
    draw(ctx, groups, o, t) {
      if (!groups.length) return;
      const w = o.width || 0, h = o.height || 0;
      const path = o.path === 'orbit'
        ? { x: Math.cos(t * 1.4) * w * 0.45, y: Math.sin(t * 2.1) * h * 0.35 }
        : { x: (((t * 0.35) % 1.4) - 0.2) * w, y: 0 };
      const r = o.radius || Math.max(40, h * 0.5);
      eachGroup(ctx, groups, o, t, (g) => {
        const d = Math.hypot(g.x + g.width / 2 - path.x, g.y - path.y);
        const k = clamp(1 - (d - r) / (r * 0.7), 0, 1);
        return { alpha: 0.25 + 0.75 * k, fill: k > 0.35 ? (o.hot || '#ffe66d') : (o.color || '#ffffff') };
      });
    },
  },

  /* The text prints out like a receipt, growing downwards. */
  receipt: {
    name: 'Receipt printer',
    draw(ctx, groups, o, t, layout) {
      const per = o.speed ? 1 / o.speed : 0.5;
      const lines = layout ? layout.lines.length : groups.length;
      const shown = clamp(t / per, 0, lines);
      ctx.save();
      ctx.beginPath();
      const h = (layout ? layout.height : 0) * shown;
      ctx.rect(layout.bounds.x - 40, layout.bounds.y - 6, layout.width + 80, Math.max(0, h + 6));
      ctx.clip();
      eachGroup(ctx, groups, o, t, null);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = o.edge || 'rgba(0,0,0,.25)';
      ctx.lineWidth = 2;
      const y = layout.bounds.y + h;
      ctx.beginPath();
      for (let x = layout.bounds.x - 40; x < layout.bounds.x + layout.width + 40; x += 12) {
        ctx.lineTo(x, y + (Math.floor(x / 12) % 2 ? 6 : -6));
      }
      ctx.stroke();
      ctx.restore();
    },
  },

  /* The letters swirl through other letters before settling on the right ones. */
  reshuffle: {
    name: 'Text reshuffle',
    draw(ctx, groups, o, t) {
      const settle = o.settle || 1.2;
      const p = clamp(t / settle, 0, 1);
      const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@';
      const settling = [];
      eachGroup(ctx, groups, o, t, (g, i) => {
        const local = clamp((p - i * 0.012) * 1.6, 0, 1);
        if (local >= 1) return null;
        settling.push({ g, i });
        return { fill: o.swapColor || '#ffd23f' };
      });
      /* put the wrong letters on top of the ones that have not settled */
      ctx.save();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = o.font || '40px Arial';
      ctx.fillStyle = o.swapColor || '#ffd23f';
      for (const s of settling) {
        const ch = pool[Math.floor(rand(s.i + Math.floor(t * 12)) * pool.length) % pool.length];
        for (const l of s.g.letters) ctx.fillText(ch, l.x, s.g.y);
      }
      ctx.restore();
    },
  },

  /* The words sit on a ball that turns. */
  sphere: {
    name: 'Word sphere',
    draw(ctx, groups, o, t) {
      if (!groups.length) return;
      const r = o.radius || 160;
      const spin = (o.speed || 0.6) * t;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = o.font || '40px Arial';
      groups.forEach((g, i) => {
        const a = spin + (i / groups.length) * TAU;
        const z = Math.cos(a), x = Math.sin(a);
        if (z < 0.04) return;
        const s = (z + 1) / 2;
        const sc = 0.35 + s * 0.65;
        ctx.save();
        ctx.translate(x * r, g.y);
        ctx.scale(sc, sc);
        ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * (0.25 + s * 0.75);
        ctx.fillStyle = o.color || '#ffffff';
        ctx.fillText(g.text, 0, 0);
        ctx.restore();
      });
      ctx.restore();
    },
  },

  /* The text is on the face of a block that turns. */
  cube: {
    name: 'Text cube',
    draw(ctx, groups, o, t, layout) {
      const a = (o.speed || 0.7) * t;
      const ca = Math.cos(a), sa = Math.sin(a);
      const w = layout.width, h = layout.height;
      ctx.save();
      if (Math.abs(sa) > 0.02) {
        ctx.save();
        ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * Math.abs(sa) * 0.8;
        ctx.fillStyle = o.side || 'rgba(255,255,255,.25)';
        ctx.beginPath();
        const d = h * 0.5 * sa;
        ctx.moveTo(-w / 2 - d, -h / 2); ctx.lineTo(w / 2 - d, -h / 2);
        ctx.lineTo(w / 2 - d, h / 2); ctx.lineTo(-w / 2 - d, h / 2);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.scale(Math.max(0.04, ca), 1);
      ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * Math.abs(ca);
      eachGroup(ctx, groups, o, t, null);
      ctx.restore();
    },
  },

  /* The letters sit at different depths and the ones far away go soft. */
  depth: {
    name: 'Depth focus',
    draw(ctx, groups, o, t) {
      const spread = o.spread || 220;
      const focus = o.focus == null ? 0.5 : o.focus;
      eachGroup(ctx, groups, o, (g, i) => {
        const k = groups.length > 1 ? i / (groups.length - 1) : 0.5;
        const d = (k - focus) * spread;
        const s = clamp(1 - d / 2600, 0.45, 1.4);
        return { scale: s, dy: -d * 0.12, alpha: clamp(1 - Math.abs(d) / 420, 0.12, 1) };
      });
    },
  },

  /* A lens over the text makes what is under it bigger. */
  magnifier: {
    name: 'Magnifier',
    draw(ctx, groups, o, t) {
      if (!groups.length) return;
      const r = o.radius || 90;
      const cx = Math.sin(t * (o.speed || 0.8)) * (o.width || 200) * 0.35;
      const cy = 0;
      const zoom = o.zoom || 2;
      eachGroup(ctx, groups, o, t, null);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.clip();
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
      eachGroup(ctx, groups, o, t, null);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = o.ring || 'rgba(255,255,255,.6)';
      ctx.lineWidth = Math.max(2, r * 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    },
  },

  /* The text slams into place. */
  powboom: {
    name: 'Pow boom',
    draw(ctx, groups, o, t) {
      const dur = o.duration || 0.6;
      const p = clamp(t / dur, 0, 1);
      const s = p < 1 ? 1 + Math.pow(1 - p, 3) * (o.over || 2.4) : 1;
      const shake = p < 1 ? (1 - p) * (o.shake || 14) : 0;
      ctx.save();
      ctx.translate(Math.sin(t * 90) * shake, Math.cos(t * 77) * shake);
      ctx.scale(s, s);
      eachGroup(ctx, groups, o, t, null);
      ctx.restore();
    },
  },

  /* The letters leave a trail behind them as they move. */
  trail: {
    name: 'Text trail',
    draw(ctx, groups, o, t) {
      const steps = o.steps || 6;
      for (let s = steps - 1; s >= 0; s--) {
        const tt = t - s * (o.gap || 0.06);
        eachGroup(ctx, groups, o, tt, (g, i) => {
          const k = groups.length > 1 ? i / (groups.length - 1) : 0.5;
          return { dx: (1 - k) * (o.push || 160) * (s + 1) * 0.12, alpha: (1 - s / steps) * 0.55, fill: o.trailColor || '#ffd23f' };
        });
      }
      eachGroup(ctx, groups, o, t, null);
    },
  },

  /* The letters are pulled towards a magnet that moves across the text. */
  magnetic: {
    name: 'Magnetic text',
    draw(ctx, groups, o, t) {
      if (!groups.length) return;
      const mx = Math.sin(t * (o.speed || 1.2)) * (o.width || 200) * 0.5;
      const my = Math.cos(t * (o.speed || 1.2) * 0.7) * (o.height || 60) * 0.35;
      const pull = o.pull || 90;
      eachGroup(ctx, groups, o, t, (g) => {
        const dx = mx - (g.x + g.width / 2), dy = my - g.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const k = clamp(pull / d, 0, 0.75);
        return { dx: dx * k, dy: dy * k, scale: 1 + k * 0.25 };
      });
    },
  },

  /* The pieces arrive one after another. */
  rise: {
    name: 'Rise in',
    draw(ctx, groups, o, t) {
      const dur = o.duration || 0.6;
      eachGroup(ctx, groups, o, t, (g, i) => {
        const p = clamp((t - i * (o.stagger || 0.03)) / dur, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        return { dy: (1 - e) * (o.rise || 70), alpha: e, scale: 0.7 + e * 0.3 };
      });
    },
  },

  /* The pieces spin into place. */
  spinin: {
    name: 'Spin in',
    draw(ctx, groups, o, t) {
      const dur = o.duration || 0.7;
      eachGroup(ctx, groups, o, t, (g, i) => {
        const p = clamp((t - i * (o.stagger || 0.03)) / dur, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        return { rotate: (1 - e) * (o.turn || 180), alpha: e, scale: 0.6 + e * 0.4 };
      });
    },
  },

  /* The pieces slide in from the side. */
  slidein: {
    name: 'Slide in',
    draw(ctx, groups, o, t) {
      const dur = o.duration || 0.6;
      eachGroup(ctx, groups, o, t, (g, i) => {
        const p = clamp((t - i * (o.stagger || 0.03)) / dur, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        return { dx: (1 - e) * (o.slide || 120), alpha: e };
      });
    },
  },
};

export const TEXT_FX_ORDER = Object.keys(TEXT_FX);

/* How each effect can be set up: the options it takes and the ones that are on by default. */
export const TEXT_FX_OPTS = {
  typewriter: { speed: 0.08, cursor: true },
  spotlight: { radius: 90, hot: '#ffe66d', path: 'sweep' },
  receipt: { speed: 0.5, edge: 'rgba(0,0,0,.3)' },
  reshuffle: { settle: 1.2, swapColor: '#ffd23f' },
  sphere: { radius: 160, speed: 0.6 },
  cube: { speed: 0.7, side: 'rgba(255,255,255,.25)' },
  depth: { spread: 220, focus: 0.5 },
  magnifier: { radius: 90, zoom: 2, speed: 0.8, ring: 'rgba(255,255,255,.65)' },
  powboom: { duration: 0.6, over: 2.4, shake: 14 },
  trail: { steps: 6, gap: 0.06, push: 160, trailColor: '#ffd23f' },
  magnetic: { pull: 90, speed: 1.2 },
  rise: { duration: 0.6, stagger: 0.03, rise: 70 },
  spinin: { duration: 0.7, stagger: 0.03, turn: 180 },
  slidein: { duration: 0.6, stagger: 0.03, slide: 120 },
};

/* The options each effect shows in the panel. */
export const TEXT_FX_FIELDS = {
  typewriter: [['speed', 'Letters a second', 0.02, 0.4, 0.01, ''], ['cursor', 'Show the cursor', 'bool']],
  spotlight: [['radius', 'Size of the light', 30, 300, 5, 'px'], ['hot', 'Colour of the light', 'color'], ['path', 'How it moves', 'select:sweep,orbit']],
  receipt: [['speed', 'Lines a second', 0.2, 3, 0.1, '']],
  reshuffle: [['settle', 'Time to settle', 0.3, 4, 0.1, 's'], ['swapColor', 'Colour of the letters', 'color']],
  sphere: [['radius', 'Size of the ball', 60, 400, 10, 'px'], ['speed', 'How fast it turns', 0.1, 3, 0.1, '']],
  cube: [['speed', 'How fast it turns', 0.1, 3, 0.1, '']],
  depth: [['spread', 'How far apart', 60, 500, 10, 'px'], ['focus', 'What is in focus', 0, 1, 0.05, '']],
  magnifier: [['radius', 'Size of the lens', 40, 300, 5, 'px'], ['zoom', 'How much bigger', 1.2, 5, 0.1, 'x'], ['speed', 'How fast it moves', 0.1, 3, 0.1, '']],
  powboom: [['duration', 'Time to land', 0.2, 2, 0.05, 's'], ['over', 'How big it gets', 1, 5, 0.1, 'x']],
  trail: [['steps', 'How many copies', 2, 12, 1, ''], ['gap', 'Space between', 0.02, 0.2, 0.01, 's'], ['trailColor', 'Colour of the trail', 'color']],
  magnetic: [['pull', 'How strong', 10, 300, 5, 'px'], ['speed', 'How fast it moves', 0.1, 3, 0.1, '']],
  rise: [['duration', 'Time to land', 0.2, 2, 0.05, 's'], ['stagger', 'Gap between', 0, 0.2, 0.01, 's'], ['rise', 'How far it comes', 20, 300, 5, 'px']],
  spinin: [['duration', 'Time to land', 0.2, 2, 0.05, 's'], ['stagger', 'Gap between', 0, 0.2, 0.01, 's'], ['turn', 'How far it turns', 30, 720, 10, '°']],
  slidein: [['duration', 'Time to land', 0.2, 2, 0.05, 's'], ['stagger', 'Gap between', 0, 0.2, 0.01, 's'], ['slide', 'How far it comes', 20, 400, 5, 'px']],
};

/* Draws a block of text with an effect on it.
   ctx     the canvas
   text    the words
   o       font, size, colour, the effect and its options
   t       how far into the effect we are, in seconds */
export function drawTextFx(ctx, text, o, t) {
  const fx = TEXT_FX[o.fx] || TEXT_FX.none;
  const opts = Object.assign({}, TEXT_FX_OPTS[o.fx] || {}, o.opts || {});
  const layout = layoutText(ctx, text, { font: o.font, size: o.size, lineHeight: o.lineHeight || 1.2, align: o.align || 'center', origin: 'center' });
  const groups = groupText(layout, o.unit || 'letter');
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = o.font;
  fx.draw(ctx, groups, Object.assign({}, opts, { color: o.color, size: o.size, font: o.font, stroke: o.stroke, lineWidth: o.lineWidth, shadow: o.shadow, width: layout.width, height: layout.height }), t, layout);
  ctx.restore();
  return layout;
}
