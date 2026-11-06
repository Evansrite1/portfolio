/* Free online video editor. Everything runs in the browser; files are never uploaded.
   Preview and export share one renderer (renderFrame), so what you see is what you export. */
const MB = '/tools/vendor/mediabunny/mediabunny.min.mjs';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ------------------------------------------------------------------ state */
const ADJ0 = { bri: 100, con: 100, sat: 100, temp: 0, vig: 0, zoom: 100 };
const today = new Date().toISOString().slice(0, 10);
const st = {
  name: 'My video', ratio: '16/9', fit: 'blur', clips: [], sel: null, cap: { style: 'mix', size: 6, y: 76, accent: '', anim: 'pop', emph: true, chunk: '3' },
  meta: { title: '', desc: '', author: '', copy: '', tags: '', date: today, place: '', strip: true, cover: 0 }
};
const media = new Map();
let uid = 1, DUR = 0, t = 0, pps = 30, playing = false, last = 0, tool = null, exporting = false;
const undoStack = [], redoStack = [];

const RATIOS = { '16/9': [16, 9], '9/16': [9, 16], '1/1': [1, 1], '4/5': [4, 5] };
function dims(ratio, shortSide) {
  const [a, b] = RATIOS[ratio];
  const w = a >= b ? Math.round(shortSide * a / b) : shortSide;
  const h = a >= b ? shortSide : Math.round(shortSide * b / a);
  return [w - (w % 2), h - (h % 2)];
}

/* ------------------------------------------------------------------ helpers */
function toast(m) { const e = $('toast'); e.textContent = m; e.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove('on'), 2400); }
function fmt(s) { s = Math.max(0, s); const m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + (x < 10 ? '0' : '') + x; }
function fmtp(s) { return fmt(s) + '.' + Math.floor((s % 1) * 10); }
function size(n) { const mb = n / 1048576; return mb >= 1000 ? (mb / 1024).toFixed(2) + ' GB' : mb >= 10 ? Math.round(mb) + ' MB' : mb.toFixed(1) + ' MB'; }
const get = (id) => st.clips.find((c) => c.id === id);
const mains = () => st.clips.filter((c) => c.lane === 'main');
const cdur = (c) => c.lane === 'main' ? (c.out - c.in) / c.speed : c.lane === 'audio' ? c.out - c.in : c.d;

function snapshot() { return JSON.stringify({ clips: st.clips, ratio: st.ratio, fit: st.fit, meta: st.meta, name: st.name, cap: st.cap }); }
function commit() {
  const s = snapshot();
  if (undoStack[undoStack.length - 1] !== s) { undoStack.push(s); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; }
  updateActs();
}
function restore(s) { const o = JSON.parse(s); st.clips = o.clips; st.ratio = o.ratio; st.fit = o.fit; st.meta = o.meta; st.name = o.name; st.cap = o.cap || st.cap; $('pname').value = st.name; applyRatio(); refresh(); if (tool) openTool(tool); }
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }

function layout() {
  let x = 0;
  for (const c of mains()) { c.s = x; x += cdur(c); }
  DUR = x;
  if (t > DUR) t = DUR;
}
function mainAt(tt) {
  const m = mains();
  for (const c of m) if (tt >= c.s && tt < c.s + cdur(c)) return c;
  return m.length && tt >= DUR ? m[m.length - 1] : null;
}

/* ------------------------------------------------------------------ rendering (shared by preview and export) */
const bgc = document.createElement('canvas');
function filterString(c) {
  const a = c.adj || ADJ0;
  let f = 'brightness(' + a.bri + '%) contrast(' + a.con + '%) saturate(' + a.sat + '%)';
  if (a.temp) f += ' sepia(' + Math.abs(a.temp) / 2 + '%) hue-rotate(' + (a.temp < 0 ? 180 : -10) + 'deg)';
  if (c.filter && c.filter !== 'none') f += ' ' + c.filter;
  return f;
}
function drawClip(ctx, W, H, c, src, fx) {
  const sw0 = src.videoWidth || src.naturalWidth || src.width, sh0 = src.videoHeight || src.naturalHeight || src.height;
  if (!sw0 || !sh0) return;
  fx = fx || {};
  const a = c.adj || ADJ0, rot = (((c.rot || 0) % 360) + 360) % 360, turned = rot === 90 || rot === 270;
  const sw = turned ? sh0 : sw0, sh = turned ? sw0 : sh0;
  if (st.fit === 'blur') {
    const bw = Math.max(16, Math.round(W / 24)), bh = Math.max(16, Math.round(H / 24));
    bgc.width = bw; bgc.height = bh;
    const b = bgc.getContext('2d'), s = Math.max(bw / sw0, bh / sh0);
    b.filter = 'none';
    b.drawImage(src, (bw - sw0 * s) / 2, (bh - sh0 * s) / 2, sw0 * s, sh0 * s);
    ctx.save(); ctx.imageSmoothingQuality = 'high'; ctx.globalAlpha = 0.85; ctx.drawImage(bgc, 0, 0, W, H); ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0, 0, W, H);
  }
  const s = (st.fit === 'fill' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)) * (a.zoom / 100) * (fx.zoom || 1);
  const dw = sw0 * s, dh = sh0 * s;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.globalAlpha = (c.op == null ? 100 : c.op) / 100;
  ctx.filter = filterString(c) + (fx.blur ? ' blur(' + fx.blur.toFixed(1) + 'px)' : '');
  ctx.translate(W / 2, H / 2);
  if (rot) ctx.rotate(rot * Math.PI / 180);
  if (c.fx || c.fy) ctx.scale(c.fx ? -1 : 1, c.fy ? -1 : 1);
  ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  if (a.vig > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (a.vig / 100 * 0.9) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}
/* transitions: each one works on a single picture, so they behave the same in the preview and in the export */
const TRANS = [['none', 'None'], ['fade', 'Fade'], ['flash', 'Flash'], ['zoom', 'Zoom in'], ['blur', 'Blur in']];
const TR_D = 0.5, TR_HALF = 0.25;
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
function nextMain(c) { const m = mains(), i = m.indexOf(c); return i >= 0 ? m[i + 1] : null; }
function transFx(c, tt, H) {
  const out = { zoom: 1, blur: 0, over: null };
  const into = c.tr && c.tr !== 'none' ? (tt - c.s) / Math.min(c.tr === 'fade' || c.tr === 'flash' ? TR_HALF : TR_D, cdur(c) / 2) : 2;
  if (into >= 0 && into < 1) {
    if (c.tr === 'zoom') out.zoom = 1.4 - 0.4 * easeOut(into);
    else if (c.tr === 'blur') out.blur = (1 - easeOut(into)) * 16 * (H / 720);
    else if (c.tr === 'fade') out.over = 'rgba(0,0,0,' + (1 - into) + ')';
    else if (c.tr === 'flash') out.over = 'rgba(255,255,255,' + Math.pow(1 - into, 1.5) + ')';
  }
  const nx = nextMain(c);
  if (nx && (nx.tr === 'fade' || nx.tr === 'flash')) {
    const left = c.s + cdur(c) - tt, w = Math.min(TR_HALF, cdur(c) / 2);
    if (left >= 0 && left < w) out.over = (nx.tr === 'fade' ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (1 - left / w) + ')';
  }
  return out;
}
function fadeGain(c, tt) {
  const d = cdur(c); let g = 1;
  const fi = Math.min(c.fi || 0, d / 2), fo = Math.min(c.fo || 0, d / 2);
  if (fi > 0) g = Math.min(g, (tt - c.s) / fi);
  if (fo > 0) g = Math.min(g, (c.s + d - tt) / fo);
  return clamp(g, 0, 1);
}
function drawText(ctx, W, H, c) {
  const px = Math.round(c.size / 100 * H);
  ctx.save();
  ctx.font = (c.bold ? '800 ' : '500 ') + px + 'px ' + c.font;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = String(c.str || '').split('\n'), lh = px * 1.2;
  const cx = c.x / 100 * W, cy = c.y / 100 * H - ((lines.length - 1) * lh) / 2;
  if (c.bg) {
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + px * 0.8, h = lines.length * lh + px * 0.3;
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    const x = cx - w / 2, y = (c.y / 100 * H) - h / 2, r = px * 0.3;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  }
  lines.forEach((l, i) => {
    const y = cy + i * lh;
    if (c.outline) { ctx.lineWidth = Math.max(2, px * 0.14); ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.strokeText(l, cx, y); }
    else if (!c.bg) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = px * 0.25; ctx.shadowOffsetY = px * 0.06; }
    ctx.fillStyle = c.color; ctx.fillText(l, cx, y);
    ctx.shadowColor = 'transparent';
  });
  ctx.restore();
}
const CF = { arial: 'Arial, Helvetica, sans-serif', impact: 'Impact, "Arial Black", sans-serif', heavy: '"Arial Black", Impact, sans-serif', round: '"Trebuchet MS", "Segoe UI", sans-serif', mono: '"Courier New", monospace', serif: 'Georgia, "Times New Roman", serif', comic: '"Comic Sans MS", "Trebuchet MS", sans-serif' };
/* One entry per look. n name, f font, w weight, it italic, up/low upper or lower case, sp letter spacing, scale size multiplier,
   col main colour (mainAcc: the highlight colour replaces it), act colour of the word being spoken, dim opacity of words not yet spoken,
   line box behind each line, pill rounded white label, wbox box behind the spoken word, stroke outline, hs hard shadow, sh soft shadow,
   glow glow colour, grad gradient, hollow outline only, type words appear one by one, one only the spoken word. */
