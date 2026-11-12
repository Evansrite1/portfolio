/* The panels for the new tools in the video editor.

   Each panel is a piece of text that goes into the sheet on the left of the screen. They are
   kept here so the main editor file does not have to grow much more than it already is.

   The panels only draw. What a button does is decided in the editor. */
import { EASE_ORDER, EASINGS, easeLabel } from './ease.js';
import { ACTION_TYPES, ACTION_ORDER } from './anim.js';
import { TEXT_FX, TEXT_FX_ORDER, TEXT_FX_FIELDS } from './textfx.js';
import { SHAPES, SHAPE_ORDER } from './fx.js';
import { PAPER_PRESETS } from './paper.js';
import { PHYSICS_EFFECTS } from './physics.js';
import { allTemplates, TEMPLATE_FILTERS } from './templates.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function row(label, value, unit) {
  return '<div class="row"><label>' + label + '<b>' + value + unit + '</b></label><input type="range" ' + unit + '></div>';
}
function tog(id, label, sub, on) {
  return '<div class="tog"><div>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</div><button class="sw" role="switch" id="' + id + '" aria-checked="' + (!!on ? 'true' : 'false') + '" aria-label="' + esc(label) + '"></button></div>';
}
function hint(msg) { return '<p class="hint">' + msg + '</p>'; }

/* ------------------------------------------------------------------ animation */
export function animPanel(ctx) {
  const c = ctx.clip;
  if (!c) return hint('Tap a clip, a text or a caption on the timeline first.');
  const actions = c.actions || [];
  let h = '<h4>Animate this layer</h4>';
  h += '<p class="hint">Each animation moves one thing. You can stack them, and they all play at once.</p>';
  if (actions.length) {
    h += '<div class="actlist">';
    for (const a of actions) {
      const spec = ACTION_TYPES[a.type];
      h += '<div class="actrow" data-act="' + a.id + '">' +
        '<div class="acthead"><b>' + (spec ? spec.name : a.type) + '</b>' +
        '<button class="cpdel" data-actdel="' + a.id + '" aria-label="Remove"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
        '<div class="row"><label>Length<b data-o="dur">' + (a.dur || 0).toFixed(1) + ' s</b></label><input type="range" data-actdur="' + a.id + '" min="0.1" max="5" step="0.1" value="' + (a.dur || 0) + '"></div>' +
        '<div class="row"><label>Wait<b data-o="delay">' + (a.delay || 0).toFixed(1) + ' s</b></label><input type="range" data-actdelay="' + a.id + '" min="0" max="5" step="0.1" value="' + (a.delay || 0) + '"></div>' +
        '<div class="fld"><label>Curve</label><select data-actease="' + a.id + '">' + easeChoices(a.ease) + '</select></div>' +
        valueInputs(a) +
        '</div>';
    }
    h += '</div>';
  }
  h += '<h4>Add an animation</h4><div class="grid g2">' + ACTION_ORDER.map((k) => '<div class="card" data-addact="' + k + '">' + ACTION_TYPES[k].name + '</div>').join('') + '</div>';
  h += '<h4>Ready made</h4><div class="grid g2">' + ctx.presets.map((p) => '<div class="card" data-preset="' + p.id + '">' + p.name + '</div>').join('') + '</div>';
  h += '<div class="row" style="display:flex;gap:8px"><button class="btn" data-animcopy style="margin:0">Copy the animation</button><button class="btn" data-animpaste style="margin:0">Paste it here</button></div>';
  if (c.lane === 'text') {
    h += '<h4>How the words arrive</h4>' + textAnimControls(c);
  }
  return h;
}

