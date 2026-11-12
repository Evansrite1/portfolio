/* The action model for the video editor.

   A layer can hold a stack of actions. Each action runs for its own length, starts after its own
   delay, and moves one thing: the position, the fade, the size, the blur and so on. There are no
   keyframes to place. You add an action, give it a length and a curve, and it plays.

   Actions of different kinds sit side by side, so a layer can move and fade and spin at once.
   When two actions of the same kind overlap, the one that comes later in the stack wins.

   Pure code with no browser APIs, so it also runs in Node for testing. */
import { makeEase, EASINGS } from './ease.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* Every kind of action, with the numbers the interface needs to build its controls.
   from and to are 0..1 for fade and mask, a plain multiplier for scale, degrees for rotate,
   pixels for blur, and a pair of percentages for move. */
export const ACTION_TYPES = {
  move: {
    name: 'Move', kind: 'position', unit: '%',
    make: () => ({ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }),
  },
  fade: {
    name: 'Fade', kind: 'opacity', unit: '',
    make: () => ({ from: 0, to: 1 }),
  },
  scale: {
    name: 'Scale', kind: 'size', unit: 'x',
    make: () => ({ from: 1, to: 1 }),
  },
  rotate: {
    name: 'Spin', kind: 'rotation', unit: '°',
    make: () => ({ from: 0, to: 0 }),
  },
  blur: {
    name: 'Blur', kind: 'blur', unit: 'px',
    make: () => ({ from: 0, to: 20 }),
  },
  mask: {
    name: 'Reveal', kind: 'mask', unit: '',
    make: () => ({ from: 0, to: 1 }),
  },
  path: {
    name: 'Path', kind: 'position', unit: '',
    make: () => ({ from: 0, to: 1, points: [[0, 0], [0, 0]] }),
  },
};

export const ACTION_ORDER = ['move', 'fade', 'scale', 'rotate', 'blur', 'mask', 'path'];

let actUid = 1;
/* Builds one action with sensible starting values. */
export function makeAction(type, opts = {}) {
  const spec = ACTION_TYPES[type];
  if (!spec) return null;
  const base = spec.make();
  const a = {
    id: 'a' + (actUid++) + '-' + Date.now().toString(36),
    type,
    dur: 0.6,
    delay: 0,
    ease: 'outCubic',
    ...base,
    ...opts,
  };
  return a;
}

/* A copy of a stack of actions, with new ids so the copy can be changed on its own. */
export function cloneActions(actions) {
  if (!actions || !actions.length) return [];
  return actions.map((a) => ({ ...JSON.parse(JSON.stringify(a)), id: 'a' + (actUid++) + '-' + Date.now().toString(36) }));
}

/* The stack as plain text, for the clipboard. */
export function serializeActions(actions) {
  return JSON.stringify((actions || []).map(({ id, ...rest }) => rest));
}
/* Reads a stack back from the clipboard. Returns an empty stack if the text is not one. */
export function deserializeActions(text) {
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];
    return arr.filter((a) => a && ACTION_TYPES[a.type]).map((a) => ({ ...a, id: 'a' + (actUid++) + '-' + Date.now().toString(36) }));
  } catch (e) { return []; }
}

/* The value of one action at a moment in time, after its curve is applied.
   Returns null when the action has not started yet. */
export function actionValueAt(a, t) {
  const delay = a.delay || 0, dur = a.dur == null ? 0.6 : a.dur;
  const local = t - delay;
  if (local < 0) return null;
  const p = dur <= 0 ? 1 : clamp(local / dur, 0, 1);
  const e = makeEase(a.ease)(p);
  const from = a.from, to = a.to;
  switch (a.type) {
    case 'move': return { x: (from.x || 0) + ((to.x || 0) - (from.x || 0)) * e, y: (from.y || 0) + ((to.y || 0) - (from.y || 0)) * e };
    case 'path': return (from || 0) + ((to == null ? 1 : to) - (from || 0)) * e;
    default: return (from || 0) + ((to || 0) - (from || 0)) * e;
  }
}

/* Works out where every action leaves a layer at a moment in time.
   The result is the plain state a renderer needs: where it is, how big, how see through, how blurry. */
