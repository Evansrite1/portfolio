/* Easing curves for the video editor.
   A curve takes progress 0..1 and returns a value that is usually 0..1, but may go outside it
   (that is how overshoot and bounce work). Pure code with no browser APIs, so it also runs in Node.

   This is the one place every animation in the editor gets its timing from: text animations,
   clip animations, motion paths, transitions and the brand kit all read from here. */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* The classic back easing, one and a half times stronger than the usual 1.70158 in some
   references. This is the value the editor has always used, so it stays. */
const BACK = 1.70158;

function outBounce(p) {
  const n = 7.5625, d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
}
function inBounce(p) { return 1 - outBounce(1 - p); }
function inOutBounce(p) { return p < 0.5 ? (1 - outBounce(1 - 2 * p)) / 2 : (1 + outBounce(2 * p - 1)) / 2; }

/* Elastic with exponential decay. It starts at 0 and ends at 1. */
function outElastic(p) {
  if (p === 0) return 0; if (p === 1) return 1;
  const c = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c) + 1;
}
function inElastic(p) {
  if (p === 0) return 0; if (p === 1) return 1;
  const c = (2 * Math.PI) / 3;
  return -Math.pow(2, 10 * p - 10) * Math.sin((p * 10 - 10.75) * c);
}
function inOutElastic(p) {
  if (p === 0) return 0; if (p === 1) return 1;
  const c = (2 * Math.PI) / 4.5;
  if (p < 0.5) return -(Math.pow(2, 20 * p - 10) * Math.sin((20 * p - 11.125) * c)) / 2;
  return (Math.pow(2, -20 * p + 10) * Math.sin((20 * p - 11.125) * c)) / 2 + 1;
}

/* Every curve, with the name and group the interface shows. The id is what gets saved in a project. */
export const EASINGS = {
  linear: { name: 'Linear', group: 'Basic', fn: (p) => p },
  inQuad: { name: 'Ease in', group: 'Basic', fn: (p) => p * p },
  outQuad: { name: 'Ease out', group: 'Basic', fn: (p) => 1 - (1 - p) * (1 - p) },
  inOutQuad: { name: 'Ease in and out', group: 'Basic', fn: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) },
  inCubic: { name: 'Strong ease in', group: 'Basic', fn: (p) => p * p * p },
  outCubic: { name: 'Smooth ease out', group: 'Basic', fn: (p) => 1 - Math.pow(1 - p, 3) },
  inOutCubic: { name: 'Smooth in and out', group: 'Basic', fn: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2) },
  inQuart: { name: 'Heavy ease in', group: 'Basic', fn: (p) => p * p * p * p },
  outQuart: { name: 'Heavy ease out', group: 'Basic', fn: (p) => 1 - Math.pow(1 - p, 4) },
  inOutQuart: { name: 'Heavy in and out', group: 'Basic', fn: (p) => (p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2) },
  inQuint: { name: 'Slow start', group: 'Basic', fn: (p) => p * p * p * p * p },
  outQuint: { name: 'Slow finish', group: 'Basic', fn: (p) => 1 - Math.pow(1 - p, 5) },
  inOutQuint: { name: 'Slow in and out', group: 'Basic', fn: (p) => (p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2) },
  inSine: { name: 'Gentle in', group: 'Basic', fn: (p) => 1 - Math.cos((p * Math.PI) / 2) },
  outSine: { name: 'Gentle out', group: 'Basic', fn: (p) => Math.sin((p * Math.PI) / 2) },
  inOutSine: { name: 'Gentle in and out', group: 'Basic', fn: (p) => -(Math.cos(Math.PI * p) - 1) / 2 },
  inExpo: { name: 'Snap in', group: 'Basic', fn: (p) => (p === 0 ? 0 : Math.pow(2, 10 * p - 10)) },
  outExpo: { name: 'Snap out', group: 'Basic', fn: (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)) },
  inOutExpo: { name: 'Snap in and out', group: 'Basic', fn: (p) => (p === 0 ? 0 : p === 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2) },
  inCirc: { name: 'Round in', group: 'Basic', fn: (p) => 1 - Math.sqrt(1 - p * p) },
  outCirc: { name: 'Round out', group: 'Basic', fn: (p) => Math.sqrt(1 - (p - 1) * (p - 1)) },
  inOutCirc: { name: 'Round in and out', group: 'Basic', fn: (p) => (p < 0.5 ? (1 - Math.sqrt(1 - 4 * p * p)) / 2 : (Math.sqrt(1 - Math.pow(-2 * p + 2, 2)) + 1) / 2) },
  inBack: { name: 'Pull back in', group: 'Overshoot', fn: (p) => (BACK + 1) * p * p * p - BACK * p * p },
  outBack: { name: 'Overshoot out', group: 'Overshoot', fn: (p) => 1 + (BACK + 1) * Math.pow(p - 1, 3) + BACK * Math.pow(p - 1, 2) },
  inOutBack: { name: 'Overshoot in and out', group: 'Overshoot', fn: (p) => (p < 0.5 ? (Math.pow(2 * p, 2) * ((BACK + 1) * 2 * p - BACK)) / 2 : (Math.pow(2 * p - 2, 2) * ((BACK + 1) * (2 * p - 2) + BACK) + 2) / 2) },
  outElastic: { name: 'Elastic out', group: 'Overshoot', fn: outElastic },
  inElastic: { name: 'Elastic in', group: 'Overshoot', fn: inElastic },
  inOutElastic: { name: 'Elastic in and out', group: 'Overshoot', fn: inOutElastic },
  /* The cubic form of elastic. It lands exactly on 0 and 1 and the editor has used it for the
     popping captions from the start, so it stays the curve behind that look. */
  outElasticCubic: { name: 'Elastic pop', group: 'Overshoot', fn: (p) => 1 + (BACK + 1) * Math.pow(p - 1, 3) + BACK * Math.pow(p - 1, 2) },
  inBounce: { name: 'Bounce in', group: 'Bounce', fn: inBounce },
  outBounce: { name: 'Bounce out', group: 'Bounce', fn: outBounce },
  inOutBounce: { name: 'Bounce in and out', group: 'Bounce', fn: inOutBounce }
};