const CAP_DEFS = {
  classic: { n: 'Classic', f: 'arial', w: 700, line: 'rgba(0,0,0,.68)' },
  pop: { n: 'Bold pop', f: 'impact', w: 900, up: 1, col: '#ffd23f', mainAcc: 1, stroke: 0.2 },
  karaoke: { n: 'Karaoke', f: 'arial', w: 700, line: 'rgba(0,0,0,.68)', act: '#ffd23f', dim: 0.5 },
  minimal: { n: 'Minimal', f: 'arial', w: 700, sh: 0.3 },
  hormozi: { n: 'Viral green', f: 'heavy', w: 900, up: 1, stroke: 0.2, act: '#2ee06a' },
  highlight: { n: 'Highlighter', f: 'arial', w: 800, up: 1, stroke: 0.07, wbox: '#ffd23f', actCol: '#111111' },
  neon: { n: 'Neon glow', f: 'arial', w: 800, up: 1, glow: '#00f0ff' },
  soft: { n: 'Soft', f: 'round', w: 600, low: 1, sh: 0.35, act: '#ffffff', dim: 0.45 },
  bubble: { n: 'Bubble', f: 'round', w: 800, pill: '#ffffff', col: '#111111' },
  hollow: { n: 'Hollow', f: 'heavy', w: 900, up: 1, hollow: 1, act: '#ffd23f' },
  sunset: { n: 'Sunset', f: 'impact', w: 900, up: 1, grad: ['#ffe259', '#ff512f'], stroke: 0.16 },
  comic: { n: 'Comic', f: 'comic', w: 900, col: '#ffe600', mainAcc: 1, stroke: 0.18, hs: 0.07 },
  typewriter: { n: 'Typewriter', f: 'mono', w: 700, line: 'rgba(0,0,0,.75)', col: '#7cff9b', mainAcc: 1, type: 1 },
  spaced: { n: 'Spaced', f: 'arial', w: 700, up: 1, sp: 0.16, sh: 0.3, act: '#ffd23f', dim: 0.6 },
  news: { n: 'Breaking news', f: 'arial', w: 800, up: 1, line: '#d90f1d', act: '#ffe600' },
  aesthetic: { n: 'Aesthetic', f: 'serif', w: 700, it: 1, glow: '#ff7ad9', gl: 0.5 },
  single: { n: 'One word', f: 'impact', w: 900, up: 1, stroke: 0.2, one: 1, scale: 1.5 },
  trend: { n: 'Trending', f: 'impact', w: 900, up: 1, stroke: 0.2, cyc: 1 },
  boxes: { n: 'Colour boxes', f: 'heavy', w: 900, up: 1, allbox: 1 },
  underline: { n: 'Underline', f: 'round', w: 800, stroke: 0.1, ul: 1 },
  pill: { n: 'Dark pill', f: 'round', w: 800, pill: '#111111', col: '#ffffff', wbox: '#ffd23f', actCol: '#111111' },
  stack: { n: 'Stacked', f: 'impact', w: 900, up: 1, stroke: 0.2, stack: 1, act: '#ffd23f', scale: 1.1 },
  cinema: { n: 'Cinema', f: 'serif', w: 600, up: 1, sp: 0.14, sh: 0.3, scale: 0.85 },
  mix: { n: 'Smart mix', mix: 1 }
};
/* looks that Smart mix rotates through, one per caption */
const MIX = ['pop', 'highlight', 'trend', 'boxes', 'neon', 'hormozi', 'underline', 'pill', 'stack', 'comic'];
const CYC = ['#ffffff', '#ffd23f', '#2ee06a', '#35c6ff', '#ff4fb0'];
const BOXC = [['#ffd23f', '#111111'], ['#ffffff', '#111111'], ['#2ee06a', '#111111'], ['#ff4fb0', '#ffffff'], ['#35c6ff', '#111111']];
const CAP_ANIMS = [['none', 'None'], ['pop', 'Pop'], ['bounce', 'Bounce'], ['slide', 'Slide up'], ['fade', 'Fade']];
const CAP_CHUNKS = [['1', '1 word'], ['2', '2 words'], ['3', '3 words'], ['5', '5 words'], ['line', 'Sentence']];
const POWER = new Set('free new never best stop secret money win now only must hack easy fast big love hate truth why how proof results guaranteed everything nothing always million billion thousand percent sale profit growth viral mistake wrong'.split(' '));
const STOPW = /^(the|and|that|this|with|have|from|they|there|their|about|would|could|should|because|really|actually)$/i;
/* words worth emphasising: numbers, money, shouted words, power words, and the longest word when nothing else stands out */
function emphSet(toks) {
  const set = new Set(), allCaps = toks.every((t) => t === t.toUpperCase());
  let best = -1, bl = 0;
  toks.forEach((t, i) => {
    const w = t.replace(/[^A-Za-z0-9$%'\u00a3\u20ac]/g, ''); if (!w) return;
    if (/\d/.test(w) || /^[$\u00a3\u20ac]/.test(w) || (!allCaps && w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) || POWER.has(w.toLowerCase())) set.add(i);
    if (w.length > bl && !STOPW.test(w)) { bl = w.length; best = i; }
  });
  if (!set.size && toks.length >= 3 && bl >= 6) set.add(best);
  return set;
}
const eob = (p) => { const k = 1.70158; return 1 + (k + 1) * Math.pow(p - 1, 3) + k * Math.pow(p - 1, 2); };
function animFor(kind, p, px) {
  if (kind === 'pop') return { sc: 0.55 + 0.45 * eob(p), dy: 0, al: Math.min(1, p * 3) };
  if (kind === 'bounce') return { sc: 1, dy: -px * 0.38 * Math.sin(p * Math.PI), al: 1 };
  if (kind === 'slide') return { sc: 1, dy: (1 - easeOut(p)) * px * 0.55, al: Math.min(1, p * 2.5) };
  if (kind === 'fade') return { sc: 1, dy: 0, al: p };
  return { sc: 1, dy: 0, al: 1 };
}
const CAP_COLORS = ['#ffd23f', '#2ee06a', '#ff4fb0', '#35c6ff', '#ff8a2a', '#ff3b3b', '#ffffff'];
function capActive(c, n, tt) {
  if (c.words && c.words.length === n) { let k = 0; for (let i = 0; i < n; i++) if (tt >= c.words[i].s) k = i; return k; }
  return Math.min(n - 1, Math.max(0, Math.floor((tt - c.s) / Math.max(0.1, c.d) * n)));
}
function capRound(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
}
function drawCaption(ctx, W, H, c, tt, opt) {
  const S = Object.assign({}, st.cap, opt || {});
  const key = S.style === 'mix' ? MIX[(c.mi || 0) % MIX.length] : S.style, D = CAP_DEFS[key] || CAP_DEFS.classic;
  const orig = String(c.str).split(/\s+/).filter(Boolean); if (!orig.length) return;
  let text = String(c.str); if (D.up) text = text.toUpperCase(); else if (D.low) text = text.toLowerCase();
  let toks = text.split(/\s+/).filter(Boolean);
  const n = toks.length, idx = capActive(c, n, tt), acc = S.accent || D.act || '', base = D.mainAcc ? (S.accent || D.col) : (D.col || '#ffffff');
  const glowCol = S.accent || D.glow || '', hot = S.emph ? emphSet(orig) : new Set(), hotCol = S.accent || '#ffd23f';
  const wstart = (i) => (c.words && c.words.length === n) ? c.words[i].s : c.s + (i / n) * c.d;
  const px = Math.round(S.size / 100 * Math.min(W, H) * (D.scale || 1) * (S.style === 'mix' && n === 1 ? 1.3 : 1));
  const entries = D.one ? [{ t: toks[idx], i: idx }] : toks.map((t, i) => ({ t, i }));
  ctx.save();
  ctx.font = (D.it ? 'italic ' : '') + D.w + ' ' + px + 'px ' + CF[D.f];
  if ('letterSpacing' in ctx) ctx.letterSpacing = D.sp ? Math.round(px * D.sp) + 'px' : '0px';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const gap = D.allbox ? px * 0.42 : 0, sp = ctx.measureText(' ').width + gap, maxW = W * 0.86, lines = [[]]; let lw = 0;
  entries.forEach((en) => {
    const w = ctx.measureText(en.t).width, L = lines[lines.length - 1];
    if (L.length && (D.stack || lw + sp + w > maxW)) { lines.push([]); lw = 0; }
    const cur = lines[lines.length - 1]; cur.push({ t: en.t, w, i: en.i }); lw += (cur.length > 1 ? sp : 0) + w;
  });
  const lh = px * (D.stack ? 1.12 : 1.28), total = lines.length * lh, top = S.y / 100 * H - total / 2;
  lines.forEach((L, li) => {
    const width = L.reduce((a, x) => a + x.w, 0) + sp * (L.length - 1), y = top + li * lh + lh / 2;
    let x = (W - width) / 2;
    const bx = x - px * 0.4, bw = width + px * 0.8, bh = lh * 0.98, by = y - bh / 2;
    if (D.line) { ctx.fillStyle = D.line; capRound(ctx, bx, by, bw, bh, px * 0.3); }
    if (D.pill) { ctx.fillStyle = D.pill; capRound(ctx, bx - px * 0.1, by + bh * 0.04, bw + px * 0.2, bh * 0.92, bh * 0.46); }
    L.forEach((wd) => {
      const state = wd.i < idx ? 'past' : wd.i === idx ? 'act' : 'next';
      if (D.type && state === 'next') { x += wd.w + sp; return; }
      const isHot = hot.has(wd.i);
      let A = { sc: 1, dy: 0, al: 1 };
      if (S.anim && S.anim !== 'none' && (state === 'act' || D.one)) A = animFor(S.anim, clamp((tt - wstart(wd.i)) / 0.2, 0, 1), px);
      if (isHot) A.sc *= 1.14;
      let col = base;
      if (state === 'act' && acc && !D.wbox && !D.mainAcc) col = acc;
      if (isHot && !D.wbox && !D.allbox && !D.cyc) col = hotCol;
      if (D.cyc) col = CYC[(wd.i + (c.mi || 0)) % CYC.length];
      const cxw = x + wd.w / 2;
      ctx.save();
      ctx.translate(cxw, y + A.dy); ctx.scale(A.sc, A.sc); ctx.translate(-cxw, -y);
      if (D.allbox) { const bc = BOXC[(wd.i + (c.mi || 0)) % BOXC.length]; ctx.globalAlpha = A.al; ctx.fillStyle = S.accent && isHot ? S.accent : bc[0]; capRound(ctx, x - px * 0.2, y - lh * 0.46, wd.w + px * 0.4, lh * 0.92, px * 0.22); col = bc[1]; }
      if (D.wbox && state === 'act') { ctx.fillStyle = acc || D.wbox; capRound(ctx, x - px * 0.18, y - lh * 0.46, wd.w + px * 0.36, lh * 0.92, px * 0.22); col = D.actCol; }
      ctx.globalAlpha = (D.dim && state === 'next' ? D.dim : 1) * A.al;
      ctx.lineJoin = 'round';
      if (D.hs) { ctx.fillStyle = '#000'; ctx.fillText(wd.t, x + px * D.hs, y + px * D.hs); }
      if (D.stroke) { ctx.lineWidth = Math.max(2, px * D.stroke); ctx.strokeStyle = '#000'; ctx.strokeText(wd.t, x, y); }
      if (D.hollow) {
        ctx.lineWidth = Math.max(2, px * 0.07); ctx.strokeStyle = state === 'act' ? col : '#ffffff'; ctx.strokeText(wd.t, x, y);
        if (state === 'act') { ctx.fillStyle = col; ctx.fillText(wd.t, x, y); }
      } else if (D.glow) {
        ctx.fillStyle = col; ctx.shadowColor = glowCol;
        for (const k of [1, 0.55, 0.25]) { ctx.shadowBlur = px * k * 0.9 * (D.gl || 1); ctx.fillText(wd.t, x, y); }
        ctx.shadowColor = 'transparent'; ctx.fillText(wd.t, x, y);
      } else {
        if (D.grad) { const g = ctx.createLinearGradient(0, y - lh * 0.4, 0, y + lh * 0.4); g.addColorStop(0, D.grad[0]); g.addColorStop(1, D.grad[1]); ctx.fillStyle = g; } else ctx.fillStyle = col;
        if (D.sh) { ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = px * D.sh; ctx.shadowOffsetY = px * 0.05; }
        ctx.fillText(wd.t, x, y);
      }
      if (D.ul && state === 'act') { ctx.shadowColor = 'transparent'; ctx.fillStyle = S.accent || '#ffd23f'; capRound(ctx, x, y + px * 0.5, wd.w, Math.max(3, px * 0.11), px * 0.06); }
      ctx.restore();
      x += wd.w + sp;
    });
  });
  ctx.restore();
}
/* small previews for the Look list, drawn with the same code that renders the video */
function paintCapThumbs() {
  document.querySelectorAll('canvas[data-ct]').forEach((cv) => {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#34343c'); bg.addColorStop(1, '#15151a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    drawCaption(g, W, H, { str: 'Make it pop', words: null, s: 0, d: 2, mi: 0 }, 0.9, { style: cv.dataset.ct, size: 21, y: 52 });
  });
}
function renderFrame(ctx, W, H, tt, src) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const c = mainAt(tt);
  if (c && src) {
    const fx = transFx(c, tt, H);
    drawClip(ctx, W, H, c, src, fx);
    if (fx.over) { ctx.fillStyle = fx.over; ctx.fillRect(0, 0, W, H); }
  }
  for (const x of st.clips) if (x.lane === 'text' && tt >= x.s && tt < x.s + x.d) drawText(ctx, W, H, x);
  const cp = st.clips.find((x) => x.lane === 'cap' && tt >= x.s && tt < x.s + x.d);
  if (cp) drawCaption(ctx, W, H, cp, tt);
}

/* ------------------------------------------------------------------ preview and playback */
const cv = $('cv'), cx = cv.getContext('2d');
function previewSrc(c) { const m = media.get(c.mid); return m ? m.el : null; }
let drawQueued = false;
function draw() {
  const c = mainAt(t);
  renderFrame(cx, cv.width, cv.height, t, c ? previewSrc(c) : null);
  $('time').textContent = fmt(t) + ' / ' + fmt(DUR);
}
function requestDraw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); }
function applyRatio() {
  const [w, h] = dims(st.ratio, 720);
  cv.width = w; cv.height = h;
  const stg = $('stage');
  stg.style.aspectRatio = st.ratio;
  stg.classList.toggle('tall', RATIOS[st.ratio][1] > RATIOS[st.ratio][0]);
  requestDraw();
}
function seekMedia(tt) {
  const c = mainAt(tt);
  if (c) {
    const m = media.get(c.mid);
    if (m && m.type === 'video') {
      const want = clamp(c.in + (tt - c.s) * c.speed, 0, m.dur);
      if (Math.abs(m.el.currentTime - want) > 0.03) m.el.currentTime = want;
    }
  }
}
let activeMain = null;
const activeAudio = new Set();
function syncMedia() {
  const c = mainAt(t);
  if (c !== activeMain) {
    if (activeMain) { const pm = media.get(activeMain.mid); if (pm && pm.type === 'video' && (!c || media.get(c.mid) !== pm)) pm.el.pause(); }
    activeMain = c;
  }
  if (c) {
    const m = media.get(c.mid);
    if (m && m.type === 'video') {
      const want = c.in + (t - c.s) * c.speed;
      if (m.el.paused) { m.el.currentTime = want; }
      else if (Math.abs(m.el.currentTime - want) > 0.3) m.el.currentTime = want;
      m.el.playbackRate = clamp(c.speed, 0.0625, 16);
      m.el.volume = clamp(c.vol / 100 * fadeGain(c, t), 0, 1);
      if (m.el.paused) m.el.play().catch(() => {});
    }
  }
  for (const a of st.clips) {
    if (a.lane !== 'audio') continue;
    const m = media.get(a.mid); if (!m) continue;
    const on = t >= a.s && t < a.s + cdur(a);
    if (on) {
      const want = a.in + (t - a.s);
      m.el.volume = clamp(a.vol / 100 * fadeGain(a, t), 0, 1);
      if (m.el.paused) { m.el.currentTime = want; m.el.play().catch(() => {}); activeAudio.add(m); }
      else if (Math.abs(m.el.currentTime - want) > 0.3) m.el.currentTime = want;
    } else if (!m.el.paused) { m.el.pause(); activeAudio.delete(m); }
  }
}
function pauseAll() {
  for (const m of media.values()) if (m.type !== 'image' && !m.el.paused) m.el.pause();
  activeAudio.clear(); activeMain = null;
}
function loop(now) {
  if (!playing) return;
  t += Math.min(0.25, (now - last) / 1000); last = now;
  if (t >= DUR) { t = DUR; setPlay(false); }
  syncMedia(); draw(); head(); follow();
  if (playing) requestAnimationFrame(loop);
}
function setPlay(p) {
  if (!DUR) return;
  playing = p;
  $('playIco').innerHTML = p ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  if (p) { if (t >= DUR - 0.05) t = 0; last = performance.now(); requestAnimationFrame(loop); }
  else { pauseAll(); seekMedia(t); updateActs(); }
}
function seek(tt) { t = clamp(tt, 0, DUR); if (playing) { pauseAll(); } seekMedia(t); head(); requestDraw(); $('time').textContent = fmt(t) + ' / ' + fmt(DUR); updateActs(); }
function follow() { const sc = $('scroll'), x = t * pps; if (x > sc.scrollLeft + sc.clientWidth - 30 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 30); }

/* ------------------------------------------------------------------ importing media */
function waitFor(el, ok, bad) {
  return new Promise((res, rej) => {
    const done = (f, v) => { el.removeEventListener(ok, onok); el.removeEventListener(bad, onbad); f(v); };
    const onok = () => done(res); const onbad = () => done(rej, new Error('decode'));
    el.addEventListener(ok, onok); el.addEventListener(bad, onbad);
  });
}
async function thumbFor(m) {
  const c = document.createElement('canvas'); c.width = 160; c.height = 90;
  const g = c.getContext('2d');
  const draw1 = (src) => {
    const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight;
    const s = Math.max(160 / sw, 90 / sh);
    g.drawImage(src, (160 - sw * s) / 2, (90 - sh * s) / 2, sw * s, sh * s);
  };
  try {
    if (m.type === 'image') draw1(m.el);
    else if (m.type === 'video') {
      const el = m.el, was = el.currentTime;
      el.currentTime = Math.min(0.5, m.dur / 2);
      await waitFor(el, 'seeked', 'error');
      draw1(el); el.currentTime = was;
    } else { g.fillStyle = '#0b7a58'; g.fillRect(0, 0, 160, 90); }
    return c.toDataURL('image/jpeg', 0.7);
  } catch (e) { return ''; }
}
/* Some files do not say how long they are (recordings made in a browser are the usual case), so the browser reports
   "Infinity". Work the real length out instead of letting it break the timeline. */