export function evalActions(actions, t) {
  const out = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, blur: 0, mask: 1, path: null, pathProgress: 0 };
  if (!actions || !actions.length) return out;
  for (const a of actions) {
    const v = actionValueAt(a, t);
    if (v == null) continue;
    switch (a.type) {
      case 'move': out.x = v.x; out.y = v.y; break;
      case 'fade': out.opacity = v; break;
      case 'scale': out.scale = v; break;
      case 'rotate': out.rotate = v; break;
      case 'blur': out.blur = v; break;
      case 'mask': out.mask = v; break;
      case 'path':
        out.path = a.points || null;
        out.pathProgress = v;
        if (a.points && a.points.length) {
          const pt = pathPoint(a.points, v);
          out.x = pt.x; out.y = pt.y;
        }
        break;
    }
  }
  return out;
}

/* Which actions are running right now, newest last. The interface uses it to show what is playing. */
export function activeActions(actions, t) {
  if (!actions || !actions.length) return [];
  const out = [];
  for (const a of actions) {
    const delay = a.delay || 0, dur = a.dur == null ? 0.6 : a.dur;
    const local = t - delay;
    if (local >= 0 && local < dur + delay) out.push(a);
  }
  return out;
}

/* The action of a kind that is driving the layer right now, or the last one if none is running. */
export function drivingAction(actions, type, t) {
  if (!actions || !actions.length) return null;
  let found = null;
  for (const a of actions) {
    if (a.type !== type) continue;
    found = a;
    if (actionValueAt(a, t) != null) return a;
  }
  return found;
}

/* Spreads a set of actions out over time, one after another.
   Used when an effect has to land on every letter of a word, or on every panel of a build. */
export function stagger(count, opts = {}) {
  const { each = 0.08, start = 0, from = 'first' } = opts;
  const out = [];
  for (let i = 0; i < count; i++) {
    let k = i;
    if (from === 'centre') k = Math.abs(i - (count - 1) / 2);
    else if (from === 'last') k = count - 1 - i;
    out.push(start + k * each);
  }
  return out;
}

/* A smooth curve through a list of points, used for motion paths.
   The points are pairs of percentages. Returns the point at a fraction along the path. */
export function pathPoint(points, p) {
  if (!points || !points.length) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0][0], y: points[0][1] };
  const t = clamp(p, 0, 1) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(t));
  const f = t - i;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
  const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
  return { x: cr(p0[0], p1[0], p2[0], p3[0]), y: cr(p0[1], p1[1], p2[1], p3[1]) };
}

/* Ready made stacks of actions. The names are what the interface shows. */
export const ACTION_PRESETS = [
  { id: 'fadein', name: 'Fade in', actions: [{ type: 'fade', from: 0, to: 1, dur: 0.6, delay: 0, ease: 'outCubic' }] },
  { id: 'fadeout', name: 'Fade out', actions: [{ type: 'fade', from: 1, to: 0, dur: 0.6, delay: 0, ease: 'inCubic' }] },
  { id: 'slideup', name: 'Slide up', actions: [{ type: 'move', from: { x: 0, y: 8 }, to: { x: 0, y: 0 }, dur: 0.6, delay: 0, ease: 'outCubic' }] },
  { id: 'slideleft', name: 'Slide in from the left', actions: [{ type: 'move', from: { x: -30, y: 0 }, to: { x: 0, y: 0 }, dur: 0.7, delay: 0, ease: 'outCubic' }] },
  { id: 'pop', name: 'Pop in', actions: [{ type: 'scale', from: 0.4, to: 1, dur: 0.5, delay: 0, ease: 'outElasticCubic' }] },
  { id: 'grow', name: 'Slow zoom in', actions: [{ type: 'scale', from: 1, to: 1.12, dur: 2, delay: 0, ease: 'inOutSine' }] },
  { id: 'spin', name: 'Spin in', actions: [{ type: 'rotate', from: -12, to: 0, dur: 0.7, delay: 0, ease: 'outBack' }] },
  { id: 'focus', name: 'Focus in', actions: [{ type: 'blur', from: 24, to: 0, dur: 0.8, delay: 0, ease: 'outCubic' }] },
  { id: 'rise', name: 'Rise and fade', actions: [{ type: 'move', from: { x: 0, y: 12 }, to: { x: 0, y: 0 }, dur: 0.8, delay: 0, ease: 'outCubic' }, { type: 'fade', from: 0, to: 1, dur: 0.8, delay: 0, ease: 'outCubic' }] },
  { id: 'reveal', name: 'Wipe in', actions: [{ type: 'mask', from: 0, to: 1, dur: 0.7, delay: 0, ease: 'inOutCubic' }] },
];

/* Turns a preset into real actions that can be put on a layer. */
export function presetActions(id) {
  const p = ACTION_PRESETS.find((x) => x.id === id);
  if (!p) return [];
  return p.actions.map((a) => makeAction(a.type, a));
}