function valueInputs(a) {
  const spec = ACTION_TYPES[a.type];
  if (!spec) return '';
  if (a.type === 'move') {
    return '<div class="row"><label>From left<b>' + (a.from.x || 0).toFixed(0) + '%</b></label><input type="range" data-actfrom="' + a.id + '" data-part="x" min="-100" max="100" step="1" value="' + (a.from.x || 0) + '"></div>' +
      '<div class="row"><label>To left<b>' + (a.to.x || 0).toFixed(0) + '%</b></label><input type="range" data-actto="' + a.id + '" data-part="x" min="-100" max="100" step="1" value="' + (a.to.x || 0) + '"></div>' +
      '<div class="row"><label>From up and down<b>' + (a.from.y || 0).toFixed(0) + '%</b></label><input type="range" data-actfrom="' + a.id + '" data-part="y" min="-100" max="100" step="1" value="' + (a.from.y || 0) + '"></div>' +
      '<div class="row"><label>To up and down<b>' + (a.to.y || 0).toFixed(0) + '%</b></label><input type="range" data-actto="' + a.id + '" data-part="y" min="-100" max="100" step="1" value="' + (a.to.y || 0) + '"></div>';
  }
  const unit = spec.unit || '';
  const f = (part, label, min, max, step, val) => '<div class="row"><label>' + label + '<b>' + val + unit + '</b></label><input type="range" data-act' + part + '="' + a.id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>';
  if (a.type === 'fade') return f('from', 'From', 0, 1, 0.05, a.from) + f('to', 'To', 0, 1, 0.05, a.to);
  if (a.type === 'scale') return f('from', 'From', 0, 100, 1, a.from * 100) + f('to', 'To', 0, 300, 1, a.to * 100);
  if (a.type === 'rotate') return f('from', 'From', -360, 360, 1, a.from) + f('to', 'To', -360, 360, 1, a.to);
  if (a.type === 'blur') return f('from', 'From', 0, 60, 1, a.from) + f('to', 'To', 0, 60, 1, a.to);
  if (a.type === 'mask') return f('from', 'From', 0, 1, 0.05, a.from) + f('to', 'To', 0, 1, 0.05, a.to);
  if (a.type === 'path') {
    return '<p class="hint">A path moves the layer along a line you draw. Add points on the picture by choosing Path and tapping the preview.</p>' +
      '<div class="row"><label>Speed<b>' + (a.to - a.from).toFixed(2) + '</b></label><input type="range" data-actto="' + a.id + '" data-part="num" min="0.1" max="3" step="0.05" value="' + (a.to - a.from) + '"></div>' +
      '<button class="btn" data-pathclear="' + a.id + '">Clear the points</button>';
  }
  return '';
}

function easeChoices(sel) {
  const isCustom = sel && typeof sel === 'object';
  let h = '<option value="' + (isCustom ? 'custom' : (sel || 'outCubic')) + '"' + (!isCustom && sel === 'custom' ? ' selected' : '') + '>' + easeLabel(sel) + '</option>';
  if (isCustom) h = '<option value="custom" selected>' + easeLabel(sel) + '</option>';
  for (const id of EASE_ORDER) {
    h += '<option value="' + id + '"' + (!isCustom && sel === id ? ' selected' : '') + '>' + EASINGS[id].name + '</option>';
  }
  h += '<option value="spring">Spring</option>';
  return h;
}