async function realDuration(el, file) {
  if (isFinite(el.duration) && el.duration > 0) return el.duration;
  try {
    const mb = await import(MB), input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const d = await input.computeDuration(); input.dispose && input.dispose();
    if (isFinite(d) && d > 0) return d;
  } catch (e) { /* try the next way */ }
  try {
    await new Promise((res) => { const f = () => { el.removeEventListener('durationchange', f); el.removeEventListener('timeupdate', f); res(); }; el.addEventListener('durationchange', f); el.addEventListener('timeupdate', f); el.currentTime = 1e9; setTimeout(res, 4000); });
    el.currentTime = 0;
  } catch (e) { /* use what we have */ }
  return isFinite(el.duration) && el.duration > 0 ? el.duration : 5;
}
async function importFile(file) {
  const type = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : (/\.(mov|mkv|mp4|m4v|webm)$/i.test(file.name) ? 'video' : null);
  if (!type) throw new Error(file.name + ' is not a video, photo or audio file.');
  const id = 'm' + uid++, url = URL.createObjectURL(file);
  const m = { id, file, url, type, name: file.name, dur: 5, w: 0, h: 0, thumb: '' };
  try {
    if (type === 'video') {
      const el = document.createElement('video'); el.preload = 'auto'; el.playsInline = true; el.src = url;
      await waitFor(el, 'loadedmetadata', 'error');
      if (!el.videoWidth) throw new Error('decode');
      m.el = el; m.dur = await realDuration(el, file); m.w = el.videoWidth; m.h = el.videoHeight;
      el.addEventListener('seeked', () => { if (!playing && !exporting) requestDraw(); });
      await waitFor(el, 'loadeddata', 'error').catch(() => {});
    } else if (type === 'image') {
      const el = new Image(); el.src = url; await el.decode();
      m.el = el; m.w = el.naturalWidth; m.h = el.naturalHeight;
    } else {
      const el = new Audio(); el.preload = 'auto'; el.src = url;
      await waitFor(el, 'loadedmetadata', 'error');
      m.el = el; m.dur = await realDuration(el, file);
    }
  } catch (e) {
    URL.revokeObjectURL(url);
    throw new Error(file.name + ' could not be opened. Try an MP4 (H.264), WebM, JPG, PNG or MP3 file.');
  }
  m.thumb = await thumbFor(m);
  media.set(id, m);
  if (type !== 'image') ensureAudioStats(m).then(() => { if (m.stats) drawTL(); });
  return m;
}
function addToTimeline(m) {
  commit();
  let c;
  if (m.type === 'audio') {
    c = { id: 'c' + uid++, lane: 'audio', mid: m.id, s: Math.min(t, Math.max(0, DUR - 1)), in: 0, out: Math.min(m.dur, Math.max(DUR || m.dur, 1)), vol: 100 };
    if (!DUR) c.out = m.dur;
  } else {
    c = { id: 'c' + uid++, lane: 'main', mid: m.id, in: 0, out: m.type === 'image' ? 5 : m.dur, speed: 1, vol: 100, adj: { ...ADJ0 }, filter: 'none' };
  }
  st.clips.push(c); st.sel = c.id;
  return c;
}
async function handleFiles(files) {
  const list = [...files]; if (!list.length) return;
  const wasBlank = !mains().length;
  toast('Opening ' + list.length + (list.length > 1 ? ' files...' : ' file...'));
  const errors = [];
  let first = !mains().length;
  for (const f of list) {
    try {
      const m = await importFile(f);
      if (first && m.type !== 'audio' && m.w && m.h) {
        st.ratio = m.h > m.w ? '9/16' : '16/9';
        if (Math.abs(m.w / m.h - 1) < 0.05) st.ratio = '1/1';
        applyRatio(); first = false;
      }
      addToTimeline(m);
    } catch (e) { errors.push(e.message); }
  }
  refresh();
  if (errors.length) toast(errors[0]);
  else toast('Added. Your files stay on this device.');
  if (wasBlank && mains().length) setTimeout(fitZoom, 60);
  if (wasBlank && mains().length && !errors.length) setTimeout(offerTour, 1400);
  if (tool === 'add') openTool('add');
  if (mains().length && !playing) seek(t);
}

/* ------------------------------------------------------------------ audio statistics: waveform and silence */
const isDesk = () => matchMedia('(min-width:1100px) and (min-height:620px)').matches;
async function ensureAudioStats(m) {
  if (m.stats !== undefined) return m.stats;
  m.stats = null;
  try {
    if (m.type === 'image' || m.file.size > 220e6) return null;
    const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 8000);
    const ab = await ac.decodeAudioData(await m.file.arrayBuffer());
    const ch = ab.getChannelData(0), hop = 160, n = Math.floor(ch.length / hop), rms = new Float32Array(n);
    let max = 0;
    for (let i = 0; i < n; i++) { let q = 0; for (let j = i * hop; j < (i + 1) * hop; j++) q += ch[j] * ch[j]; rms[i] = Math.sqrt(q / hop); if (rms[i] > max) max = rms[i]; }
    m.stats = n > 2 && max > 0.0005 ? { rms, hz: 50, max } : null;
  } catch (e) { m.stats = null; }
  return m.stats;
}
function waveHtml(c, m, lane) {
  if (!m || m.type === 'image') return '';
  const S = m.stats;
  if (!S) return lane === 'audio' ? '<span class="wv"></span>' : '';
  const a = Math.floor(c.in * S.hz), b = Math.min(S.rms.length, Math.ceil(c.out * S.hz)), len = b - a;
  if (len < 2) return '';
  const N = Math.min(240, len), step = len / N; let top = '', bot = '';
  for (let i = 0; i < N; i++) {
    let mx = 0; const k1 = Math.floor(a + (i + 1) * step);
    for (let k = Math.floor(a + i * step); k < k1 && k < S.rms.length; k++) if (S.rms[k] > mx) mx = S.rms[k];
    const v = Math.min(48, Math.pow(mx / S.max, 0.6) * 48);
    top += (i ? 'L' : 'M') + i + ',' + (50 - v).toFixed(1) + ' '; bot = 'L' + i + ',' + (50 + v).toFixed(1) + ' ' + bot;
  }
  return '<svg class="wf ' + lane + '" viewBox="0 0 ' + N + ' 100" preserveAspectRatio="none"><path d="' + top + bot + 'Z"/></svg>';
}
/* cut out the pauses: keep the parts of a clip where someone is speaking or making sound */
async function removeSilences(c) {
  const m = media.get(c.mid); if (!m || m.type === 'image') return;
  toast('Listening for pauses...');
  const S = await ensureAudioStats(m);
  if (!S) { toast('This file has no sound that can be read, so there are no pauses to find.'); return; }
  const hz = S.hz, a0 = Math.floor(c.in * hz), b0 = Math.min(S.rms.length, Math.ceil(c.out * hz));
  const sorted = Array.from(S.rms.slice(a0, b0)).sort((x, y) => x - y);
  const floor = sorted[Math.floor(sorted.length * 0.1)] || 0;
  let thr = Math.max(floor * 3, 0.006); if (thr > S.max * 0.25) thr = S.max * 0.25;
  const bridge = Math.round(0.35 * hz), pad = 0.1;
  const segs = []; let cur = null, gapN = 0;
  for (let k = a0; k < b0; k++) {
    if (S.rms[k] > thr) { if (!cur) cur = { a: k, b: k }; cur.b = k; gapN = 0; }
    else if (cur && ++gapN > bridge) { segs.push(cur); cur = null; gapN = 0; }
  }
  if (cur) segs.push(cur);
  const keep = segs.map((q) => ({ a: Math.max(c.in, q.a / hz - pad), b: Math.min(c.out, (q.b + 1) / hz + pad) })).filter((q) => q.b - q.a >= 0.25);
  const total = keep.reduce((x, q) => x + (q.b - q.a), 0), removed = (c.out - c.in) - total;
  if (!keep.length || keep.length < 2 && removed < 0.6) { toast('No long pauses were found in this clip.'); return; }
  commit();
  const news = keep.map((q) => { const n = JSON.parse(JSON.stringify(c)); n.id = 'c' + uid++; n.in = q.a; n.out = q.b; return n; });
  const i = st.clips.indexOf(c); st.clips.splice(i, 1, ...news); st.sel = news[0].id;
  refresh(); seek(Math.min(t, DUR));
  toast('Removed ' + removed.toFixed(1) + ' seconds of pauses. Undo brings them back.');
}

/* ------------------------------------------------------------------ timeline UI */
const COLORS = { main: 'v', text: 't', cap: 'c', audio: 'a' };
const LANE_NAMES = { main: 'Video', text: 'Text', cap: 'Captions', audio: 'Sound' };
function lanesInUse() { return ['main', 'text', 'cap', 'audio'].filter((l) => isDesk() || l === 'main' || st.clips.some((c) => c.lane === l)); }
const RULER_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
function drawTL() {
  $('canvas').style.width = (Math.max(DUR, 10) * pps + 100) + 'px';
  let r = ''; const step = RULER_STEPS.find((x) => x * pps >= 70) || 600, span = Math.max(DUR, 10);
  for (let k = 0; k * step <= span + step; k++) { const i = k * step; r += '<span style="left:' + i * pps + 'px">' + (step < 1 ? fmtp(i) : fmt(i)) + '</span>'; }
  $('ruler').innerHTML = r;
  let h = '';
  for (const lane of lanesInUse()) {
    h += '<div class="lane">';
    for (const c of st.clips.filter((x) => x.lane === lane)) {
      const sel = c.id === st.sel, k = COLORS[lane];
      const m = media.get(c.mid);
      const bg = (lane === 'main' && m && m.thumb) ? ' style="left:' + c.s * pps + 'px;width:' + cdur(c) * pps + 'px;background-image:linear-gradient(rgba(20,40,90,.55),rgba(20,40,90,.55)),url(' + m.thumb + ')"' : ' style="left:' + c.s * pps + 'px;width:' + Math.max(8, cdur(c) * pps) + 'px"';
      const name = (lane === 'text' || lane === 'cap') ? c.str : (m ? m.name : '');
      h += '<div class="clip ' + k + (sel ? ' sel' : '') + (lane !== 'main' ? ' free' : '') + '" data-id="' + c.id + '"' + bg + '>' +
        waveHtml(c, m, lane) + (sel ? '<span class="hd l" data-h="l"></span><span class="hd r" data-h="r"></span>' : '') +
        '<span class="lb">' + esc(name) + '</span></div>';
    }
    h += '</div>';
  }
  $('lanes').innerHTML = h; head();
  $('tllabels').innerHTML = '<div class="sp"></div>' + lanesInUse().map((l) => '<div class="ll">' + LANE_NAMES[l] + '</div>').join('');
  drawInsp();
}
function head() { $('ph').style.left = (t * pps) + 'px'; }
function updateActs() {
  const c = get(st.sel), on = !!c;
  $('split').disabled = !on || !(c && t > c.s + 0.2 && t < c.s + cdur(c) - 0.2);
  $('dup').disabled = !on; $('del').disabled = !on;
  const m = mains(), i = m.indexOf(c);
  $('left').disabled = !(c && c.lane === 'main' && i > 0);
  $('right').disabled = !(c && c.lane === 'main' && i >= 0 && i < m.length - 1);
  $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length;
  $('exportBtn').disabled = !DUR;
}
function refresh() {
  layout();
  const has = mains().length > 0;
  $('app').classList.toggle('blank', !has);
  drawTL(); buildToolbar(); updateActs(); requestDraw();
  if (isDesk() && !tool) openTool('add');
}
$('lanes').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.clip'); if (!el) return;
  const c = get(el.dataset.id); if (!c) return;
  const wasSel = st.sel === c.id;
  const h = e.target.closest('[data-h]');
  if (!wasSel) { st.sel = c.id; drawTL(); updateActs(); if (tool && tool !== 'add') openTool(tool); return; }
  const sx = e.clientX;
  if (h) {
    e.preventDefault(); commit();
    const side = h.dataset.h, m = media.get(c.mid);
    const s0 = c.s, in0 = c.in, out0 = c.out, d0 = c.d;
    const move = (ev) => {
      const dt = (ev.clientX - sx) / pps;
      if (c.lane === 'text' || c.lane === 'cap') {
        if (side === 'l') { const nd = clamp(d0 - dt, 0.3, d0 + s0); c.s = s0 + (d0 - nd); c.d = nd; } else c.d = Math.max(0.3, d0 + dt);
      } else {
        const max = m && m.type !== 'image' ? m.dur : 3600, sp = c.lane === 'main' ? c.speed : 1;
        if (side === 'l') c.in = clamp(in0 + dt * sp, 0, out0 - 0.3); else c.out = clamp(out0 + dt * sp, in0 + 0.3, max);
        if (c.lane === 'audio' && side === 'l') c.s = Math.max(0, s0 + (c.in - in0));
      }
      layout(); drawTL(); updateActs(); requestDraw();
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); refresh(); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
    return;
  }
  if (c.lane === 'main') return;
  e.preventDefault(); commit();
  const s0 = c.s;
  const move = (ev) => { c.s = Math.max(0, s0 + (ev.clientX - sx) / pps); el.style.left = c.s * pps + 'px'; };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); refresh(); };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
});
function seekFromEvent(e) { const r = $('scroll').getBoundingClientRect(); seek(($('scroll').scrollLeft + e.clientX - r.left) / pps); updateActs(); }
$('ruler').addEventListener('pointerdown', (e) => {
  if (!DUR) return; seekFromEvent(e);
  const mv = (ev) => seekFromEvent(ev); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
/* timeline zoom: the moment under the pointer (or the red line) stays where it is */
const PPS_MIN = 2, PPS_MAX = 400;
function syncZoomUI() {
  const z = $('zslider'); if (z) z.value = Math.round(100 * Math.log(pps / PPS_MIN) / Math.log(PPS_MAX / PPS_MIN));
  $('zin').disabled = pps >= PPS_MAX - 0.01; $('zout').disabled = pps <= PPS_MIN + 0.01;
}
function setZoom(next, anchorX) {
  const sc = $('scroll'); next = clamp(next, PPS_MIN, PPS_MAX);
  if (Math.abs(next - pps) < 0.001) { syncZoomUI(); return; }
  const head = t * pps, ax = anchorX != null ? anchorX : (head >= sc.scrollLeft && head <= sc.scrollLeft + sc.clientWidth ? head - sc.scrollLeft : sc.clientWidth / 2);
  const timeAt = (sc.scrollLeft + ax) / pps;
  pps = next; drawTL(); sc.scrollLeft = Math.max(0, timeAt * pps - ax); syncZoomUI();
}
function fitZoom() { const sc = $('scroll'); if (!DUR) return; setZoom((sc.clientWidth - 70) / DUR, 0); sc.scrollLeft = 0; }
$('zin').onclick = () => setZoom(pps * 1.4);
$('zout').onclick = () => setZoom(pps / 1.4);
$('zfit').onclick = fitZoom;
$('zslider').addEventListener('input', (e) => setZoom(PPS_MIN * Math.pow(PPS_MAX / PPS_MIN, +e.target.value / 100)));
$('scroll').addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault(); setZoom(pps * Math.exp(-e.deltaY * 0.0022), e.clientX - $('scroll').getBoundingClientRect().left);
}, { passive: false });
$('undo').onclick = undo; $('redo').onclick = redo;
$('split').onclick = () => {
  const c = get(st.sel); if (!c || $('split').disabled) return;
  commit();
  const n = JSON.parse(JSON.stringify(c)); n.id = 'c' + uid++;
  if (c.lane === 'main') { const at = c.in + (t - c.s) * c.speed; n.in = at; c.out = at; }
  else if (c.lane === 'audio') { const at = c.in + (t - c.s); n.in = at; n.s = t; c.out = at; }
  else if (c.lane === 'cap') {
    const toks = String(c.str).split(/\s+/).filter(Boolean), ok = c.words && c.words.length === toks.length;
    let k = ok ? c.words.filter((w) => w.s < t).length : Math.round(toks.length * (t - c.s) / c.d);
    k = clamp(k, 1, Math.max(1, toks.length - 1));
    n.s = t; n.d = c.s + c.d - t; c.d = t - c.s;
    c.str = toks.slice(0, k).join(' '); n.str = toks.slice(k).join(' ');
    if (ok) { c.words = c.words.slice(0, k); n.words = n.words.slice(k); } else { c.words = null; n.words = null; }
  }
  else { n.s = t; n.d = c.s + c.d - t; c.d = t - c.s; }
  st.clips.splice(st.clips.indexOf(c) + 1, 0, n); st.sel = n.id;
  refresh(); toast('Split at ' + fmt(t));
};
$('del').onclick = () => { const c = get(st.sel); if (!c) return; commit(); st.clips.splice(st.clips.indexOf(c), 1); st.sel = null; refresh(); seek(t); if (tool) openTool(tool); toast('Deleted'); };
$('dup').onclick = () => {
  const c = get(st.sel); if (!c) return; commit();
  const n = JSON.parse(JSON.stringify(c)); n.id = 'c' + uid++;
  if (c.lane !== 'main') n.s = c.s + cdur(c);
  st.clips.splice(st.clips.indexOf(c) + 1, 0, n); st.sel = n.id; refresh(); toast('Copied');
};
function moveMain(dir) {
  const c = get(st.sel); if (!c || c.lane !== 'main') return;
  const m = mains(), i = m.indexOf(c), o = m[i + dir]; if (!o) return;
  commit();
  const a = st.clips.indexOf(c), b = st.clips.indexOf(o);
  st.clips[a] = o; st.clips[b] = c; refresh(); seek(c.s);
}
$('left').onclick = () => moveMain(-1); $('right').onclick = () => moveMain(1);