/* The order the interface lists the curves in. */
export const EASE_ORDER = [
  'linear', 'outCubic', 'inCubic', 'inOutCubic', 'outQuad', 'inQuad', 'inOutQuad',
  'outQuart', 'outQuint', 'outSine', 'inSine', 'inOutSine', 'outExpo', 'inExpo', 'inOutExpo',
  'outCirc', 'inCirc', 'inOutCirc', 'outBack', 'inBack', 'inOutBack',
  'outElastic', 'inElastic', 'inOutElastic', 'outElasticCubic',
  'outBounce', 'inBounce', 'inOutBounce'
];

/* A cubic bezier curve, solved the same way CSS does. The two control points are the ones you
   drag in the curve editor, so the shape you draw is the shape you get. */
export function bezierEasing(x1, y1, x2, y2) {
  if (x1 === y1 && x2 === y2) return (p) => p;
  const A = (a, b) => 1 - 3 * b + 3 * a;
  const B = (a, b) => 3 * b - 6 * a;
  const C = (a) => 3 * a;
  const calc = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    /* Try the fast way first. */
    let t = p;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (!s) break;
      const e = calc(t, x1, x2) - p;
      if (Math.abs(e) < 1e-6) return calc(t, y1, y2);
      t -= e / s;
    }
    /* If the curve was too flat for that, walk it in steps instead. */
    let lo = 0, hi = 1; t = p;
    for (let i = 0; i < 24 && hi - lo > 1e-6; i++) {
      if (calc(t, x1, x2) < p) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return calc(t, y1, y2);
  };
}

/* A spring. It settles at the end instead of arriving at a fixed time, which is what makes
   movement feel like it has weight. */
export function springEasing(opts) {
  const { stiffness = 170, damping = 16, mass = 1, velocity = 0 } = opts || {};
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const under = zeta < 1;
  const wd = under ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
  const k = under ? (zeta * w0 + velocity) / wd : 0;
  const at = (p) => {
    const e = Math.exp(-zeta * w0 * p);
    if (under) return 1 - e * (Math.cos(wd * p) + k * Math.sin(wd * p));
    return 1 - e * (1 + (w0 + velocity) * p);
  };
  const start = at(0), end = at(1);
  const span = end - start;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    if (!span) return 1;
    return (at(p) - start) / span;
  };
}

/* Turns whatever was saved in a project into a curve you can call.
   A curve is either a name from the list, a set of bezier points, or spring settings. */
export function makeEase(spec) {
  if (typeof spec === 'function') return spec;
  if (!spec) return EASINGS.linear.fn;
  if (typeof spec === 'string') return (EASINGS[spec] || EASINGS.linear).fn;
  if (Array.isArray(spec)) return bezierEasing(spec[0], spec[1], spec[2], spec[3]);
  if (spec.bezier) return bezierEasing(spec.bezier[0], spec.bezier[1], spec.bezier[2], spec.bezier[3]);
  if (spec.spring) return springEasing(spec.spring);
  return EASINGS.linear.fn;
}

/* The name to show for a saved curve. */
export function easeLabel(spec) {
  if (!spec) return EASINGS.linear.name;
  if (typeof spec === 'string') return (EASINGS[spec] || EASINGS.linear).name;
  if (Array.isArray(spec) || spec.bezier) return 'Custom curve';
  if (spec.spring) return 'Spring';
  return EASINGS.linear.name;
}

/* True when the curve is one of the built in ones, which means it can be shown in the list. */
export function isNamedEase(spec) { return typeof spec === 'string' && !!EASINGS[spec]; }

/* A curve that starts and ends where it should. Used to check a new curve before it is saved. */
export function curveEndpoints(fn) {
  const a = fn(0), b = fn(1);
  return { start: Math.abs(a) < 1e-6, end: Math.abs(b - 1) < 1e-6 };
}

export { clamp };