function textAnimControls(c) {
  const fx = c.tfx || {};
  let h = '<div class="fld"><label for="txfx">Effect</label><select id="txfx" data-txfx>' +
    TEXT_FX_ORDER.map((k) => '<option value="' + k + '"' + (fx.fx === k ? ' selected' : '') + '>' + TEXT_FX[k].name + '</option>').join('') + '</select></div>';
  h += '<div class="fld"><label for="txunit">Move by</label><select id="txunit" data-txunit>' +
    ['letter', 'word', 'line'].map((k) => '<option value="' + k + '"' + ((fx.unit || 'letter') === k ? ' selected' : '') + '>' + k[0].toUpperCase() + k.slice(1) + '</option>').join('') + '</select></div>';
  const fields = TEXT_FX_FIELDS[fx.fx] || [];
  for (const f of fields) {
    const key = f[0], label = f[1], kind = f[2];
    const v = (fx.opts && fx.opts[key] != null) ? fx.opts[key] : (TEXT_FX_OPTS_DEFAULT(fx.fx, key));
    if (kind === 'bool') h += tog('txf_' + key, label, '', v);
    else if (kind === 'color') h += '<div class="fld"><label>' + label + '</label><input type="color" data-txopt="' + key + '" value="' + v + '" style="height:44px;padding:3px"></div>';
    else if (String(kind).startsWith('select:')) {
      const list = String(kind).slice(7).split(',');
      h += '<div class="fld"><label>' + label + '</label><select data-txopt="' + key + '">' + list.map((o) => '<option value="' + o + '"' + (v === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></div>';
    } else h += '<div class="row"><label>' + label + '<b>' + v + (f[5] || '') + '</b></label><input type="range" data-txopt="' + key + '" min="' + f[3] + '" max="' + f[4] + '" step="' + (f[5] === 'px' ? 1 : 0.01) + '" value="' + v + '"></div>';
  }
  return h;
}
function TEXT_FX_OPTS_DEFAULT(fx, key) {
  const all = { typewriter: { speed: 0.08, cursor: true }, spotlight: { radius: 90, hot: '#ffe66d', path: 'sweep' }, receipt: { speed: 0.5 }, reshuffle: { settle: 1.2, swapColor: '#ffd23f' }, sphere: { radius: 160, speed: 0.6 }, cube: { speed: 0.7 }, depth: { spread: 220, focus: 0.5 }, magnifier: { radius: 90, zoom: 2, speed: 0.8 }, powboom: { duration: 0.6, over: 2.4 }, trail: { steps: 6, gap: 0.06, trailColor: '#ffd23f' }, magnetic: { pull: 90, speed: 1.2 }, rise: { duration: 0.6, stagger: 0.03, rise: 70 }, spinin: { duration: 0.7, stagger: 0.03, turn: 180 }, slidein: { duration: 0.6, stagger: 0.03, slide: 120 } };
  const d = all[fx] || {};
  return d[key] != null ? d[key] : (typeof d[key] === 'number' ? d[key] : 0);
}

/* ------------------------------------------------------------------ effects */
export function fxPanel(ctx) {
  const c = ctx.clip;
  let h = '<h4>Text effects</h4>';
  if (!c || c.lane !== 'text') h += hint('Tap a text on the timeline to give it an effect.');
  else {
    const fx = c.txf || {};
    h += '<div class="fld"><label for="fxsel">Effect</label><select id="fxsel" data-fxsel>' +
      TEXT_FX_ORDER.map((k) => '<option value="' + k + '"' + (fx.fx === k ? ' selected' : '') + '>' + TEXT_FX[k].name + '</option>').join('') + '</select></div>';
    h += '<div class="fld"><label for="fxunit">Move by</label><select id="fxunit" data-fxunit>' +
      ['letter', 'word', 'line'].map((k) => '<option value="' + k + '"' + ((fx.unit || 'letter') === k ? ' selected' : '') + '>' + k + '</option>').join('') + '</select></div>';
  }
  h += '<h4>Big effects</h4><div class="grid g2">';
  for (const p of PHYSICS_EFFECTS) h += '<div class="card" data-physics="' + p.id + '">' + p.name + '</div>';
  h += '</div><p class="hint">These are heavy. They run on the picture or the text you have chosen.</p>';

  h += '<h4>Take the background away</h4>';
  h += '<button class="btn pri" data-cutout>' + 'Remove the background' + '</button>';
  h += '<p class="hint" id="cutoutMsg">Finds the subject and takes the rest away. The engine is about 15 MB and comes once.</p>';
  if (ctx.cutout) {
    h += '<h4>Fix the edges</h4>';
    h += '<div class="row"><label>Brush size<b>' + (ctx.cutout.size || 40) + ' px</b></label><input type="range" data-cutsize min="6" max="160" step="2" value="' + (ctx.cutout.size || 40) + '"></div>';
    h += '<div class="chips"><span class="chip" data-cutmode="add" aria-pressed="' + (ctx.cutout.mode !== 'erase') + '">Keep</span><span class="chip" data-cutmode="erase" aria-pressed="' + (ctx.cutout.mode === 'erase') + '">Take away</span></div>';
    h += '<div class="row"><label>Soft edge<b>' + (ctx.cutout.soften || 1) + ' px</b></label><input type="range" data-cutsoften min="0" max="8" step="1" value="' + (ctx.cutout.soften || 1) + '"></div>';
    h += '<button class="btn" data-cutredo>Start again</button>';
    h += '<button class="btn" data-cutapply>Use this cut</button>';
  }
  h += '<h4>Green screen</h4>';
  h += '<p class="hint">Takes one colour out and leaves the rest see-through. Pick the colour from the picture.</p>';
  h += '<button class="btn" data-keypick>Pick a colour from the picture</button>';
  h += '<button class="btn" data-keyapply>Take that colour out</button>';
  return h;
}

/* ------------------------------------------------------------------ shapes */
export function shapePanel(ctx) {
  const c = ctx.clip;
  let h = '<h4>Add a shape</h4><div class="grid g2">';
  for (const k of SHAPE_ORDER) h += '<div class="card" data-shape="' + k + '" aria-pressed="' + (c && c.shape === k ? 'true' : 'false') + '">' + SHAPES[k].name + '</div>';
  h += '</div>';
  h += '<h4>Your own drawing</h4><p class="hint">A picture saved as SVG. It keeps its shape and stays sharp at any size.</p>';
  h += '<button class="btn pri" data-uploadsvg>Choose an SVG file</button>';
  if (c && c.svg) h += '<p class="hint">One SVG is on this layer.</p>';
  if (c && (c.shape || c.svg)) {
    h += '<h4>How it looks</h4>';
    h += '<div class="row"><label>Width<b>' + (c.w == null ? 30 : c.w) + '%</b></label><input type="range" data-shapep="w" min="2" max="100" step="1" value="' + (c.w == null ? 30 : c.w) + '"></div>';
    h += '<div class="row"><label>Height<b>' + (c.h == null ? 30 : c.h) + '%</b></label><input type="range" data-shapep="h" min="2" max="100" step="1" value="' + (c.h == null ? 30 : c.h) + '"></div>';
    h += '<div class="fld"><label>Colour</label><input type="color" data-shapecolor value="' + (c.color || '#ffffff') + '" style="height:44px;padding:3px"></div>';
    h += '<div class="fld"><label>Fill</label><select data-shapefill>' +
      ['solid', 'linear', 'radial'].map((k) => '<option value="' + k + '"' + ((c.fill && c.fill.type === k ? c.fill.type : 'solid') === k ? ' selected' : '') + '>' + k[0].toUpperCase() + k.slice(1) + '</option>').join('') + '</select></div>';
    h += '<div class="row"><label>Turn<b>' + (c.rot || 0) + '°</b></label><input type="range" data-shapep="rot" min="-180" max="180" step="1" value="' + (c.rot || 0) + '"></div>';
    h += '<div class="fld"><label>Blend</label><select data-blend>' +
      [{ id: 'source-over', name: 'Normal' }, { id: 'multiply', name: 'Multiply' }, { id: 'screen', name: 'Screen' }, { id: 'overlay', name: 'Overlay' }, { id: 'soft-light', name: 'Soft light' }, { id: 'difference', name: 'Difference' }].map((b) => '<option value="' + b.id + '"' + ((c.blend || 'source-over') === b.id ? ' selected' : '') + '>' + b.name + '</option>').join('') + '</select></div>';
  }
  return h;
}

/* ------------------------------------------------------------------ paper */
export function paperPanel(ctx) {
  const c = ctx.clip;
  if (!c || (c.lane !== 'main' && c.lane !== 'text')) return hint('Tap a picture or a text on the timeline first.');
  let h = '<h4>Look of paper</h4><div class="grid g2">';
  for (const p of PAPER_PRESETS) h += '<div class="card" data-paper="' + p.id + '" aria-pressed="' + ((c.paper && c.paper.preset === p.id) ? 'true' : 'false') + '">' + p.name + '</div>';
  h += '</div>';
  if (c.paper) {
    h += '<div class="row"><label>Torn edge<b>' + Math.round((c.paper.torn || 0) * 100) + '%</b></label><input type="range" data-paperp="torn" min="0" max="1" step="0.05" value="' + (c.paper.torn || 0) + '"></div>';
    h += '<div class="row"><label>Texture<b>' + Math.round((c.paper.texture || 0) * 100) + '%</b></label><input type="range" data-paperp="texture" min="0" max="1" step="0.05" value="' + (c.paper.texture || 0) + '"></div>';
    h += '<div class="row"><label>Shadow<b>' + Math.round((c.paper.shadow || 0) * 100) + '%</b></label><input type="range" data-paperp="shadow" min="0" max="1" step="0.05" value="' + (c.paper.shadow || 0) + '"></div>';
  }
  if (c.lane === 'main') {
    h += '<h4>Fold it open</h4>' + tog('foldon', 'Open like a folded sheet', '', !!c.fold);
    if (c.fold) {
      h += '<div class="row"><label>Folds<b>' + (c.fold.panels || 4) + '</b></label><input type="range" data-foldp="panels" min="2" max="8" step="1" value="' + (c.fold.panels || 4) + '"></div>';
      h += '<div class="row"><label>How far it leans<b>' + Math.round(c.fold.angle || 34) + '°</b></label><input type="range" data-foldp="angle" min="0" max="70" step="1" value="' + (c.fold.angle || 34) + '"></div>';
    }
  }
  if (c.lane === 'text') {
    h += '<h4>Magazine letters</h4>' + tog('mag', 'Cut each letter out', 'Each letter on its own scrap', !!c.magazine);
    if (c.magazine) {
      h += '<div class="row"><label>How much they turn<b>' + (c.magazine.turn || 7) + '°</b></label><input type="range" data-magp="turn" min="0" max="25" step="1" value="' + (c.magazine.turn || 7) + '"></div>';
      h += '<div class="row"><label>How much they move<b>' + (c.magazine.jitter || 5) + ' px</b></label><input type="range" data-magp="jitter" min="0" max="24" step="1" value="' + (c.magazine.jitter || 5) + '"></div>';
    }
    h += '<h4>Match cut</h4><p class="hint">Pages that line up in place, the way a magazine cuts from one picture to the next.</p>';
    h += '<div class="fld"><label for="matchstyle">Style</label><select id="matchstyle" data-matchstyle>' +
      ['classic', 'press'].map((k) => '<option value="' + k + '"' + ((c.match && c.match.style === k ? c.match.style : 'classic') === k ? ' selected' : '') + '>' + (k === 'classic' ? 'Classic' : 'Press') + '</option>').join('') + '</select></div>';
    if (c.match) {
      h += '<div class="row"><label>Soft<b>' + Math.round((c.match.blur || 0) * 100) + '%</b></label><input type="range" data-matchp="blur" min="0" max="1" step="0.05" value="' + (c.match.blur || 0) + '"></div>';
      h += '<div class="row"><label>Glitch<b>' + Math.round((c.match.glitch || 0) * 100) + '%</b></label><input type="range" data-matchp="glitch" min="0" max="1" step="0.05" value="' + (c.match.glitch || 0) + '"></div>';
      h += tog('matchdark', 'Dark theme', '', !!c.match.dark);
    }
  }
  return h;
}

/* ------------------------------------------------------------------ brand kit */
export function brandPanel(ctx) {
  const b = ctx.brand;
  let h = '<h4>Your colours</h4>';
  if (b.colors.length) {
    h += '<div class="swatches">';
    for (const c of b.colors) h += '<button class="bsw" style="background:' + c.hex + ';color:' + (c.hex === '#ffffff' ? '#111' : '#fff') + '" data-brandcolor="' + c.hex + '" title="' + esc(c.name) + '">' + esc(c.name.slice(0, 6)) + '</button>';
    h += '</div>';
  } else h += hint('No colours saved yet.');
  h += '<div class="row"><label>New colour</label><input type="color" id="brandnew" value="#ff5b52" style="height:44px;padding:3px;width:100%"></div>';
  h += '<div class="fld"><label for="brandname">Name</label><input id="brandname" placeholder="Brand red" value=""></div>';
  h += '<button class="btn pri" data-brandadd>Save this colour</button>';

  h += '<h4>Your fonts</h4>';
  if (b.fonts.length) {
    for (const f of b.fonts) {
      h += '<div class="item" data-brandfont="' + f.id + '"><span style="font-family:' + esc(f.family) + '">' + esc(f.name) + '</span><small>Use</small></div>';
    }
  } else h += hint('No fonts saved yet.');
  h += '<button class="btn" data-brandfontup>Add a font file</button>';
  h += '<p class="hint">Fonts are kept on this computer only.</p>';

  h += '<h4>Your curves</h4>';
  if (b.easings.length) {
    for (const e of b.easings) {
      h += '<div class="item" data-brandease="' + e.id + '"><span>' + esc(e.name) + '</span><small>Use</small></div>';
    }
  } else h += hint('No curves saved yet.');
  h += '<button class="btn" data-brandcurve>Save the curve on this layer</button>';
  return h;
}

/* ------------------------------------------------------------------ templates */
export function templatesPanel(ctx) {
  const list = allTemplates();
  let h = '<h4>Looks you can use</h4><div class="grid g2">';
  for (const t of list) h += '<div class="card" data-template="' + esc(t.id) + '">' + esc(t.name) + '</div>';
  h += '</div>';
  h += '<p class="hint">' + (list[0] ? esc(list[0].note) : '') + '</p>';
  h += '<h4>Keep this look</h4><p class="hint">Saves the style of the captions, the text and the picture so you can use it again.</p>';
  h += '<div class="fld"><label for="tplname">Name</label><input id="tplname" placeholder="My look" value=""></div>';
  h += '<button class="btn pri" data-templatesave>Save this look</button>';
  return h;
}

export { TEMPLATE_FILTERS };