/* ------------------------------------------------------------------ transport and keys */
$('play').onclick = () => setPlay(!playing);
$('toStart').onclick = () => { seek(0); $('scroll').scrollLeft = 0; updateActs(); };
$('toEnd').onclick = () => { seek(DUR); updateActs(); };
addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
  if (e.target.isContentEditable || tourEl) return;
  const modal = $('modal');
  if (modal && modal.classList.contains('on')) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); modal.classList.remove('on'); } return; }
  const onRange = e.target.type === 'range';
  if (e.ctrlKey || e.metaKey) {
    if (e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'd') { e.preventDefault(); $('dup').click(); }
    return;
  }
  if (e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); setPlay(!playing); }
  else if (e.key === 's' || e.key === 'S') $('split').click();
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); $('del').click(); }
  else if (e.key === 'Home') { e.preventDefault(); $('toStart').click(); }
  else if (e.key === 'End') { e.preventDefault(); $('toEnd').click(); }
  else if (e.key === '?') { e.preventDefault(); $('help').click(); }
  else if (e.key === 'g' || e.key === 'G') $('guides').click();
  else if (e.key === '+' || e.key === '=') $('zin').click();
  else if (e.key === '-' || e.key === '_') $('zout').click();
  else if (e.key === '0') $('zfit').click();
  else if (!onRange && e.key === 'ArrowLeft') { e.preventDefault(); seek(t - (e.shiftKey ? 1 : 1 / 30)); }
  else if (!onRange && e.key === 'ArrowRight') { e.preventDefault(); seek(t + (e.shiftKey ? 1 : 1 / 30)); }
});
/* Space is taken by the editor, so a focused button must not also click when the key is released */
addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && !e.target.isContentEditable && !tourEl) e.preventDefault();
});
addEventListener('beforeunload', (e) => { if (mains().length) { e.preventDefault(); e.returnValue = ''; } });
$('pname').addEventListener('input', (e) => { st.name = e.target.value; });

/* add files: button, drop */
$('addFirst').onclick = () => $('file').click();
$('file').onchange = (e) => { handleFiles(e.target.files); e.target.value = ''; };
const stw = $('stagewrap');
['dragenter', 'dragover'].forEach((ev) => addEventListener(ev, (e) => { e.preventDefault(); stw.classList.add('dropzone'); }));
['dragleave', 'drop'].forEach((ev) => addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.relatedTarget === null) stw.classList.remove('dropzone'); }));
addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

/* ------------------------------------------------------------------ toolbar and panels */
const I = {
  add: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>', text: '<svg viewBox="0 0 24 24"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  filt: '<svg viewBox="0 0 24 24"><circle cx="9" cy="10" r="6"/><circle cx="15" cy="10" r="6"/><circle cx="12" cy="15" r="6"/></svg>',
  adj: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  speed: '<svg viewBox="0 0 24 24"><path d="M12 14l4-4"/><path d="M4 18a9 9 0 1 1 16 0"/></svg>',
  size: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M3 8v8M21 8v8"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>',
  cap: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 11h4M13 11h4M7 15h7"/></svg>',
  clip: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 6v12M16 6v12"/></svg>'
};
const TOOLS = [['add', 'Add', 'add'], ['text', 'Text', 'text'], ['cap', 'Captions', 'cap'], ['music', 'Sound', 'music'], ['filt', 'Filters', 'filt'], ['adjust', 'Adjust', 'adj'], ['speed', 'Speed', 'speed'], ['size', 'Size', 'size'], ['clip', 'Clip', 'clip'], ['info', 'Details', 'info']];
function buildToolbar() {
  const has = mains().length > 0;
  $('toolbar').innerHTML = TOOLS.map((x) => '<button class="tb" data-t="' + x[0] + '"' + (has || x[0] === 'add' ? '' : ' disabled') + ' aria-pressed="' + (tool === x[0]) + '">' + I[x[2]] + x[1] + '</button>').join('');
}
$('toolbar').onclick = (e) => { const b = e.target.closest('.tb'); if (!b || b.disabled) return; if (b.dataset.t === 'add' && !mains().length) { $('file').click(); return; } openTool(b.dataset.t); };
$('shDone').onclick = closeTool;
function closeTool() { if (isDesk()) { openTool('add'); return; } tool = null; $('app').classList.remove('open'); buildToolbar(); requestAnimationFrame(requestDraw); }

const FILTERS = [['None', 'none', '#555'], ['Warm', 'sepia(.35) saturate(1.3)', '#c1783c'], ['Cool', 'hue-rotate(160deg) saturate(1.1)', '#3c78c1'], ['Noir', 'grayscale(1) contrast(1.2)', '#222'], ['Vivid', 'saturate(1.8) contrast(1.1)', '#d6336c'], ['Fade', 'contrast(.8) brightness(1.15) saturate(.8)', '#9a9a9a'], ['Retro', 'sepia(.6) hue-rotate(-20deg) contrast(1.1)', '#8a5a2b'], ['Dreamy', 'brightness(1.1) saturate(1.2)', '#b48ead'], ['Cinema', 'contrast(1.25) saturate(.9) brightness(.9)', '#1d3f4a']];
const FONTS = [['Clean', 'Arial, Helvetica, sans-serif'], ['Impact', 'Impact, "Arial Black", sans-serif'], ['Serif', 'Georgia, "Times New Roman", serif'], ['Typewriter', '"Courier New", monospace'], ['Handwritten', '"Comic Sans MS", cursive']];
const TEXT_STYLES = { 'Bold title': { font: FONTS[1][1], bold: true, color: '#ffffff', bg: false, outline: false, size: 9 }, 'Outline': { font: FONTS[0][1], bold: true, color: '#ffffff', bg: false, outline: true, size: 8 }, 'Caption bar': { font: FONTS[0][1], bold: true, color: '#ffffff', bg: true, outline: false, size: 5 }, 'Typewriter': { font: FONTS[3][1], bold: false, color: '#ffffff', bg: false, outline: false, size: 6 }, 'Gold': { font: FONTS[2][1], bold: true, color: '#ffd23f', bg: false, outline: true, size: 8 }, 'Handwritten': { font: FONTS[4][1], bold: true, color: '#ffffff', bg: false, outline: false, size: 8 } };
function selIs(lane) { const c = get(st.sel); return c && c.lane === lane ? c : null; }
function selVis() { const c = get(st.sel); return c && c.lane === 'main' ? c : null; }
function slider(path, label, min, max, unit, val) {
  return '<div class="row"><label>' + label + '<b data-o="' + path + '">' + val + unit + '</b></label><input type="range" data-p="' + path + '" data-u="' + unit + '" min="' + min + '" max="' + max + '" value="' + val + '"></div>';
}
function tg(id, label, sub, on) { return '<div class="tog"><div>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</div><button class="sw" role="switch" id="' + id + '" aria-checked="' + (!!on) + '" aria-label="' + label + '"></button></div>'; }
function hint(msg) { return '<p class="hint">' + msg + '</p>'; }

function openTool(k) {
  tool = k; $('app').classList.add('open'); buildToolbar();
  const T = { add: 'Media', text: 'Text', cap: 'Captions', music: 'Sound', filt: 'Filters', adjust: 'Adjust', speed: 'Speed', size: 'Size', clip: 'Clip', info: 'Video details' };
  $('shTitle').textContent = T[k];
  let h = '';
  const v = selVis();
  if (k === 'add') {
    h = '<button class="btn pri" id="pick">' + I.add + 'Add from this device</button><p class="hint">Videos, photos and music. They stay on this device.</p>';
    const list = [...media.values()];
    if (list.length) {
      h += '<h4>Your files (tap to add again)</h4><div class="lib">' + list.map((m) => '<div class="thumb" data-use="' + m.id + '" style="' + (m.thumb ? 'background-image:url(' + m.thumb + ')' : '') + '"><span class="k">' + m.type + '</span><span>' + esc(m.name.length > 14 ? m.name.slice(0, 12) + '..' : m.name) + '</span></div>').join('') + '</div>';
    }
    h += '<h4>Record</h4><a class="btn" href="/tools/screen-recorder/" target="_blank" rel="noopener">Record your screen first</a>';
  }
  if (k === 'text') {
    const tc = selIs('text');
    h = '<h4>Your words</h4><div class="fld"><textarea id="txIn" placeholder="Type here" style="min-height:64px">' + (tc ? esc(tc.str) : '') + '</textarea></div>';
    h += '<button class="btn pri" id="txAdd">' + (tc ? 'Add another text at the red line' : 'Add text at the red line') + '</button><h4>Style</h4><div class="grid g2">' + Object.keys(TEXT_STYLES).map((x) => '<div class="card" data-style="' + x + '">' + x + '</div>').join('') + '</div>';
    if (tc) {
      h += '<h4>This text</h4>' + slider('size', 'Size', 2, 20, '', tc.size) + slider('x', 'Left and right', 0, 100, '%', tc.x) + slider('y', 'Up and down', 0, 100, '%', tc.y);
      h += '<div class="fld"><label for="txFont">Font</label><select id="txFont">' + FONTS.map((f) => '<option value="' + esc(f[1]) + '"' + (f[1] === tc.font ? ' selected' : '') + '>' + f[0] + '</option>').join('') + '</select></div>';
      h += '<div class="fld"><label for="txColor">Colour</label><input type="color" id="txColor" value="' + tc.color + '" style="height:44px;padding:3px"></div>' + tg('txBg', 'Dark box behind text', '', tc.bg) + tg('txOut', 'Outline', '', tc.outline) + tg('txBold', 'Bold', '', tc.bold);
    } else h += hint('Tap a text bar on the timeline to change it.');
  }
  if (k === 'cap') h = capPanelHtml();
  if (k === 'clip') h = clipPanelHtml();
  if (k === 'music') {
    h = '<button class="btn pri" id="pickAudio">' + I.music + 'Add music from this device</button><button class="btn" id="rec">Record voiceover</button><p class="hint" id="recMsg">Sound is added at the red line. Free music is not included, so use a track you have the rights to.</p>';
    const c = get(st.sel);
    if (c && (c.lane === 'audio' || c.lane === 'main')) {
      const m = media.get(c.mid);
      if (c.lane === 'audio' || (m && m.type === 'video')) h += '<h4>Volume of the selected clip</h4>' + slider('vol', 'Volume', 0, 200, '%', c.vol) + '<div class="chips"><span class="chip" data-vol="0">Mute</span><span class="chip" data-vol="100">Normal</span><span class="chip" data-vol="150">Louder</span></div>';
    } else h += hint('Tap a clip on the timeline to change its volume.');
  }
  if (k === 'filt') {
    if (!v) h = hint('Tap a video or photo on the timeline first.');
    else h = '<div class="grid">' + FILTERS.map((f, i) => '<div class="card" data-filter="' + i + '" aria-pressed="' + (v.filter === f[1]) + '" style="background:linear-gradient(135deg,' + f[2] + ',#222);min-height:70px">' + f[0] + '</div>').join('') + '</div>';
  }
  if (k === 'adjust') {
    if (!v) h = hint('Tap a video or photo on the timeline first.');
    else h = slider('adj.bri', 'Brightness', 40, 200, '%', v.adj.bri) + slider('adj.con', 'Contrast', 40, 200, '%', v.adj.con) + slider('adj.sat', 'Colour', 0, 250, '%', v.adj.sat) + slider('adj.temp', 'Warmth', -100, 100, '', v.adj.temp) + slider('adj.vig', 'Dark edges', 0, 100, '%', v.adj.vig) + slider('adj.zoom', 'Zoom', 100, 250, '%', v.adj.zoom) + '<button class="btn" id="resetAdj">Reset</button>';
  }
  if (k === 'speed') {
    if (!v) h = hint('Tap a video on the timeline first.');
    else if (media.get(v.mid).type === 'image') h = hint('Photos have no speed. Drag the ends of the clip to make it longer or shorter.');
    else h = '<div class="row"><label>Speed<b id="spv">' + v.speed.toFixed(2).replace(/\.?0+$/, '') + 'x</b></label><input type="range" id="spd" min="0.25" max="4" step="0.05" value="' + v.speed + '"></div><div class="chips"><span class="chip" data-speed="0.5">Slow</span><span class="chip" data-speed="1">Normal</span><span class="chip" data-speed="2">Fast</span><span class="chip" data-speed="4">Very fast</span></div>' + hint('Sound speeds up or slows down with the picture, so the pitch changes.');
  }
  if (k === 'size') {
    h = hint('Pick where the video will be shown.') + '<div class="grid g2" id="sizes">' + [['16/9', 'YouTube', '16:9'], ['9/16', 'TikTok, Reels', '9:16'], ['1/1', 'Square', '1:1'], ['4/5', 'Instagram post', '4:5']].map((r) => '<div class="card" data-r="' + r[0] + '" aria-pressed="' + (st.ratio === r[0]) + '">' + r[1] + '<br><small>' + r[2] + '</small></div>').join('') + '</div><h4>When the video does not fill the screen</h4><div class="grid g2" id="fits">' + [['blur', 'Blurred sides'], ['black', 'Black bars'], ['fill', 'Fill and crop']].map((f) => '<div class="card" data-fit="' + f[0] + '" aria-pressed="' + (st.fit === f[0]) + '">' + f[1] + '</div>').join('') + '</div>';
  }
  if (k === 'info') {
    const M = st.meta;
    h = hint('Saved inside the video file, so players and websites can read it.') +
      fld('m_title', 'Title', 'title', 'Summer trip 2026') + '<div class="fld"><label for="m_desc">Description</label><textarea id="m_desc" data-m="desc" placeholder="What is this video about?">' + esc(M.desc) + '</textarea></div>' +
      fld('m_author', 'Made by', 'author', 'Your name') + fld('m_copy', 'Copyright', 'copy', '2026 Your name') + fld('m_tags', 'Tags', 'tags', 'travel, beach, vlog') + fld('m_date', 'Date', 'date', '', 'date') + fld('m_place', 'Place', 'place', 'Lagos, Nigeria') +
      '<h4>Cover picture</h4><div class="row"><label>Frame used as the cover<b id="o_cover">' + fmt(M.cover) + '</b></label><input type="range" id="cover" min="0" max="' + Math.max(1, Math.floor(DUR)) + '" value="' + M.cover + '"></div>' +
      tg('strip', 'Remove private details from the original', 'Camera model and GPS location are not copied', M.strip) +
      '<p class="hint" style="margin-top:10px">Title, description, made by and date are standard fields. Copyright, tags and place are saved together in the comment field, because MP4 has no separate field for them.</p>' +
      '<h4>Found in your first video</h4><div class="orig" id="orig">Reading...</div>';
    setTimeout(fillOrig, 0);
  }
  $('shBody').innerHTML = h;
  if (k === 'cap') paintCapThumbs();
  requestAnimationFrame(requestDraw);
}
function fld(id, label, key, ph, type) { return '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" data-m="' + key + '" value="' + esc(st.meta[key]) + '" placeholder="' + esc(ph) + '"></div>'; }
async function fillOrig() {
  const box = $('orig'); if (!box) return;
  const m = mains().map((c) => media.get(c.mid)).find((x) => x && x.type === 'video') || mains().map((c) => media.get(c.mid))[0];
  if (!m) { box.textContent = 'Nothing added yet.'; return; }
  const rows = [['File', m.name], ['Size', size(m.file.size)], ['Picture', m.w + ' x ' + m.h], ['Length', fmt(m.dur)], ['Last changed', new Date(m.file.lastModified).toLocaleDateString()]];
  try {
    const mb = await import(MB); const input = new mb.Input({ source: new mb.BlobSource(m.file), formats: mb.ALL_FORMATS });
    const tags = await input.getMetadataTags();
    if (tags.title) rows.push(['Title', tags.title]); if (tags.date) rows.push(['Recorded', tags.date.toLocaleDateString()]);
    const raw = tags.raw || {}; const loc = raw['com.apple.quicktime.location.ISO6709'] || raw['©xyz'];
    if (loc) rows.push(['Place (GPS)', 'Found, ' + (st.meta.strip ? 'will be removed' : 'will be kept')]);
    const mk = raw['com.apple.quicktime.make'] || raw['©mak'], md = raw['com.apple.quicktime.model'] || raw['©mod'];
    if (mk || md) rows.push(['Camera', [mk, md].filter(Boolean).join(' ')]);
    input.dispose && input.dispose();
  } catch (e) { /* no readable tags */ }
  box.innerHTML = rows.map((r) => '<div><span>' + esc(r[0]) + '</span>' + esc(String(r[1])) + '</div>').join('');
}
function setPath(c, path, val) { const p = path.split('.'); let o = c; while (p.length > 1) o = o[p.shift()]; o[p[0]] = val; }
function getTarget() { return get(st.sel); }

$('shBody').addEventListener('pointerdown', (e) => { if (e.target.matches('input[type=range],input[type=color]')) commit(); });
$('shBody').addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.cstr) { const c = get(el.dataset.cstr); if (c) { c.str = el.value; if (c.words && c.words.length !== c.str.split(/\s+/).filter(Boolean).length) c.words = null; clearTimeout(drawTL.h); drawTL.h = setTimeout(drawTL, 250); requestDraw(); } return; }
  if (el.dataset.cs) { st.cap[el.dataset.cs] = +el.value; const b = el.parentNode.querySelector('b'); if (b) b.textContent = el.value + (el.dataset.u || ''); requestDraw(); return; }
  if (el.dataset.p) {
    const c = getTarget(); if (!c) return; const val = +el.value; setPath(c, el.dataset.p, val);
    const o = $('shBody').querySelector('[data-o="' + el.dataset.p + '"]'); if (o) o.textContent = val + (el.dataset.u || '');
    if (c.lane === 'text' || c.lane === 'cap') drawTL(); requestDraw(); return;
  }
  if (el.id === 'spd') { const c = selVis(); if (!c) return; c.speed = +el.value; $('spv').textContent = (+el.value).toFixed(2).replace(/\.?0+$/, '') + 'x'; layout(); drawTL(); requestDraw(); updateActs(); return; }
  if (el.dataset.m) { st.meta[el.dataset.m] = el.value; return; }
  if (el.id === 'cover') { st.meta.cover = +el.value; $('o_cover').textContent = fmt(+el.value); seek(+el.value); return; }
  if (el.id === 'txIn') { const c = selIs('text'); if (c) { c.str = el.value; drawTL(); requestDraw(); } return; }
  if (el.id === 'txColor') { const c = selIs('text'); if (c) { c.color = el.value; requestDraw(); } }
});
$('shBody').addEventListener('change', (e) => {
  if (e.target.id === 'capLang') capLang = e.target.value;
  if (e.target.id === 'txFont') { const c = selIs('text'); if (c) { commit(); c.font = e.target.value; requestDraw(); } }
});
$('shBody').addEventListener('focusin', (e) => { if (e.target.id === 'txIn' || e.target.dataset.m || e.target.dataset.cstr) commit(); });
$('shBody').addEventListener('click', (e) => {
  let el;
  if (capClick(e)) return;
  if (e.target.closest('#pick')) { $('file').click(); return; }
  if (e.target.closest('#pickAudio')) { $('file').click(); return; }
  if (e.target.closest('#rec')) { recordVoice(); return; }
  if ((el = e.target.closest('[data-use]'))) { const m = media.get(el.dataset.use); if (m) { addToTimeline(m); refresh(); toast('Added'); } return; }
  if (e.target.closest('#txAdd')) {
    commit(); const str = $('txIn').value.trim() || 'Your text';
    const c = { id: 'c' + uid++, lane: 'text', s: Math.min(t, Math.max(0, DUR - 1)), d: Math.min(4, Math.max(1, DUR - t || 4)), str, font: FONTS[0][1], bold: true, color: '#ffffff', bg: false, outline: false, size: 8, x: 50, y: 50 };
    st.clips.push(c); st.sel = c.id; refresh(); openTool('text'); return;
  }
  if ((el = e.target.closest('[data-style]'))) {
    let c = selIs('text'); if (!c) { toast('Add a text first, then pick a style'); return; }
    commit(); Object.assign(c, TEXT_STYLES[el.dataset.style]); openTool('text'); requestDraw(); return;
  }
  if ((el = e.target.closest('[data-filter]'))) { const c = selVis(); if (!c) return; commit(); c.filter = FILTERS[+el.dataset.filter][1]; openTool('filt'); requestDraw(); return; }
  if ((el = e.target.closest('[data-speed]'))) { const c = selVis(); if (!c) return; commit(); c.speed = +el.dataset.speed; layout(); drawTL(); openTool('speed'); requestDraw(); return; }
  if ((el = e.target.closest('[data-vol]'))) { const c = get(st.sel); if (!c) return; commit(); c.vol = +el.dataset.vol; openTool('music'); return; }
  if (e.target.closest('#resetAdj')) { const c = selVis(); if (!c) return; commit(); c.adj = { ...ADJ0 }; openTool('adjust'); requestDraw(); return; }
  if ((el = e.target.closest('[data-r]'))) { commit(); st.ratio = el.dataset.r; applyRatio(); openTool('size'); return; }
  if ((el = e.target.closest('[data-fit]'))) { commit(); st.fit = el.dataset.fit; openTool('size'); requestDraw(); return; }
  if ((el = e.target.closest('.sw'))) {
    const on = el.getAttribute('aria-checked') !== 'true'; el.setAttribute('aria-checked', on);
    if (el.id === 'strip') { st.meta.strip = on; fillOrig(); return; }
    const c = selIs('text'); if (c) { commit(); if (el.id === 'txBg') c.bg = on; if (el.id === 'txOut') c.outline = on; if (el.id === 'txBold') c.bold = on; requestDraw(); }
    return;
  }
  if ((el = e.target.closest('.chip')) && el.parentNode) { /* handled above */ }
});

/* ------------------------------------------------------------------ clip properties */
let inspBusy = false;
function clipSlider(k, label, min, max, step, val) {
  return '<div class="row"><label>' + label + '<b>' + fmtClip(k, val) + '</b></label><input type="range" data-clipp="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>';
}
function fmtClip(k, v) { return k === 'speed' ? (+v).toFixed(2).replace(/\.?0+$/, '') + 'x' : (k === 'fi' || k === 'fo') ? (+v).toFixed(1) + ' s' : Math.round(v) + '%'; }
function clipPanelHtml() {
  const c = get(st.sel);
  if (!c) return hint('Select a clip on the timeline and its properties appear here.');
  const m = media.get(c.mid), lane = c.lane;
  const kind = { main: 'Video clip', audio: 'Sound clip', text: 'Text', cap: 'Caption' }[lane];
  let h = '<h4>' + kind + '</h4><p class="hint" style="word-break:break-all">' + esc(m ? m.name : (c.str || '')) + '<br>Starts ' + fmtp(c.s) + ', lasts ' + fmtp(cdur(c)) + '</p>';
  if (lane === 'main') {
    h += '<h4>Transition into this clip</h4><div class="chips">' + TRANS.map((x) => '<span class="chip" data-clipa="tr:' + x[0] + '" aria-pressed="' + ((c.tr || 'none') === x[0]) + '">' + x[1] + '</span>').join('') + '</div>';
    h += '<h4>Picture</h4>' + clipSlider('op', 'Opacity', 0, 100, 1, c.op == null ? 100 : c.op);
    h += '<div class="chips"><span class="chip" data-clipa="rot">Rotate 90 degrees</span><span class="chip" data-clipa="fx" aria-pressed="' + !!c.fx + '">Flip left and right</span><span class="chip" data-clipa="fy" aria-pressed="' + !!c.fy + '">Flip up and down</span></div>';
    if (m && m.type !== 'image') h += clipSlider('speed', 'Speed', 0.25, 4, 0.05, c.speed);
  }
  if (lane === 'main' && m && m.type === 'video' || lane === 'audio') {
    h += '<h4>Sound</h4>' + clipSlider('vol', 'Volume', 0, 200, 1, c.vol) + clipSlider('fi', 'Fade in', 0, 3, 0.1, c.fi || 0) + clipSlider('fo', 'Fade out', 0, 3, 0.1, c.fo || 0);
  }
  if ((lane === 'main' && m && m.type === 'video') || lane === 'audio') h += '<h4>Clean up</h4><button class="btn" data-clipa="sil">Remove silent pauses</button>' + hint('Cuts out the quiet gaps in this clip. Make captions after this, not before.');
  if (lane === 'text' || lane === 'cap') h += hint('Change the words and the look in the ' + (lane === 'text' ? 'Text' : 'Captions') + ' tool. Drag the white ends on the timeline to change how long it shows.');
  return h;
}
function drawInsp(force) { const b = $('inspBody'); if (!b || (inspBusy && !force)) return; b.innerHTML = clipPanelHtml(); }
function refreshClipPanels() { drawInsp(true); if (tool === 'clip') openTool('clip'); }
function onClipInput(e) {
  const el = e.target.closest && e.target.closest('[data-clipp]'); if (!el) return;
  const c = get(st.sel); if (!c) return;
  const k = el.dataset.clipp, v = +el.value;
  c[k] = v;
  if (k === 'speed') { layout(); drawTL(); updateActs(); }
  const b = el.parentNode.querySelector('b'); if (b) b.textContent = fmtClip(k, v);
  requestDraw();
}
function onClipClick(e) {
  const el = e.target.closest && e.target.closest('[data-clipa]'); if (!el) return;
  const c = get(st.sel); if (!c) return;
  const [a, arg] = el.dataset.clipa.split(':');
  if (a === 'sil') { removeSilences(c).then(refreshClipPanels); return; }
  commit();
  if (a === 'tr') { c.tr = arg; if (arg !== 'none') seek(c.s + 0.04); }
  else if (a === 'rot') c.rot = (((c.rot || 0) + 90) % 360);
  else if (a === 'fx') c.fx = !c.fx;
  else if (a === 'fy') c.fy = !c.fy;
  requestDraw(); refreshClipPanels();
}
function bindClipPanel(root) {
  root.addEventListener('pointerdown', (e) => { if (e.target.matches && e.target.matches('input[type=range][data-clipp]')) { inspBusy = true; commit(); } });
  root.addEventListener('input', onClipInput);
  root.addEventListener('click', onClipClick);
}
addEventListener('pointerup', () => { inspBusy = false; });
addEventListener('pointercancel', () => { inspBusy = false; });
bindClipPanel($('inspBody')); bindClipPanel($('shBody'));

/* ------------------------------------------------------------------ captions */
const capClips = () => st.clips.filter((c) => c.lane === 'cap').sort((a, b) => a.s - b.s);
const LANGS = [['', 'Detect automatically'], ['english', 'English'], ['french', 'French'], ['spanish', 'Spanish'], ['portuguese', 'Portuguese'], ['german', 'German'], ['arabic', 'Arabic'], ['yoruba', 'Yoruba'], ['hausa', 'Hausa'], ['swahili', 'Swahili']];
const CAP_STYLES = Object.keys(CAP_DEFS).map((k) => [k, CAP_DEFS[k].n]);
let capJob = null, capLang = 'english';

function whisperWords(chunks) {
  const raw = chunks.map((ch) => ({ w: String(ch.text || '').trim(), s: ch.timestamp[0], e: ch.timestamp[1] == null ? ch.timestamp[0] + 0.4 : ch.timestamp[1] }))
    .filter((x) => x.w && x.s != null && !/^[\[(].*[\])]$/.test(x.w));
  /* the speech model sometimes splits "$5,000" or "don't" into pieces: put them back together */
  const out = [];
  for (const x of raw) {
    const prev = out[out.length - 1];
    if (prev && (/^[,.]\d/.test(x.w) || /^['’%]/.test(x.w) || (/\d$/.test(prev.w) && /^\d/.test(x.w) && x.s - prev.e < 0.2))) { prev.w += x.w; prev.e = x.e; }
    else out.push(x);
  }
  return out;
}
/* mode: '1', '2', '3', '5' words per caption, or 'line' for whole sentences */
function groupWords(words, mode) {
  const lines = []; let cur = [];
  const flush = () => { if (cur.length) { lines.push(cur); cur = []; } };
  const max = mode === 'line' ? 8 : Math.max(1, +mode || 3);
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && w.s - prev.e > (mode === 'line' ? 0.7 : 0.45)) flush();
    cur.push(w);
    const chars = cur.map((x) => x.w).join(' ').length, endS = /[.?!]$/.test(w.w), endC = /[,;:]$/.test(w.w);
    if (mode === 'line') { if (chars >= 38 || cur.length >= max || (endS && cur.length >= 3) || (endC && chars > 24)) flush(); }
    else if (cur.length >= max || endS || (endC && cur.length >= Math.max(1, max - 1))) flush();
  }
  flush();
  return lines.map((ws, i) => {
    const s = ws[0].s, nxt = lines[i + 1];
    let e = ws[ws.length - 1].e + 0.25; if (nxt) e = Math.min(e, nxt[0].s);
    return { s, d: Math.max(0.3, e - s), str: ws.map((x) => x.w).join(' '), words: ws.map((x) => ({ s: x.s, e: x.e })) };
  });
}
/* every spoken word with its time, taken from the captions as they are now (so edits and regrouping keep working) */
function flattenCaps() {
  const out = [];
  for (const c of capClips()) {
    const toks = String(c.str).split(/\s+/).filter(Boolean), ok = c.words && c.words.length === toks.length;
    toks.forEach((w, i) => out.push({ w, s: ok ? c.words[i].s : c.s + (i / toks.length) * c.d, e: ok ? c.words[i].e : c.s + ((i + 1) / toks.length) * c.d }));
  }
  return out;
}
function putCaptions(lines) {
  st.clips = st.clips.filter((c) => c.lane !== 'cap');
  lines.forEach((l, i) => st.clips.push({ id: 'c' + uid++, lane: 'cap', s: l.s, d: l.d, str: l.str, words: l.words, mi: i }));
}
function srtTime(sec) {
  const ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000;
  const p = (n, w) => String(n).padStart(w, '0'); return p(h, 2) + ':' + p(m, 2) + ':' + p(s, 2) + ',' + p(r, 3);
}
function makeSrt() { return capClips().map((c, i) => (i + 1) + '\n' + srtTime(c.s) + ' --> ' + srtTime(c.s + c.d) + '\n' + c.str + '\n').join('\n'); }
function parseSrt(txt) {
  const out = [], tm = (a, b, c, d) => (+a) * 3600 + (+b) * 60 + (+c) + (+String(d).padEnd(3, '0')) / 1000;
  for (const block of String(txt).replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const i = lines.findIndex((l) => l.includes('-->')); if (i < 0) continue;
    const m = lines[i].match(/(\d+):(\d\d):(\d\d)[,.](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d{1,3})/); if (!m) continue;
    const s = tm(m[1], m[2], m[3], m[4]), e = tm(m[5], m[6], m[7], m[8]);
    const str = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (str && e > s) out.push({ s, d: e - s, str, words: null });
  }
  return out;
}
function saveFile(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const baseName = () => (st.name || 'video').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'video';

function capProgHtml(msg, frac) {
  return '<div id="capProg"><div class="bar"><span id="capBar"' + (frac == null ? ' class="ind"' : ' style="width:' + Math.round(frac * 100) + '%"') + '></span></div><p class="hint" id="capMsg">' + esc(msg) + '</p><button class="btn" id="capCancel">Stop</button></div>';
}
function setCapProg(msg, frac) {
  if (capJob) { capJob.msg = msg; capJob.frac = frac; }
  const bar = $('capBar'), m = $('capMsg'); if (!bar || !m) return;
  m.textContent = msg;
  if (frac == null) { bar.className = 'ind'; bar.style.width = ''; } else { bar.className = ''; bar.style.width = Math.round(frac * 100) + '%'; }
}
function capSlider(key, label, min, max, unit, val) {
  return '<div class="row"><label>' + label + '<b>' + val + unit + '</b></label><input type="range" data-cs="' + key + '" data-u="' + unit + '" min="' + min + '" max="' + max + '" value="' + val + '"></div>';
}
function capPanelHtml() {
  const caps = capClips(), S = st.cap;
  let h = '<div class="fld"><label for="capLang">Language of the speech</label><select id="capLang">' + LANGS.map((l) => '<option value="' + l[0] + '"' + (l[0] === capLang ? ' selected' : '') + '>' + l[1] + '</option>').join('') + '</select></div>';
  h += capJob ? capProgHtml(capJob.msg || 'Working...', capJob.frac == null ? null : capJob.frac) : '<button class="btn pri" id="capGen">' + (caps.length ? 'Make captions again' : 'Make captions automatically') + '</button>';
  if (!caps.length) h += '<h4>Words on screen at once</h4><div class="chips">' + CAP_CHUNKS.map((x) => '<span class="chip" data-capchunk="' + x[0] + '" aria-pressed="' + (S.chunk === x[0]) + '">' + x[1] + '</span>').join('') + '</div>';
  h += '<p class="hint">It listens to the speech in your video and voiceover, not the music. The first time, it downloads a 40 MB speech model, then it works from your browser. Clear speech works best, so check the words afterwards. Make captions after you finish cutting, because they do not move when you cut the video.</p>';
  if (caps.length) {
    h += '<h4>Look</h4><div class="grid g2">' + CAP_STYLES.map((x) => '<div class="card cs" data-capstyle="' + x[0] + '" aria-pressed="' + (S.style === x[0]) + '"><canvas width="240" height="100" data-ct="' + x[0] + '"></canvas><span>' + x[1] + '</span></div>').join('') + '</div>';
    h += '<h4>Movement</h4><div class="chips">' + CAP_ANIMS.map((x) => '<span class="chip" data-capanim="' + x[0] + '" aria-pressed="' + ((S.anim || 'none') === x[0]) + '">' + x[1] + '</span>').join('') + '</div>';
    h += '<h4>Words on screen at once</h4><div class="chips">' + CAP_CHUNKS.map((x) => '<span class="chip" data-capchunk="' + x[0] + '" aria-pressed="' + (S.chunk === x[0]) + '">' + x[1] + '</span>').join('') + '</div>';
    h += tg('capEmph', 'Highlight key words', 'Numbers, money and power words get a bigger, brighter look', S.emph);
    h += '<h4>Highlight colour</h4><div class="swatches"><button type="button" class="sw auto" data-capacc="" aria-pressed="' + !S.accent + '" aria-label="Use the look\'s own colour">Auto</button>' + CAP_COLORS.map((x) => '<button type="button" class="sw" data-capacc="' + x + '" aria-pressed="' + (S.accent === x) + '" aria-label="Colour ' + x + '" style="background:' + x + '"></button>').join('') + '</div>';
    h += '<div style="height:12px"></div>' + capSlider('size', 'Size', 3, 12, '', S.size) + capSlider('y', 'Up and down', 15, 95, '%', S.y);
  }
  h += '<h4>Your captions' + (caps.length ? ' (' + caps.length + ')' : '') + '</h4>';
  if (caps.length) {
    h += '<div class="caplist">' + caps.map((c) => '<div class="capline' + (c.id === st.sel ? ' on' : '') + '"><button class="cptime" data-seek="' + c.s + '" data-cid="' + c.id + '">' + fmtp(c.s) + '</button><textarea rows="2" data-cstr="' + c.id + '" aria-label="Caption text">' + esc(c.str) + '</textarea><button class="cpdel" data-cdel="' + c.id + '" aria-label="Delete this caption"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>').join('') + '</div>';
  } else h += '<p class="hint">No captions yet. Make them automatically, add them by hand, or import an .srt file.</p>';
  h += '<button class="btn" id="capAdd">Add a caption at the red line</button><button class="btn" id="capImport">Import an .srt file</button>';
  if (caps.length) h += '<button class="btn" id="capSrt">Download subtitles (.srt)</button><button class="btn" id="capClear">Remove all captions</button>';
  return h;
}
function runWhisper(job, audio, language) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker('/tools/whisper-worker.js', { type: 'module' }); } catch (e) { reject(new Error('This browser cannot run the speech model.')); return; }
    job.worker = w;
    const files = {}; let chunks = 0; const windows = Math.max(1, Math.ceil(audio.length / 16000 / 25));
    w.onmessage = (e) => {
      const { type, data } = e.data;
      if (type === 'load') {
        if (data && data.status === 'progress' && data.total) {
          files[data.file] = { l: data.loaded, t: data.total };
          let L = 0, T = 0; for (const k in files) { L += files[k].l; T += files[k].t; }
          setCapProg('Loading the speech model (first time only) ' + Math.round(L / T * 100) + '%', L / T);
        }
      } else if (type === 'listening') setCapProg('Listening to your video...', windows > 1 ? 0.02 : null);
      else if (type === 'chunk') { chunks++; if (windows > 1) setCapProg('Listening to your video... ' + Math.min(99, Math.round(chunks / windows * 100)) + '%', Math.min(0.99, chunks / windows)); }
      else if (type === 'done') resolve(data);
      else if (type === 'error') reject(new Error(data));
    };
    w.onerror = () => reject(new Error('The speech model could not start. Check your connection and try again.'));
    w.postMessage({ type: 'run', audio, language: language || null }, [audio.buffer]);
  });
}
async function autoCaptions() {
  if (capJob || !mains().length) return;
  const lang = $('capLang') ? $('capLang').value : capLang; capLang = lang;
  const job = capJob = { worker: null, cancelled: false, msg: 'Getting the sound ready...', frac: null };
  if (tool === 'cap') openTool('cap');
  const finish = () => { if (job.worker) job.worker.terminate(); if (capJob === job) capJob = null; };
  try {
    setPlay(false);
    const mb = await import(MB);
    const clips = st.clips.filter((c) => (c.lane === 'main' && media.get(c.mid) && media.get(c.mid).type === 'video') || (c.lane === 'audio' && media.get(c.mid) && media.get(c.mid).voice));
    const mix = await buildMix(mb, clips, 16000, 1, () => job.cancelled);
    if (job.cancelled) throw new Error('cancelled');
    if (!mix) throw new Error('nosound');
    const audio = new Float32Array(mix.getChannelData(0));
    let peak = 0; for (let i = 0; i < audio.length; i += 61) peak = Math.max(peak, Math.abs(audio[i]));
    if (peak < 0.01) throw new Error('nosound');
    const result = await runWhisper(job, audio, lang);
    if (job.cancelled) throw new Error('cancelled');
    const lines = groupWords(whisperWords(result.chunks || []), st.cap.chunk);
    if (!lines.length) throw new Error('nospeech');
    commit();
    putCaptions(lines);
    finish(); refresh();
    if (tool === 'cap') openTool('cap');
    toast(lines.length + ' captions made. Check the words, then export.');
  } catch (e) {
    finish();
    const m = e && e.message;
    if (m === 'cancelled') return;
    toast(m === 'nosound' ? 'No clear sound was found in your video, so there is nothing to caption.' : m === 'nospeech' ? 'No speech was found. Captions work for spoken words, not music.' : 'Captions could not be made: ' + m);
    if (tool === 'cap') openTool('cap');
  }
}
const srtInput = document.createElement('input'); srtInput.type = 'file'; srtInput.accept = '.srt,.vtt,text/plain'; srtInput.hidden = true; document.body.appendChild(srtInput);
srtInput.onchange = async () => {
  const f = srtInput.files[0]; srtInput.value = ''; if (!f) return;
  const list = parseSrt(await f.text());
  if (!list.length) { toast('No captions were found in that file.'); return; }
  commit(); putCaptions(list);
  refresh(); if (tool === 'cap') openTool('cap'); toast(list.length + ' captions imported.');
};
function capClick(e) {
  let el;
  if (e.target.closest('#capGen')) { autoCaptions(); return true; }
  if (e.target.closest('#capCancel')) {
    if (capJob) { const j = capJob; j.cancelled = true; if (j.worker) j.worker.terminate(); capJob = null; toast('Stopped.'); if (tool === 'cap') openTool('cap'); }
    return true;
  }
  if ((el = e.target.closest('[data-capacc]'))) { commit(); st.cap.accent = el.dataset.capacc; openTool('cap'); requestDraw(); return true; }
  if ((el = e.target.closest('[data-capanim]'))) { commit(); st.cap.anim = el.dataset.capanim; openTool('cap'); requestDraw(); return true; }
  if ((el = e.target.closest('[data-capchunk]'))) {
    commit(); st.cap.chunk = el.dataset.capchunk;
    if (capClips().length) { putCaptions(groupWords(flattenCaps(), st.cap.chunk)); refresh(); }
    openTool('cap'); requestDraw(); return true;
  }
  if (e.target.closest('#capEmph')) { commit(); st.cap.emph = !st.cap.emph; openTool('cap'); requestDraw(); return true; }
  if ((el = e.target.closest('[data-capstyle]'))) { commit(); st.cap.style = el.dataset.capstyle; openTool('cap'); requestDraw(); return true; }
  if ((el = e.target.closest('[data-seek]'))) { st.sel = el.dataset.cid; seek(+el.dataset.seek + 0.01); drawTL(); updateActs(); $('shBody').querySelectorAll('.capline').forEach((n) => n.classList.toggle('on', n.contains(el))); return true; }
  if ((el = e.target.closest('[data-cdel]'))) { commit(); const c = get(el.dataset.cdel); if (c) st.clips.splice(st.clips.indexOf(c), 1); if (st.sel === el.dataset.cdel) st.sel = null; refresh(); openTool('cap'); return true; }
  if (e.target.closest('#capAdd')) {
    commit(); const c = { id: 'c' + uid++, lane: 'cap', s: Math.min(t, Math.max(0, DUR - 0.5)), d: Math.min(2.5, Math.max(0.5, DUR - t)), str: 'New caption', words: null, mi: capClips().length };
    st.clips.push(c); st.sel = c.id; refresh(); openTool('cap');
    const ta = $('shBody').querySelector('[data-cstr="' + c.id + '"]'); if (ta) { ta.focus(); ta.select(); }
    return true;
  }
  if (e.target.closest('#capImport')) { srtInput.click(); return true; }
  if (e.target.closest('#capSrt')) { saveFile(baseName() + '.srt', makeSrt(), 'text/plain'); return true; }
  if (e.target.closest('#capClear')) { commit(); st.clips = st.clips.filter((c) => c.lane !== 'cap'); refresh(); openTool('cap'); toast('Captions removed. Undo brings them back.'); return true; }
  return false;
}

/* voiceover recording */
let recState = null;
async function recordVoice() {
  const msg = $('recMsg'), btn = $('rec');
  if (recState) { recState.rec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
    const rec = new MediaRecorder(stream), chunks = [];
    recState = { rec, stream }; btn.textContent = 'Stop recording'; msg.textContent = 'Recording from your microphone. Use headphones so the video sound is not picked up.';
    rec.ondataavailable = (ev) => chunks.push(ev.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((x) => x.stop()); recState = null;
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const file = new File([blob], 'voiceover-' + (uid) + '.' + (blob.type.includes('mp4') ? 'm4a' : 'webm'), { type: blob.type });
      try { const m = await importFile(file); m.voice = true; addToTimeline(m); refresh(); toast('Voiceover added'); } catch (er) { toast(er.message); }
      if (tool === 'music') openTool('music');
    };
    rec.start();
  } catch (e) { msg.textContent = 'The microphone could not be used. Allow microphone access in your browser and try again.'; }
}

/* ------------------------------------------------------------------ export */
function qualityOpts(W, H, durS) {
  const px = W * H * 30;
  return [['small', 'Small file', 0.045], ['rec', 'Recommended', 0.08], ['best', 'Best quality', 0.14]].map(([id, name, bpp]) => {
    const vb = Math.round(px * bpp); return { id, name, vb, bytes: (vb + 128000) * durS / 8 };
  });
}
function metaSummary() {
  const M = st.meta, p = [];
  if (M.title) p.push('title'); if (M.desc) p.push('description'); if (M.author) p.push('made by'); if (M.date) p.push('date'); if (M.copy || M.tags || M.place) p.push('comment');
  return p.length ? p.join(', ') : 'none';
}
function openExport() {
  if (!DUR || exporting) return;
  setPlay(false);
  let q = 'rec', res = 1080, result = null;
  const box = $('mbox');
  const view = () => {
    const [W, H] = dims(st.ratio, res), opts = qualityOpts(W, H, DUR);
    box.innerHTML = '<h2>Export video</h2><p>Made on your device, then saved as a file. Nothing is uploaded.</p>' +
      '<div class="chips"><span class="chip" data-res="1080" aria-pressed="' + (res === 1080) + '">1080p</span><span class="chip" data-res="720" aria-pressed="' + (res === 720) + '">720p</span></div>' +
      opts.map((o) => '<button class="opt" data-q="' + o.id + '" aria-pressed="' + (q === o.id) + '"><span>' + o.name + '<small>About ' + size(o.bytes) + '</small></span></button>').join('') +
      '<p style="margin:6px 0 14px;font-size:.82rem">' + W + ' x ' + H + ', 30 fps, MP4. Details inside the file: ' + metaSummary() + '.</p>' +
      '<div id="xp" hidden><div class="bar"><span id="xb"></span></div><p id="xl">Starting...</p></div><div id="xe" class="err" hidden></div>' +
      '<div style="display:flex;gap:8px"><button class="opt" id="xc" style="justify-content:center;margin:0">Cancel</button><button class="opt" id="xg" style="justify-content:center;margin:0;background:var(--acc);border-color:var(--acc);color:#1a0b0a;font-weight:700">Export</button></div>';
    box.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { q = b.dataset.q; view(); }; });
    box.querySelectorAll('[data-res]').forEach((b) => { b.onclick = () => { res = +b.dataset.res; view(); }; });
    $('xc').onclick = () => { if (exporting) cancelExport = true; else $('modal').classList.remove('on'); };
    $('xg').onclick = async () => {
      $('xp').hidden = false; $('xg').disabled = true; $('xe').hidden = true;
      box.querySelectorAll('[data-q],[data-res]').forEach((b) => { b.disabled = true; });
      try {
        const blob = await runExport(W, H, opts.find((o) => o.id === q).vb, (p, label) => { $('xb').style.width = (p * 100) + '%'; $('xl').textContent = label + ' ' + Math.floor(p * 100) + '%'; });
        result = blob; showDone(blob);
      } catch (e) {
        exporting = false; $('xp').hidden = true; $('xg').disabled = false; box.querySelectorAll('[data-q],[data-res]').forEach((b) => { b.disabled = false; });
        if (e && e.message === 'cancelled') { $('xe').textContent = 'Export stopped.'; } else { $('xe').textContent = 'The export did not finish: ' + (e && e.message ? e.message : e) + ' Try 720p or another source file.'; }
        $('xe').hidden = false;
      }
    };
  };
  const showDone = (blob) => {
    const url = URL.createObjectURL(blob), fn = (st.name || 'video').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'video';
    box.innerHTML = '<h2>Your video is ready</h2><p>' + size(blob.size) + ', MP4. Saved with: ' + metaSummary() + '.</p><video src="' + url + '" controls playsinline style="width:100%;border-radius:12px;background:#000;margin-bottom:12px;max-height:40vh"></video><a class="dl" href="' + url + '" download="' + fn + '.mp4">' + I.add.replace('M12 5v14M5 12h14', 'M12 3v12m0 0 4-4m-4 4-4-4M4 20h16') + 'Download video</a>' + (capClips().length ? '<button class="opt" id="xsrt" style="justify-content:center">Download subtitles (.srt)</button>' : '') + '<button class="opt" id="xc" style="justify-content:center;margin:0">Close</button>';
    $('xc').onclick = () => $('modal').classList.remove('on');
    if ($('xsrt')) $('xsrt').onclick = () => saveFile(fn + '.srt', makeSrt(), 'text/plain');
  };
  view(); $('modal').classList.add('on');
}
let cancelExport = false, currentOutput = null;
/* Mix sound from timeline clips into one AudioBuffer (null when nothing can be decoded). Used by export and by captions. */
async function buildMix(mb, clips, sr, channels, isCancelled, onProgress) {
  const usable = clips.filter((c) => c.vol > 0 && media.get(c.mid) && media.get(c.mid).type !== 'image');
  if (!usable.length) return null;
  const inputs = [], sinks = new Map();
  try {
    for (const id of new Set(usable.map((c) => c.mid))) {
      const m = media.get(id);
      const input = new mb.Input({ source: new mb.BlobSource(m.file), formats: mb.ALL_FORMATS }); inputs.push(input);
      const at = await input.getPrimaryAudioTrack();
      if (at && (await at.canDecode())) sinks.set(id, new mb.AudioBufferSink(at));
    }
    const list = usable.filter((c) => sinks.has(c.mid));
    if (!list.length || DUR <= 0) return null;
    const off = new OfflineAudioContext(channels, Math.max(1, Math.ceil(DUR * sr)), sr);
    let n = 0;
    for (const c of list) {
      if (isCancelled && isCancelled()) throw new Error('cancelled');
      const speed = c.lane === 'main' ? c.speed : 1;
      const gain = off.createGain(), base = c.vol / 100, cd = cdur(c), fi = Math.min(c.fi || 0, cd / 2), fo = Math.min(c.fo || 0, cd / 2);
      gain.gain.value = base; gain.connect(off.destination);
      if (fi > 0) { gain.gain.setValueAtTime(0, c.s); gain.gain.linearRampToValueAtTime(base, c.s + fi); }
      if (fo > 0) { gain.gain.setValueAtTime(base, c.s + cd - fo); gain.gain.linearRampToValueAtTime(0, c.s + cd); }
      for await (const wb of sinks.get(c.mid).buffers(c.in, c.out)) {
        const bs = wb.timestamp, be = bs + wb.buffer.duration, a = Math.max(bs, c.in), b = Math.min(be, c.out);
        if (b <= a) continue;
        const when = c.s + (a - c.in) / speed; if (when >= DUR) break;
        const src = off.createBufferSource(); src.buffer = wb.buffer; src.playbackRate.value = speed; src.connect(gain);
        src.start(when, a - bs, b - a);
      }
      n++; if (onProgress) onProgress(n / list.length);
    }
    return await off.startRendering();
  } finally { for (const i of inputs) i.dispose && i.dispose(); }
}
const exportAudioClips = () => st.clips.filter((c) => (c.lane === 'main' && media.get(c.mid) && media.get(c.mid).type === 'video') || c.lane === 'audio');
/* Give the page a breath between frames. A message is not slowed down when the tab is in the background, a timer is. */
function yieldNow() { return new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); }); }
async function runExport(W, H, vbitrate, progress) {
  const mb = await import(MB);
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, Input, BlobSource, ALL_FORMATS, CanvasSink, canEncodeAudio } = mb;
  exporting = true; cancelExport = false;
  const inputs = [];
  try {
    const fps = 30, N = Math.max(1, Math.round(DUR * fps));
    progress(0.01, 'Preparing sound...');
    const mix = await buildMix(mb, exportAudioClips(), 48000, 2, () => cancelExport, (f) => progress(0.01 + f * 0.04, 'Preparing sound...'));
    const canvas = new OffscreenCanvas(W, H), ctx = canvas.getContext('2d');
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    currentOutput = output;
    const vsrc = new CanvasSource(canvas, { codec: 'avc', bitrate: vbitrate });
    output.addVideoTrack(vsrc, { frameRate: fps });
    let asrc = null;
    if (mix) { asrc = new AudioBufferSource({ codec: (await canEncodeAudio('aac')) ? 'aac' : 'opus', bitrate: 128000 }); output.addAudioTrack(asrc); }

    const sinks = new Map();
    for (const id of new Set(st.clips.filter((c) => c.lane === 'main').map((c) => c.mid))) {
      const m = media.get(id); if (!m || m.type !== 'video') continue;
      const input = new Input({ source: new BlobSource(m.file), formats: ALL_FORMATS }); inputs.push(input);
      const vt = await input.getPrimaryVideoTrack();
      if (!vt) throw new Error(m.name + ' has no video track.');
      if (!(await vt.canDecode())) throw new Error(m.name + ' uses a video format this browser cannot decode.');
      sinks.set(id, new CanvasSink(vt, { poolSize: 2 }));
    }
    const M = st.meta, tags = {};
    if (M.title) tags.title = M.title; if (M.desc) tags.description = M.desc; if (M.author) tags.artist = M.author;
    if (M.date) { const d = new Date(M.date + 'T12:00:00'); if (!isNaN(d)) tags.date = d; }
    const cm = []; if (M.copy) cm.push('Copyright: ' + M.copy); if (M.tags) cm.push('Tags: ' + M.tags); if (M.place) cm.push('Place: ' + M.place);
    if (cm.length) tags.comment = cm.join(' | ');
    const frameFor = async (c, tt) => {
      const m = media.get(c.mid); if (!m) return null;
      if (m.type === 'image') return m.el;
      const w = await sinks.get(c.mid).getCanvas(clamp(c.in + (tt - c.s) * c.speed, c.in, Math.max(c.in, c.out - 0.001)));
      return w ? w.canvas : null;
    };
    try {
      const ct = clamp(M.cover, 0, Math.max(0, DUR - 0.05)), cc = mainAt(ct);
      const full = new OffscreenCanvas(W, H), fg = full.getContext('2d'), small = new OffscreenCanvas(Math.round(W / 2), Math.round(H / 2));
      renderFrame(fg, W, H, ct, cc ? await frameFor(cc, ct) : null); small.getContext('2d').drawImage(full, 0, 0, small.width, small.height);
      const b = await small.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
      tags.images = [{ data: new Uint8Array(await b.arrayBuffer()), mimeType: 'image/jpeg', kind: 'coverFront' }];
    } catch (e) { /* the cover is optional */ }
    output.setMetadataTags(tags);
    /* Read each clip's frames in order, in one pass. Asking for every frame on its own gets slower and slower, most of all
       for recordings made in a browser. */
    const times = new Map();
    for (let i = 0; i < N; i++) {
      const tt = i / fps, c = mainAt(tt), m = c && media.get(c.mid);
      if (m && m.type === 'video') { let a = times.get(c.id); if (!a) times.set(c.id, a = []); a.push(clamp(c.in + (tt - c.s) * c.speed, c.in, Math.max(c.in, c.out - 0.001))); }
    }
    const gens = new Map();
    const nextFrame = async (c) => {
      let g = gens.get(c.id);
      if (!g) { g = sinks.get(c.mid).canvasesAtTimestamps(times.get(c.id))[Symbol.asyncIterator](); gens.set(c.id, g); }
      const r = await g.next();
      return r.done || !r.value ? null : r.value.canvas;
    };
    await output.start();
    for (let i = 0; i < N; i++) {
      if (cancelExport) { await output.cancel(); throw new Error('cancelled'); }
      const tt = i / fps, c = mainAt(tt);
      const cm = c && media.get(c.mid);
      renderFrame(ctx, W, H, tt, !cm ? null : cm.type === 'image' ? cm.el : await nextFrame(c));
      await vsrc.add(tt, 1 / fps);
      if (i % 3 === 0) { progress(0.05 + 0.88 * i / N, 'Making your video...'); await yieldNow(); }
    }
    if (asrc) { progress(0.95, 'Saving sound...'); await asrc.add(mix); }
    progress(0.98, 'Finishing...');
    await output.finalize();
    progress(1, 'Done');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    for (const i of inputs) i.dispose && i.dispose();
    exporting = false; currentOutput = null;
  }
}
$('exportBtn').onclick = openExport;
$('modal').onclick = (e) => { if (e.target === $('modal') && !exporting) $('modal').classList.remove('on'); };

/* ------------------------------------------------------------------ how to use: help sheet, guided tour, welcome */
const touch = matchMedia('(pointer: coarse)').matches;
const flag = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage may be blocked */ } }
};
const TOUR = [
  { sel: '#stagewrap', title: 'This is your video', text: 'Press play to watch it. Every change you make shows up here straight away.' },
  { sel: '#scroll', title: 'Your timeline', text: (touch ? 'Tap' : 'Click') + ' a clip to select it. Then drag the white ends to trim it, or hold and drag a text or caption clip to move it.' },
  { sel: '#acts', title: 'Cut and rearrange', text: 'With a clip selected, Split cuts it at the red line, Delete removes it, Copy duplicates it, and Earlier and Later change the order. Made a mistake? Undo.' },
  { sel: '#ruler', title: 'Move the red line', text: (touch ? 'Tap or drag' : 'Click or drag') + ' along the numbers to move the red line. Split cuts wherever the line is.' },
  { sel: '#toolbar', title: 'Everything else is here', text: 'Text, Captions, Sound, Filters, Adjust, Speed, Size and Details. ' + (touch ? 'Tap' : 'Click') + ' one to open its options, and Done to close it.' },
  { sel: '.tb[data-t="cap"]', title: 'Captions in one tap', text: 'Open Captions and press Make captions automatically. It writes the words from your speech, and you can fix any of them or pick a style like Karaoke.' },
  { sel: '#exportBtn', title: 'Export when you are happy', text: 'Pick a quality and your video is made on this device and saved as an MP4. Nothing is uploaded.' }
];
let tourEl = null, tourStep = 0, tourOnResize = null;
function endTour(done) {
  if (tourEl) { tourEl.remove(); tourEl = null; }
  if (tourOnResize) { removeEventListener('resize', tourOnResize); tourOnResize = null; }
  if (done) flag.set('ve_tour', '1');
}
function placeTour() {
  if (!tourEl) return;
  const step = TOUR[tourStep], target = document.querySelector(step.sel);
  const spot = tourEl.querySelector('.tr-spot'), tip = tourEl.querySelector('.tr-tip');
  const r = target ? target.getBoundingClientRect() : null;
  if (!r || !r.width || !r.height) { spot.style.opacity = 0; tip.style.top = '30%'; tip.style.left = '50%'; tip.style.transform = 'translateX(-50%)'; return; }
  const pad = 6;
  spot.style.opacity = 1;
  spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px'; spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
  const tw = Math.min(330, innerWidth - 24); tip.style.width = tw + 'px'; tip.style.transform = 'none';
  const th = tip.offsetHeight, below = innerHeight - r.bottom, above = r.top;
  let top = below >= th + 24 ? r.bottom + pad + 12 : above >= th + 24 ? r.top - pad - 12 - th : Math.max(12, innerHeight - th - 12);
  let left = clamp(r.left + r.width / 2 - tw / 2, 12, innerWidth - tw - 12);
  tip.style.top = top + 'px'; tip.style.left = left + 'px';
}
function showTourStep() {
  const step = TOUR[tourStep], last = tourStep === TOUR.length - 1;
  const tip = tourEl.querySelector('.tr-tip');
  tip.innerHTML = '<div class="tr-n">' + (tourStep + 1) + ' of ' + TOUR.length + '</div><h3>' + esc(step.title) + '</h3><p>' + esc(step.text) + '</p>' +
    '<div class="tr-dots">' + TOUR.map((x, i) => '<i' + (i === tourStep ? ' class="on"' : '') + '></i>').join('') + '</div>' +
    '<div class="tr-btns"><button class="tr-skip" data-a="skip">' + (last ? '' : 'Skip') + '</button>' + (tourStep ? '<button class="tr-back" data-a="back">Back</button>' : '') + '<button class="tr-next" data-a="next">' + (last ? 'Got it' : 'Next') + '</button></div>';
  placeTour(); requestAnimationFrame(placeTour);
}
function startTour() {
  if (!mains().length) { toast('Add a video first, then take the tour.'); return false; }
  closeTool(); setPlay(false);
  $('modal').classList.remove('on'); hideWelcome(); endTour(false);
  tourStep = 0;
  tourEl = document.createElement('div'); tourEl.className = 'tour'; tourEl.innerHTML = '<div class="tr-spot"></div><div class="tr-tip" role="dialog" aria-label="Quick tour"></div>';
  document.body.appendChild(tourEl);
  tourEl.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'skip') endTour(true);
    else if (a.dataset.a === 'back') { tourStep = Math.max(0, tourStep - 1); showTourStep(); }
    else if (tourStep >= TOUR.length - 1) { endTour(true); toast('You are ready. Have fun!'); }
    else { tourStep++; showTourStep(); }
  });
  tourOnResize = () => placeTour(); addEventListener('resize', tourOnResize);
  showTourStep(); return true;
}
addEventListener('keydown', (e) => { if (tourEl) { if (e.key === 'Escape') endTour(true); else if (e.key === 'ArrowRight' || e.key === 'Enter') { const n = tourEl.querySelector('[data-a="next"]'); if (n) n.click(); } else if (e.key === 'ArrowLeft') { const b = tourEl.querySelector('[data-a="back"]'); if (b) b.click(); } } }, true);

function openHelp() {
  const box = $('mbox');
  const steps = [
    ['Add', 'Tap <b>Add your video</b> and pick videos, photos or music from your device. They never leave it.'],
    ['Cut', 'Tap a clip, move the red line, and tap <b>Split</b>. <b>Delete</b> what you do not want, or drag the white ends to trim.'],
    ['Style', '<b>Text</b>, <b>Filters</b>, <b>Adjust</b>, <b>Speed</b> and <b>Size</b> make it yours. Pick 9:16 for TikTok and Reels.'],
    ['Captions', 'Open <b>Captions</b> and press <b>Make captions automatically</b>. Fix any words and pick a style like Karaoke.'],
    ['Sound', 'Add your own music or record a voiceover in <b>Sound</b>, and set the volume of each clip.'],
    ['Export', 'Fill in <b>Details</b> if you like, then tap <b>Export</b> and save your MP4.']
  ];
  box.innerHTML = '<h2>How to make a video</h2><p>Six quick steps. It is easier than it looks.</p><div class="howlist">' +
    steps.map((s, i) => '<div class="how"><span class="hn">' + (i + 1) + '</span><div><b>' + s[0] + '</b><br>' + s[1] + '</div></div>').join('') + '</div>' +
    '<div class="tips"><b>Good to know</b><ul><li>Make captions last, after you finish cutting.</li><li>Keep this tab open while exporting. 720p is quicker.</li><li>' + (touch ? 'Everything happens on your phone and nothing is uploaded.' : 'Space plays, S splits, Delete removes, Ctrl+Z undoes and Ctrl+Y redoes. The arrow keys step one frame, and Shift with an arrow steps one second. Home and End jump to the start and the end. Press ? to open this help.') + '</li></ul></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px"><button class="opt" id="hClose" style="justify-content:center;margin:0">Close</button><button class="opt" id="hTour" style="justify-content:center;margin:0;background:var(--acc);border-color:var(--acc);color:#1a0b0a;font-weight:700">Take the tour</button></div>';
  $('modal').classList.add('on');
  $('hClose').onclick = () => $('modal').classList.remove('on');
  $('hTour').onclick = () => { if (!startTour()) $('modal').classList.remove('on'); };
}
let welcomeEl = null;
function hideWelcome() { if (welcomeEl) { welcomeEl.remove(); welcomeEl = null; } }
function offerTour() {
  if (flag.get('ve_tour') || welcomeEl || tourEl) return;
  welcomeEl = document.createElement('div'); welcomeEl.className = 'welcome';
  welcomeEl.innerHTML = '<b>Nice, your first video is in.</b><span>Want a quick 30 second tour?</span><div><button data-w="no">Not now</button><button data-w="yes" class="pri">Show me</button></div>';
  document.body.appendChild(welcomeEl);
  welcomeEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    flag.set('ve_tour', '1'); hideWelcome(); if (b.dataset.w === 'yes') startTour();
  });
}
$('help').onclick = openHelp;
$('howlink').onclick = openHelp;

/* ------------------------------------------------------------------ start */
if (!('VideoEncoder' in window) || !('OffscreenCanvas' in window)) {
  $('empty').querySelector('p').textContent = 'This browser cannot export video. Please use Chrome or Edge on a computer or Android phone.';
}
$('guides').onclick = () => { const on = $('stage').classList.toggle('guides'); $('guides').setAttribute('aria-pressed', on); };
if (/[?&]desktop=1/.test(location.search)) { const bk = document.querySelector('.top .back'); if (bk) bk.hidden = true; }
applyRatio(); buildToolbar(); updateActs(); draw(); syncZoomUI();
if (isDesk()) openTool('add');
matchMedia('(min-width:1100px) and (min-height:620px)').addEventListener('change', () => { drawTL(); if (isDesk() && !tool) openTool('add'); });
window.__ve = { st, media, importFile, handleFiles, addToTimeline, refresh, layout, renderFrame, runExport, seek, setPlay, get DUR() { return DUR; }, get t() { return t; }, undo, redo, dims };
