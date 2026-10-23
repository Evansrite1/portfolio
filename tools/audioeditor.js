/* Free audio editor and multitrack recorder. Everything runs in the browser. */

const $ = (id) => document.getElementById(id);
const ROW_H = 96, RULER_H = 28, EDGE = 6, MIN_CLIP = 0.02;
const COLORS = ['#ff5b52', '#4cc3ff', '#3ddc84', '#ffb84c', '#b88cff', '#ff7ad9', '#5eead4', '#f4e04d'];
const MB_URL = '/tools/vendor/mediabunny/mediabunny.min.mjs';
const MP3_URL = '/tools/vendor/mediabunny/mp3-encoder.min.mjs';

/* ------------------------------------------------------------------ state */
const S = {
  tracks: [], sel: { track: null, clip: null },
  pps: 60, playhead: 0, loop: false, follow: true,
  history: [], future: [], nid: 1, rec: null, dragSeek: false
};
const P = { playing: false, from: 0, when: 0, bus: null, srcs: [], nodes: new Map(), origin: 0 };
const inp = { stream: null, src: null, node: null, proc: null, sink: null, mon: null, nch: 0, key: '', multi: false, chunks: [], peaks: [], own: false, flushWait: null };
let ctx = null;
let testStream = null;
let noDownload = false;
let lastExport = null;
let probedCh = 0;
let raf = 0;
let dirty = true;
const gate = new Set();

/* ------------------------------------------------------------------ helpers */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const nid = () => S.nid++;
function fmtT(s, ms) {
  s = Math.max(0, s || 0) + 1e-7;
  const m = Math.floor(s / 60), sec = s - m * 60;
  const whole = Math.floor(sec), frac = Math.floor((sec - whole) * 1000);
  return String(m).padStart(2, '0') + ':' + String(whole).padStart(2, '0') + (ms === false ? '' : '.' + String(frac).padStart(3, '0'));
}
function say(msg) { $('ae-status').textContent = msg || ''; }
function fail(msg) { $('ae-error').textContent = msg || ''; }
function lsGet(k, d) { try { const v = localStorage.getItem('ae.' + k); return v === null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem('ae.' + k, String(v)); } catch (e) { /* storage may be blocked */ } }
function safeName(s) { return (String(s || 'track').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'track').slice(0, 60); }
const dbOf = (g) => (g > 0 ? 20 * Math.log10(g) : -99);

function getCtx() {
  if (!ctx || ctx.state === 'closed') {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('This browser does not support the Web Audio API. Please use a current version of Chrome, Edge, Firefox or Safari.');
    ctx = new AC({ latencyHint: 'interactive' });
  }
  return ctx;
}
async function ensureRunning() {
  const c = getCtx();
  if (c.state === 'suspended') {
    try { await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 600))]); } catch (e) { /* ignore */ }
  }
  return c;
}

/* ------------------------------------------------------------------ history */
function snapshot() {
  return S.tracks.map((t) => ({ id: t.id, name: t.name, color: t.color, vol: t.vol, pan: t.pan, mute: t.mute, solo: t.solo, clips: t.clips.map((c) => ({ ...c })) }));
}
function restore(snap) {
  S.tracks = snap.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c })) }));
  if (!S.tracks.find((t) => t.id === S.sel.track)) S.sel.track = null;
  if (!findClip(S.sel.clip)) S.sel.clip = null;
  rebuildHeads(); afterEdit(true);
}
function pushHistory() {
  S.history.push(snapshot());
  if (S.history.length > 60) S.history.shift();
  S.future.length = 0;
  syncUndo();
}
function editOnce(key) { if (!gate.has(key)) { gate.add(key); pushHistory(); } }
function undo() {
  if (!S.history.length || S.rec) return;
  S.future.push(snapshot()); restore(S.history.pop()); syncUndo();
}
function redo() {
  if (!S.future.length || S.rec) return;
  S.history.push(snapshot()); restore(S.future.pop()); syncUndo();
}
function syncUndo() {
  $('ae-undo').disabled = !S.history.length;
  $('ae-redo').disabled = !S.future.length;
  $('ae-clear').disabled = !S.tracks.length;
}

/* ------------------------------------------------------------------ model */
function findClip(id) {
  if (id == null) return null;
  for (const t of S.tracks) for (const c of t.clips) if (c.id === id) return { track: t, clip: c };
  return null;
}
function selClip() { const f = findClip(S.sel.clip); return f ? f.clip : null; }
function projectEnd() {
  let e = 0;
  for (const t of S.tracks) for (const c of t.clips) e = Math.max(e, c.start + c.dur);
  return e;
}
function newTrack(name, buf, extra) {
  const color = COLORS[S.tracks.length % COLORS.length];
  const t = { id: nid(), name: safeName(name), color, vol: 1, pan: 0, mute: false, solo: false, clips: [] };
  if (buf) t.clips.push(newClip(buf, 0, 0, buf.duration));
  if (extra) Object.assign(t, extra);
  return t;
}
function newClip(buf, start, off, dur) {
  return { id: nid(), buf, start, off, dur, gain: 1, fadeIn: 0, fadeOut: 0 };
}
function fixFades(c) {
  c.fadeIn = clamp(c.fadeIn || 0, 0, c.dur);
  c.fadeOut = clamp(c.fadeOut || 0, 0, Math.max(0, c.dur - c.fadeIn));
}

/* ------------------------------------------------------------------ peaks */
const BLK = 256;
const peakCache = new WeakMap();
const chanCache = new WeakMap();
function chans(buf) {
  let c = chanCache.get(buf);
  if (!c) { c = []; for (let i = 0; i < buf.numberOfChannels; i++) c.push(buf.getChannelData(i)); chanCache.set(buf, c); }
  return c;
}
function peaksOf(buf) {
  let p = peakCache.get(buf);
  if (p) return p;
  const n = Math.ceil(buf.length / BLK), mn = new Float32Array(n), mx = new Float32Array(n), cs = chans(buf);
  for (let b = 0; b < n; b++) {
    let lo = 1, hi = -1;
    const s = b * BLK, e = Math.min(buf.length, s + BLK);
    for (let k = 0; k < cs.length; k++) { const d = cs[k]; for (let i = s; i < e; i++) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v; } }
    mn[b] = lo; mx[b] = hi;
  }
  p = { mn, mx }; peakCache.set(buf, p);
  return p;
}
const pk = [0, 0];
function colPeak(buf, a, b) {
  a = Math.max(0, Math.floor(a));
  b = Math.min(buf.length, Math.max(a + 1, Math.ceil(b)));
  let lo = 1, hi = -1;
  if (b - a > BLK * 2) {
    const p = peaksOf(buf);
    for (let k = Math.floor(a / BLK), e = Math.floor((b - 1) / BLK); k <= e; k++) { if (p.mn[k] < lo) lo = p.mn[k]; if (p.mx[k] > hi) hi = p.mx[k]; }
  } else {
    const cs = chans(buf);
    for (let k = 0; k < cs.length; k++) { const d = cs[k]; for (let i = a; i < b; i++) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v; } }
  }
  if (lo > hi) { lo = 0; hi = 0; }
  pk[0] = lo; pk[1] = hi; return pk;
}
function segPeak(buf, off, dur) {
  const sr = buf.sampleRate, a = Math.floor(off * sr), b = Math.min(buf.length, Math.ceil((off + dur) * sr));
  let m = 0;
  for (const d of chans(buf)) for (let i = a; i < b; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > m) m = v; }
  return m;
}

/* ------------------------------------------------------------------ audio graph (live and offline) */
function stereoize(node) { node.channelCount = 2; node.channelCountMode = 'explicit'; node.channelInterpretation = 'speakers'; }
function clipEnv(c, t) {
  const fi = c.fadeIn > 0 ? Math.min(1, t / c.fadeIn) : 1;
  const fo = c.fadeOut > 0 ? Math.min(1, (c.dur - t) / c.fadeOut) : 1;
  return c.gain * Math.max(0, fi) * Math.max(0, fo);
}
function panGains(pan) { return [pan > 0 ? 1 - pan : 1, pan < 0 ? 1 + pan : 1]; }
function audible(tr, anySolo) { return !tr.mute && (!anySolo || tr.solo); }

/* Build the node graph for the given tracks. Clips are scheduled so that timeline time t0 happens at audio time `when`. */
function buildGraph(c, dest, tracks, t0, when, isOn, reg) {
  for (const tr of tracks) {
    if (!tr.clips.length) continue;
    const tg = c.createGain(); stereoize(tg);
    tg.gain.value = isOn(tr) ? tr.vol : 0;
    const split = c.createChannelSplitter(2), gl = c.createGain(), gr = c.createGain(), mrg = c.createChannelMerger(2);
    const pg = panGains(tr.pan);
    gl.gain.value = pg[0]; gr.gain.value = pg[1];
    tg.connect(split); split.connect(gl, 0); split.connect(gr, 1);
    gl.connect(mrg, 0, 0); gr.connect(mrg, 0, 1); mrg.connect(dest);
    if (reg) reg.nodes.set(tr.id, { tg, gl, gr });
    for (const cl of tr.clips) {
      if (cl.start + cl.dur <= t0) continue;
      const skip = Math.max(0, t0 - cl.start);
      const at = when + Math.max(0, cl.start - t0);
      const src = c.createBufferSource(); src.buffer = cl.buf;
      const g = c.createGain(); stereoize(g);
      src.connect(g); g.connect(tg);
      const gp = g.gain;
      gp.setValueAtTime(clipEnv(cl, skip), at);
      for (const p of [cl.fadeIn, cl.dur - cl.fadeOut, cl.dur]) if (p > skip) gp.linearRampToValueAtTime(clipEnv(cl, p), at + (p - skip));
      src.start(at, cl.off + skip, Math.max(0.001, cl.dur - skip));
      if (reg) reg.srcs.push(src);
    }
  }
}
function applyLive() {
  if (!P.playing || !ctx) return;
  const any = S.tracks.some((t) => t.solo), now = ctx.currentTime;
  for (const tr of S.tracks) {
    const n = P.nodes.get(tr.id);
    if (!n) continue;
    const pg = panGains(tr.pan);
    n.tg.gain.setTargetAtTime(audible(tr, any) ? tr.vol : 0, now, 0.01);
    n.gl.gain.setTargetAtTime(pg[0], now, 0.01);
    n.gr.gain.setTargetAtTime(pg[1], now, 0.01);
  }
}

/* ------------------------------------------------------------------ playback */
function stopSources() {
  for (const s of P.srcs) { try { s.stop(); } catch (e) { /* not started */ } try { s.disconnect(); } catch (e) { /* ok */ } }
  if (P.bus) { try { P.bus.disconnect(); } catch (e) { /* ok */ } }
  P.srcs = []; P.bus = null; P.nodes.clear();
}
function startPlayback(from, when) {
  stopSources();
  const c = getCtx();
  P.bus = c.createGain(); P.bus.connect(c.destination);
  P.from = from; P.when = when == null ? c.currentTime + 0.04 : when; P.playing = true;
  const any = S.tracks.some((t) => t.solo);
  buildGraph(c, P.bus, S.tracks, from, P.when, (tr) => audible(tr, any), P);
  syncTransport(); kick();
}
function posNow() { return P.from + Math.max(0, (ctx ? ctx.currentTime : 0) - P.when); }
function reschedule() {
  if (!P.playing || S.rec) return;
  const pos = posNow();
  S.playhead = pos;
  startPlayback(pos);
}
async function togglePlay() {
  fail('');
  if (S.rec) { await stopRecording(); return; }
  if (P.playing) { pausePlayback(); return; }
  const end = projectEnd();
  if (end <= 0) { say('Add an audio file or record something first.'); return; }
  const c = await ensureRunning();
  if (c.state !== 'running') { fail('The browser blocked audio. Click on the page and press Play again.'); return; }
  if (S.playhead >= end - 0.01) S.playhead = 0;
  P.origin = S.playhead;
  startPlayback(S.playhead);
}
function pausePlayback() {
  if (!P.playing) return;
  S.playhead = Math.min(posNow(), projectEnd() || posNow());
  stopSources(); P.playing = false; syncTransport(); requestDraw(); updateTime();
}
async function stopAll() {
  if (S.rec) { await stopRecording(); return; }
  const was = P.playing;
  if (was) { stopSources(); P.playing = false; S.playhead = P.origin; }
  else S.playhead = 0;
  syncTransport(); requestDraw(); updateTime();
}
function seek(t, final) {
  S.playhead = clamp(t, 0, 36000);
  updateTime(); requestDraw();
  if (final && P.playing && !S.rec) startPlayback(S.playhead);
}

/* ------------------------------------------------------------------ transport UI */
function syncTransport() {
  $('ae-play').textContent = P.playing && !S.rec ? 'Pause' : 'Play';
  $('ae-loop').setAttribute('aria-pressed', String(S.loop));
  const r = !!S.rec;
  for (const id of ['ae-rec', 'ae-rec2']) { const b = $(id); b.classList.toggle('on', r); b.textContent = r ? 'Stop recording' : 'Record'; }
  $('ae-rec2').textContent = r ? 'Stop rec' : 'Record';
  syncUndo(); syncClipBar();
}
function updateTime() {
  const pos = P.playing ? posNow() : S.playhead;
  $('ae-time').innerHTML = fmtT(pos) + ' <small>/ ' + fmtT(Math.max(projectEnd(), S.rec ? pos : 0)) + '</small>';
}
function syncClipBar() {
  const c = selClip(), has = !!c && !S.rec;
  for (const id of ['ae-split', 'ae-dup', 'ae-del', 'ae-rev', 'ae-norm', 'ae-gain', 'ae-fin', 'ae-fout']) $(id).disabled = !has;
  $('ae-split').disabled = S.rec ? true : !S.tracks.length;
  if (c) {
    if (document.activeElement !== $('ae-gain')) $('ae-gain').value = String(Math.round(dbOf(c.gain) * 100) / 100);
    if (document.activeElement !== $('ae-fin')) $('ae-fin').value = String(Math.round(c.fadeIn * 1000) / 1000);
    if (document.activeElement !== $('ae-fout')) $('ae-fout').value = String(Math.round(c.fadeOut * 1000) / 1000);
  }
}

/* ------------------------------------------------------------------ track headers */
function rebuildHeads() {
  const box = $('ae-heads');
  box.querySelectorAll('.ae-head').forEach((n) => n.remove());
  for (const tr of S.tracks) box.appendChild(headFor(tr));
  if (S.rec) for (let i = 0; i < S.rec.n; i++) {
    const d = document.createElement('div'); d.className = 'ae-head recrow'; d.textContent = 'Recording...'; d.style.setProperty('--tc', 'var(--accent)'); box.appendChild(d);
  }
  syncSelHeads(); layout(); syncUndo();
}
function syncSelHeads() {
  $('ae-heads').querySelectorAll('.ae-head[data-id]').forEach((h) => h.classList.toggle('sel', +h.dataset.id === S.sel.track));
}
function mk(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k in attrs) { if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
  return e;
}
function headFor(tr) {
  const h = mk('div', 'ae-head'); h.dataset.id = tr.id; h.style.setProperty('--tc', tr.color);
  const r1 = mk('div', 'r1'), r2 = mk('div', 'r2'), r3 = mk('div', 'r3');
  const name = mk('input', '', { type: 'text', 'aria-label': 'Track name', maxlength: '60' }); name.value = tr.name;
  const col = mk('input', '', { type: 'color', 'aria-label': 'Track colour' }); col.value = tr.color;
  const del = mk('button', 'del', { type: 'button', 'aria-label': 'Delete track ' + tr.name, title: 'Delete track', text: 'x' });
  r1.append(name, col, del);
  const m = mk('button', 'ms m', { type: 'button', 'aria-label': 'Mute', 'aria-pressed': String(tr.mute), title: 'Mute', text: 'M' });
  const s = mk('button', 'ms s', { type: 'button', 'aria-label': 'Solo', 'aria-pressed': String(tr.solo), title: 'Solo', text: 'S' });
  const vol = mk('input', '', { type: 'range', min: '0', max: '150', step: '1', 'aria-label': 'Volume', title: 'Volume (double-click for 100%)' }); vol.value = Math.round(tr.vol * 100);
  r2.append(m, s, vol);
  const pl = mk('span', '', { text: 'Pan' });
  const pan = mk('input', '', { type: 'range', min: '-100', max: '100', step: '1', 'aria-label': 'Pan', title: 'Pan (double-click for center)' }); pan.value = Math.round(tr.pan * 100);
  r3.append(pl, pan);
  h.append(r1, r2, r3);

  name.addEventListener('input', () => { editOnce('n' + tr.id); tr.name = name.value; del.setAttribute('aria-label', 'Delete track ' + tr.name); requestDraw(); });
  name.addEventListener('change', () => gate.delete('n' + tr.id));
  col.addEventListener('input', () => { editOnce('c' + tr.id); tr.color = col.value; h.style.setProperty('--tc', tr.color); requestDraw(); });
  col.addEventListener('change', () => gate.delete('c' + tr.id));
  m.addEventListener('click', () => { pushHistory(); tr.mute = !tr.mute; m.setAttribute('aria-pressed', String(tr.mute)); applyLive(); requestDraw(); });
  s.addEventListener('click', () => { pushHistory(); tr.solo = !tr.solo; s.setAttribute('aria-pressed', String(tr.solo)); applyLive(); requestDraw(); });
  vol.addEventListener('input', () => { editOnce('v' + tr.id); tr.vol = vol.value / 100; applyLive(); });
  vol.addEventListener('change', () => gate.delete('v' + tr.id));
  vol.addEventListener('dblclick', () => { pushHistory(); tr.vol = 1; vol.value = 100; applyLive(); });
  pan.addEventListener('input', () => { editOnce('p' + tr.id); tr.pan = pan.value / 100; applyLive(); });
  pan.addEventListener('change', () => gate.delete('p' + tr.id));
  pan.addEventListener('dblclick', () => { pushHistory(); tr.pan = 0; pan.value = 0; applyLive(); });
  del.addEventListener('click', () => {
    if (S.rec) return;
    pushHistory();
    S.tracks = S.tracks.filter((t) => t !== tr);
    if (S.sel.track === tr.id) S.sel.track = null;
    if (!findClip(S.sel.clip)) S.sel.clip = null;
    rebuildHeads(); afterEdit(true);
  });
  h.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input,button')) return;
    S.sel.track = tr.id; syncSelHeads(); requestDraw();
  });
  for (const el of [name, vol, pan]) el.addEventListener('focus', () => { S.sel.track = tr.id; syncSelHeads(); requestDraw(); });
  return h;
}

/* ------------------------------------------------------------------ layout and drawing */
const cv = $('ae-canvas'), scroller = $('ae-scroll'), inner = $('ae-inner');
let g2 = cv.getContext('2d');
let viewW = 600;
function rowCount() { return Math.max(2, S.tracks.length + (S.rec ? S.rec.n : 0)); }
function contentW() {
  const end = Math.max(projectEnd(), S.rec ? S.rec.liveEnd || 0 : 0);
  return Math.max(viewW, Math.ceil((end + Math.max(8, (viewW / S.pps) * 0.5)) * S.pps));
}
function layout() {
  viewW = Math.max(200, scroller.clientWidth);
  const h = RULER_H + rowCount() * ROW_H;
  inner.style.width = contentW() + 'px';
  inner.style.height = h + 'px';
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(viewW * dpr), hh = Math.round(h * dpr);
  if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
  cv.style.width = viewW + 'px'; cv.style.height = h + 'px';
  $('ae-heads').style.minHeight = (RULER_H + rowCount() * ROW_H) + 'px';
  requestDraw();
}
function requestDraw() { dirty = true; kick(); }
function kick() { if (!raf) raf = requestAnimationFrame(tick); }
const t2x = (t) => t * S.pps - scroller.scrollLeft;
const x2t = (x) => (x + scroller.scrollLeft) / S.pps;

function colors() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n, d) => (cs.getPropertyValue(n).trim() || d);
  return { paper: g('--paper', '#0a0a0a'), raised: g('--raised', '#151515'), ink: g('--ink', '#f2f2f2'), faint: g('--faint', '#8a8a8a'), line: g('--line', '#2a2a2a'), line2: g('--line2', '#3c3c3c'), accent: g('--accent', '#ff5b52') };
}
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function draw() {
  dirty = false;
  const dpr = window.devicePixelRatio || 1;
  const W = viewW, H = RULER_H + rowCount() * ROW_H, K = colors();
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  g2.clearRect(0, 0, W, H);
  g2.fillStyle = K.paper; g2.fillRect(0, 0, W, H);
  const rows = rowCount(), any = S.tracks.some((t) => t.solo), sl = scroller.scrollLeft;
  // rows
  for (let r = 0; r < rows; r++) {
    const y = RULER_H + r * ROW_H;
    const tr = S.tracks[r];
    g2.fillStyle = tr && tr.id === S.sel.track ? hexA(tr.color, 0.08) : (r % 2 ? K.raised : K.paper);
    g2.fillRect(0, y, W, ROW_H);
    g2.fillStyle = K.line; g2.fillRect(0, y + ROW_H - 1, W, 1);
  }
  // ruler
  g2.fillStyle = K.raised; g2.fillRect(0, 0, W, RULER_H);
  g2.fillStyle = K.line2; g2.fillRect(0, RULER_H - 1, W, 1);
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
  let step = 3600;
  for (const s of steps) if (s * S.pps >= 80) { step = s; break; }
  const sub = step / 5;
  g2.font = '11px ui-monospace, Menlo, Consolas, monospace'; g2.textBaseline = 'middle';
  const k0 = Math.floor(x2t(0) / sub), t1 = x2t(W);
  for (let k = k0; k * sub <= t1 + sub; k++) {
    const t = k * sub;
    const x = Math.round(t2x(t)) + 0.5;
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    g2.fillStyle = major ? K.faint : K.line2;
    g2.fillRect(x, major ? 14 : 20, 1, major ? 14 : 8);
    if (major) {
      g2.fillStyle = K.faint;
      g2.fillText(step < 1 ? fmtT(t).slice(0, step < 0.1 ? 9 : 8) : fmtT(t, false), x + 4, 9);
    }
  }
  // clips
  const sel = S.sel.clip;
  S.tracks.forEach((tr, r) => {
    const y = RULER_H + r * ROW_H, dim = !audible(tr, any);
    for (const c of tr.clips) {
      const x0 = t2x(c.start), x1 = t2x(c.start + c.dur);
      if (x1 < -2 || x0 > W + 2) continue;
      const cx0 = Math.max(0, x0), cx1 = Math.min(W, x1);
      g2.globalAlpha = dim ? 0.45 : 1;
      g2.fillStyle = hexA(tr.color, 0.2); g2.fillRect(cx0, y + 3, cx1 - cx0, ROW_H - 7);
      // waveform
      const top = y + 20, bot = y + ROW_H - 6, mid = (top + bot) / 2, half = (bot - top) / 2, sr = c.buf.sampleRate;
      g2.fillStyle = tr.color;
      const spp = sr / S.pps;
      for (let x = Math.floor(cx0); x < cx1; x++) {
        const tl = x2t(x) - c.start;
        if (tl < 0 || tl >= c.dur) continue;
        const a = (c.off + tl) * sr;
        const p = colPeak(c.buf, a, a + spp);
        const f = clipEnv(c, tl + 0.5 / S.pps);
        let yt = mid - p[1] * f * half, yb = mid - p[0] * f * half;
        if (yt < top - 2) yt = top - 2; if (yb > bot + 2) yb = bot + 2;
        g2.fillRect(x, yt, 1, Math.max(1, yb - yt));
      }
      // fade guides
      g2.strokeStyle = hexA(tr.color, 0.9); g2.lineWidth = 1;
      if (c.fadeIn > 0) { g2.beginPath(); g2.moveTo(x0, bot); g2.lineTo(x0 + c.fadeIn * S.pps, top); g2.stroke(); }
      if (c.fadeOut > 0) { g2.beginPath(); g2.moveTo(x1, bot); g2.lineTo(x1 - c.fadeOut * S.pps, top); g2.stroke(); }
      // frame and title
      g2.strokeStyle = c.id === sel ? K.ink : hexA(tr.color, 0.9);
      g2.lineWidth = c.id === sel ? 2 : 1;
      g2.strokeRect(x0 + 0.5, y + 3.5, x1 - x0 - 1, ROW_H - 8);
      g2.globalAlpha = dim ? 0.6 : 1;
      g2.fillStyle = K.ink; g2.font = '11px system-ui, sans-serif'; g2.textBaseline = 'alphabetic';
      g2.save(); g2.beginPath(); g2.rect(cx0, y + 3, cx1 - cx0, 16); g2.clip();
      g2.fillText(tr.name + (tr.mute ? ' (muted)' : ''), Math.max(x0, 0) + 6, y + 15);
      g2.restore();
      g2.globalAlpha = 1;
    }
  });
  // live recording placeholder
  if (S.rec) {
    const pos = Math.max(S.rec.startPos, P.playing ? posNow() : S.rec.startPos);
    S.rec.liveEnd = pos;
    for (let i = 0; i < S.rec.n; i++) {
      const y = RULER_H + (S.tracks.length + i) * ROW_H;
      const x0 = t2x(S.rec.startPos), x1 = t2x(pos);
      g2.fillStyle = hexA(K.accent, 0.22); g2.fillRect(Math.max(0, x0), y + 3, Math.max(2, x1 - Math.max(0, x0)), ROW_H - 7);
      g2.strokeStyle = K.accent; g2.lineWidth = 1; g2.strokeRect(x0 + 0.5, y + 3.5, Math.max(2, x1 - x0), ROW_H - 8);
    }
  }
  // empty message
  if (!S.tracks.length && !S.rec) {
    g2.fillStyle = K.faint; g2.font = '14px system-ui, sans-serif'; g2.textBaseline = 'alphabetic';
    g2.fillText('Drop audio files here, or press Record to make a new track.', 20, RULER_H + 54);
  }
  // playhead
  const ph = P.playing ? posNow() : S.playhead, px = Math.round(t2x(ph)) + 0.5;
  if (px >= -8 && px <= W + 8) {
    g2.fillStyle = K.accent; g2.fillRect(px - 0.5, 0, 1.5, H);
    g2.beginPath(); g2.moveTo(px - 6, 0); g2.lineTo(px + 7, 0); g2.lineTo(px + 0.5, 10); g2.closePath(); g2.fill();
  }
  void sl;
}

/* One animation loop does everything that needs frames. */
function tick() {
  raf = 0; lastTick = performance.now();
  let again = false;
  if (P.playing) {
    const pos = posNow(), end = projectEnd();
    if (!S.rec && pos >= end - 0.005) {
      if (S.loop && end > 0) { S.playhead = 0; P.origin = 0; startPlayback(0); }
      else { stopSources(); P.playing = false; S.playhead = end; syncTransport(); }
    } else if (S.follow && !S.dragSeek) {
      const x = t2x(pos);
      if (x > viewW - 40 || x < 0) scroller.scrollLeft = Math.max(0, pos * S.pps - 60);
    }
    updateTime(); again = P.playing; dirty = true;
  }
  if (S.rec) { again = true; dirty = true; layoutIfGrowing(); }
  if (inp.stream) { updateMeter(); again = true; }
  if (dirty) draw();
  if (again) kick();
}
// Background tabs do not run animation frames, so a timer keeps playback state, loop and the meter correct.
let lastTick = 0;
setInterval(() => {
  if (!(P.playing || S.rec || inp.stream) || performance.now() - lastTick < 250) return;
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  tick();
}, 100);
let lastLayoutW = 0;
function layoutIfGrowing() {
  const w = contentW();
  if (w !== lastLayoutW) { lastLayoutW = w; inner.style.width = w + 'px'; }
}

/* ------------------------------------------------------------------ zoom */
function setZoom(pps, anchorX) {
  pps = clamp(pps, 1, 3000);
  const ax = anchorX == null ? viewW / 2 : anchorX, at = x2t(ax);
  S.pps = pps; layout();
  scroller.scrollLeft = Math.max(0, at * S.pps - ax);
  requestDraw();
}
function fitZoom() {
  const end = projectEnd();
  if (end <= 0) { S.pps = 60; layout(); return; }
  S.pps = clamp((viewW - 30) / (end * 1.03), 1, 3000);
  layout(); scroller.scrollLeft = 0; requestDraw();
}

/* ------------------------------------------------------------------ editing actions */
function afterEdit(rs) {
  syncUndo(); syncClipBar(); layout(); updateTime();
  if (rs && P.playing && !S.rec) reschedule();
}
function selectClip(trackId, clipId) {
  S.sel.track = trackId; S.sel.clip = clipId;
  syncSelHeads(); syncClipBar(); requestDraw();
}
function splitAtPlayhead() {
  if (S.rec) return;
  const t = P.playing ? posNow() : S.playhead;
  let targets = [];
  const sc = findClip(S.sel.clip);
  const inside = (c) => t > c.start + MIN_CLIP && t < c.start + c.dur - MIN_CLIP;
  if (sc && inside(sc.clip)) targets = [sc];
  else {
    const pool = S.sel.track != null ? S.tracks.filter((x) => x.id === S.sel.track) : S.tracks;
    for (const tr of pool) for (const c of tr.clips) if (inside(c)) targets.push({ track: tr, clip: c });
  }
  if (!targets.length) { say('Move the playhead inside a clip, then split.'); return; }
  pushHistory();
  let last = null;
  for (const { track, clip } of targets) {
    const d = t - clip.start;
    const b = { ...clip, id: nid(), start: t, off: clip.off + d, dur: clip.dur - d, fadeIn: 0 };
    clip.dur = d; clip.fadeOut = 0;
    fixFades(clip); fixFades(b);
    track.clips.push(b);
    last = { track, b };
  }
  if (last) selectClip(last.track.id, last.b.id);
  say(targets.length > 1 ? 'Split ' + targets.length + ' clips at the playhead.' : 'Split at ' + fmtT(t) + '.');
  afterEdit(true);
}
function deleteClip() {
  const f = findClip(S.sel.clip);
  if (!f || S.rec) return;
  pushHistory();
  f.track.clips = f.track.clips.filter((c) => c !== f.clip);
  S.sel.clip = null;
  afterEdit(true);
}
function duplicateClip() {
  const f = findClip(S.sel.clip);
  if (!f || S.rec) return;
  pushHistory();
  const c = { ...f.clip, id: nid(), start: f.clip.start + f.clip.dur };
  f.track.clips.push(c);
  selectClip(f.track.id, c.id); afterEdit(true);
}
function reverseClip() {
  const f = findClip(S.sel.clip);
  if (!f || S.rec) return;
  const c = f.clip, b = c.buf, sr = b.sampleRate;
  const a = Math.floor(c.off * sr), len = Math.max(1, Math.min(b.length - a, Math.round(c.dur * sr)));
  pushHistory();
  const out = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: len, sampleRate: sr });
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const src = chans(b)[ch], dst = new Float32Array(len);
    for (let i = 0; i < len; i++) dst[i] = src[a + len - 1 - i];
    out.copyToChannel(dst, ch);
  }
  c.buf = out; c.off = 0; c.dur = len / sr;
  say('Reversed the clip.'); afterEdit(true);
}
function normalizeClip() {
  const c = selClip();
  if (!c || S.rec) return;
  const p = segPeak(c.buf, c.off, c.dur);
  if (p < 1e-5) { say('That clip is silent, so there is nothing to normalize.'); return; }
  pushHistory();
  c.gain = 0.977 / p;
  say('Normalized. The clip peak is now about -0.2 dB.'); afterEdit(true);
}

/* ------------------------------------------------------------------ pointer interaction */
let drag = null;
function rowAt(y) { const r = Math.floor((y - RULER_H) / ROW_H); return r >= 0 && r < S.tracks.length ? r : -1; }
function hit(x, y) {
  const r = rowAt(y);
  if (r < 0) return null;
  const tr = S.tracks[r], t = x2t(x);
  for (let i = tr.clips.length - 1; i >= 0; i--) {
    const c = tr.clips[i], x0 = t2x(c.start), x1 = t2x(c.start + c.dur);
    if (x >= x0 - 3 && x <= x1 + 3 && t >= c.start - 3 / S.pps && t <= c.start + c.dur + 3 / S.pps) {
      let zone = 'move';
      const wide = x1 - x0 > EDGE * 3;
      if (wide && Math.abs(x - x0) <= EDGE) zone = 'trimL';
      else if (wide && Math.abs(x - x1) <= EDGE) zone = 'trimR';
      else if (!wide) zone = 'move';
      return { track: tr, clip: c, zone, row: r };
    }
  }
  return { track: tr, clip: null, row: r };
}
cv.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  cv.focus({ preventScroll: true });
  const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top, t = x2t(x);
  if (y < RULER_H) {
    drag = { type: 'seek' }; S.dragSeek = true; seek(t, false);
  } else {
    const h = hit(x, y);
    if (h && h.clip && !S.rec) {
      selectClip(h.track.id, h.clip.id);
      drag = { type: h.zone, track: h.track, clip: h.clip, x0: x, start: h.clip.start, off: h.clip.off, dur: h.clip.dur, moved: false, t };
    } else {
      if (h) { S.sel.track = h.track.id; S.sel.clip = null; syncSelHeads(); syncClipBar(); }
      drag = { type: 'seek' }; S.dragSeek = true; seek(t, false);
    }
  }
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
});
cv.addEventListener('pointermove', (e) => {
  const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
  if (!drag) {
    const h = y >= RULER_H ? hit(x, y) : null;
    cv.style.cursor = h && h.clip ? (h.zone === 'move' ? 'grab' : 'ew-resize') : (y < RULER_H ? 'pointer' : 'default');
    return;
  }
  if (drag.type === 'seek') { seek(x2t(x), false); return; }
  const dt = (x - drag.x0) / S.pps, c = drag.clip;
  if (!drag.moved) { if (Math.abs(x - drag.x0) < 3) return; drag.moved = true; pushHistory(); }
  if (drag.type === 'move') {
    c.start = Math.max(0, drag.start + dt);
    const r = rowAt(y);
    if (r >= 0 && S.tracks[r] !== drag.track) {
      drag.track.clips = drag.track.clips.filter((k) => k !== c);
      drag.track = S.tracks[r]; drag.track.clips.push(c);
      S.sel.track = drag.track.id; syncSelHeads();
    }
    cv.style.cursor = 'grabbing';
  } else if (drag.type === 'trimL') {
    const ns = clamp(drag.start + dt, drag.start - drag.off, drag.start + drag.dur - MIN_CLIP);
    const d = ns - drag.start;
    c.start = ns; c.off = drag.off + d; c.dur = drag.dur - d;
  } else if (drag.type === 'trimR') {
    c.dur = clamp(drag.dur + dt, MIN_CLIP, c.buf.duration - c.off);
  }
  fixFades(c);
  layout(); syncClipBar(); updateTime();
});
function endDrag(e) {
  if (!drag) return;
  const d = drag; drag = null; S.dragSeek = false;
  try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* ok */ }
  if (d.type === 'seek') { seek(S.playhead, true); return; }
  if (d.moved) afterEdit(true);
  else seek(d.t, true);
}
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  const rc = cv.getBoundingClientRect();
  setZoom(S.pps * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX - rc.left);
}, { passive: false });
scroller.addEventListener('scroll', requestDraw);
if (window.ResizeObserver) new ResizeObserver(() => { if (Math.abs(scroller.clientWidth - viewW) > 1) layout(); }).observe(scroller);
window.addEventListener('resize', layout);
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', requestDraw); } catch (e) { /* old browser */ }

/* ------------------------------------------------------------------ import */
function u8str(dv, o, n) { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint8(o + i)); return s; }
function parseAiff(ab, c) {
  const dv = new DataView(ab);
  if (u8str(dv, 0, 4) !== 'FORM') throw new Error('not aiff');
  const kind = u8str(dv, 8, 4);
  let pos = 12, ch = 0, frames = 0, bits = 0, rate = 0, little = false, ssnd = -1;
  while (pos + 8 <= dv.byteLength) {
    const id = u8str(dv, pos, 4), size = dv.getUint32(pos + 4);
    if (id === 'COMM') {
      ch = dv.getUint16(pos + 8); frames = dv.getUint32(pos + 10); bits = dv.getUint16(pos + 14);
      const exp = dv.getUint16(pos + 16) & 0x7fff, hi = dv.getUint32(pos + 18), lo = dv.getUint32(pos + 22);
      rate = hi * Math.pow(2, exp - 16383 - 31) + lo * Math.pow(2, exp - 16383 - 63);
      if (kind === 'AIFC') { const ct = u8str(dv, pos + 26, 4); if (ct === 'sowt') little = true; else if (ct !== 'NONE' && ct !== 'twos') throw new Error('compressed aiff'); }
    } else if (id === 'SSND') {
      ssnd = pos + 8 + 8 + dv.getUint32(pos + 8);
    }
    pos += 8 + size + (size & 1);
  }
  if (!ch || ssnd < 0 || !frames) throw new Error('bad aiff');
  const bytes = bits / 8, out = new AudioBuffer({ numberOfChannels: ch, length: frames, sampleRate: Math.round(rate) });
  const data = [];
  for (let k = 0; k < ch; k++) data.push(new Float32Array(frames));
  let o = ssnd;
  for (let i = 0; i < frames; i++) {
    for (let k = 0; k < ch; k++) {
      let v;
      if (bytes === 1) v = dv.getInt8(o) / 128;
      else if (bytes === 2) v = dv.getInt16(o, little) / 32768;
      else if (bytes === 3) { const b0 = dv.getUint8(o), b1 = dv.getUint8(o + 1), b2 = dv.getUint8(o + 2); let n = little ? (b2 << 16 | b1 << 8 | b0) : (b0 << 16 | b1 << 8 | b2); if (n & 0x800000) n -= 0x1000000; v = n / 8388608; }
      else v = dv.getInt32(o, little) / 2147483648;
      data[k][i] = v; o += bytes;
    }
  }
  data.forEach((d, k) => out.copyToChannel(d, k));
  return out;
}
async function decodeMediabunny(file) {
  const mb = await import(MB_URL);
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error('no audio');
    const sink = new mb.AudioBufferSink(track), parts = [];
    let total = 0;
    for await (const w of sink.buffers()) { parts.push(w.buffer); total += w.buffer.length; }
    if (!parts.length) throw new Error('empty');
    const out = new AudioBuffer({ numberOfChannels: parts[0].numberOfChannels, length: total, sampleRate: parts[0].sampleRate });
    let pos = 0;
    for (const p of parts) { for (let ch = 0; ch < out.numberOfChannels; ch++) out.copyToChannel(p.getChannelData(Math.min(ch, p.numberOfChannels - 1)), ch, pos); pos += p.length; }
    return out;
  } finally { if (input.dispose) input.dispose(); }
}
async function decodeFile(file) {
  const ab = await file.arrayBuffer();
  const c = getCtx();
  try { return await c.decodeAudioData(ab.slice(0)); } catch (e1) { /* try the next decoder */ }
  try { if (ab.byteLength > 12 && String.fromCharCode(...new Uint8Array(ab, 0, 4)) === 'FORM') return parseAiff(ab, c); } catch (e2) { /* next */ }
  try { return await decodeMediabunny(file); } catch (e3) { /* give up */ }
  throw new Error('"' + file.name + '" could not be decoded. If it is an Audacity or Reaper project, export the tracks as WAV first. Other unusual formats: convert to WAV or MP3.');
}
let importing = false;
async function importFiles(list) {
  const files = Array.from(list || []).filter((f) => f && f.size > 0);
  if (!files.length) return;
  if (importing) { say('Still importing. Please wait.'); return; }
  if (S.rec) { fail('Stop recording before adding files.'); return; }
  importing = true; fail('');
  const bad = [], wasEmpty = !S.tracks.length;
  let added = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      say('Importing ' + (i + 1) + ' of ' + files.length + ': ' + files[i].name + '...');
      try {
        const buf = await decodeFile(files[i]);
        if (!added) pushHistory();
        const t = newTrack(files[i].name.replace(/\.[a-z0-9]{2,5}$/i, ''), buf);
        S.tracks.push(t); added++;
        S.sel.track = t.id; S.sel.clip = t.clips[0].id;
        rebuildHeads(); peaksOf(buf);
      } catch (e) { bad.push(e && e.message ? e.message : files[i].name + ' could not be read.'); }
    }
  } finally { importing = false; }
  if (added) {
    if (wasEmpty) fitZoom(); else layout();
    syncClipBar(); updateTime();
    say('Added ' + added + (added === 1 ? ' track.' : ' tracks.') + (bad.length ? ' ' + bad.length + ' could not be read.' : ''));
    if (P.playing) reschedule();
  } else say('');
  if (bad.length) fail(bad.join(' '));
}
$('ae-pick').addEventListener('click', () => $('ae-file').click());
$('ae-file').addEventListener('change', (e) => { const f = e.target.files; importFiles(f).then(() => { e.target.value = ''; }); });
function wireDrop(el) {
  ['dragenter', 'dragover'].forEach((n) => el.addEventListener(n, (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); $('ae-drop').classList.add('over'); } }));
  ['dragleave', 'drop'].forEach((n) => el.addEventListener(n, () => $('ae-drop').classList.remove('over')));
  el.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); importFiles(e.dataTransfer.files); } });
}
wireDrop($('ae-drop')); wireDrop($('ae-timeline'));

/* ------------------------------------------------------------------ recording */
const WORKLET = [
  'class Cap extends AudioWorkletProcessor {',
  ' constructor(o){ super(); this.n=o.processorOptions.nch; this.size=2048; this.b=[]; this.fill=0; this.start=0;',
  '  for(let i=0;i<this.n;i++) this.b.push(new Float32Array(this.size));',
  '  this.port.onmessage=(e)=>{ if(e.data==="flush"){ this.send(); this.port.postMessage({flushed:true}); } }; }',
  ' send(){ if(!this.fill) return; const d=this.b.map((a)=>a.slice(0,this.fill)); this.port.postMessage({f:this.start,d:d},d.map((a)=>a.buffer)); this.fill=0; }',
  ' process(inputs){ const x=inputs[0]||[]; if(this.fill===0) this.start=currentFrame;',
  '  for(let c=0;c<this.n;c++){ const ch=x[c]; if(ch) this.b[c].set(ch,this.fill); else this.b[c].fill(0,this.fill,this.fill+128); }',
  '  this.fill+=128; if(this.fill>=this.size) this.send(); return true; }',
  '}',
  'registerProcessor("ae-cap", Cap);'
].join('\n');

function inputSettings() {
  return { dev: $('ae-dev').value, mode: $('ae-mode').value, multi: $('ae-multi').checked && probedCh > 2, ec: $('ae-ec').checked, ns: $('ae-ns').checked, agc: $('ae-agc').checked, test: !!testStream };
}
function friendlyErr(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'The microphone is blocked. Allow microphone access for this site in your browser settings, then try again.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No matching audio input was found. Plug in or choose a different input device.';
  if (n === 'NotReadableError') return 'The microphone is in use by another program. Close it and try again.';
  return (e && e.message) ? e.message : 'The input could not be opened.';
}
function closeInput() {
  if (inp.node) { try { inp.node.disconnect(); } catch (e) { /* ok */ } if (inp.node.port) inp.node.port.onmessage = null; }
  if (inp.proc) { try { inp.proc.disconnect(); inp.proc.onaudioprocess = null; } catch (e) { /* ok */ } }
  for (const n of [inp.src, inp.sink, inp.mon]) if (n) { try { n.disconnect(); } catch (e) { /* ok */ } }
  if (inp.stream && inp.own) inp.stream.getTracks().forEach((t) => t.stop());
  Object.assign(inp, { stream: null, src: null, node: null, proc: null, sink: null, mon: null, nch: 0, key: '', chunks: [], peaks: [], own: false });
  buildMeter(0);
  $('ae-meter-t').textContent = 'Press Test input to see the level.';
  $('ae-test').textContent = 'Test input';
}
function onChunk(f, d) {
  const n = d[0].length;
  inp.chunks.push({ f, n, d });
  for (let ch = 0; ch < d.length; ch++) {
    let m = 0; const a = d[ch];
    for (let i = 0; i < n; i += 2) { const v = a[i] < 0 ? -a[i] : a[i]; if (v > m) m = v; }
    if (m > (inp.peaks[ch] || 0)) inp.peaks[ch] = m;
  }
  if (!S.rec && ctx) {
    const keep = Math.round(ctx.currentTime * ctx.sampleRate) - ctx.sampleRate * 1.5;
    while (inp.chunks.length > 1 && inp.chunks[0].f + inp.chunks[0].n < keep) inp.chunks.shift();
  }
}
async function openInput() {
  const st = inputSettings(), key = JSON.stringify(st);
  if (inp.stream && inp.key === key) return inp;
  closeInput();
  const c = await ensureRunning();
  let stream, own = true;
  if (testStream) { stream = testStream; own = false; }
  else {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This page cannot use the microphone here. Open it in a current Chrome, Edge or Firefox over a secure (https) address.');
    const want = st.multi ? probedCh : (st.mode === 'stereo' ? 2 : 1);
    const audio = { echoCancellation: st.ec, noiseSuppression: st.ns, autoGainControl: st.agc, channelCount: st.multi ? { ideal: want, min: want } : { ideal: want } };
    if (st.dev) audio.deviceId = { exact: st.dev };
    stream = await navigator.mediaDevices.getUserMedia({ audio });
  }
  const tr = stream.getAudioTracks()[0];
  if (!tr) throw new Error('That input has no audio.');
  let nch = st.mode === 'stereo' ? 2 : 1;
  if (st.multi) { const sc = (!testStream && tr.getSettings && tr.getSettings().channelCount) || probedCh; nch = Math.max(1, sc); }
  const src = c.createMediaStreamSource(stream);
  Object.assign(inp, { stream, own, src, nch, key, multi: st.multi && nch > 2, chunks: [], peaks: new Array(nch).fill(0) });
  const silent = c.createGain(); silent.gain.value = 0; silent.connect(c.destination); inp.sink = silent;
  let worklet = false;
  if (c.audioWorklet && window.AudioWorkletNode) {
    try {
      if (!c.__aeCap) {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        try { await c.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
        c.__aeCap = true;
      }
      const node = new AudioWorkletNode(c, 'ae-cap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: nch, channelCountMode: 'explicit', channelInterpretation: st.multi ? 'discrete' : 'speakers', processorOptions: { nch } });
      node.port.onmessage = (e) => {
        const m = e.data;
        if (m.flushed) { if (inp.flushWait) { inp.flushWait(); inp.flushWait = null; } return; }
        onChunk(m.f, m.d);
      };
      src.connect(node); node.connect(silent); inp.node = node; worklet = true;
    } catch (err) { worklet = false; }
  }
  if (!worklet) {
    const proc = c.createScriptProcessor(2048, nch, nch);
    proc.channelCount = nch; proc.channelCountMode = 'explicit'; proc.channelInterpretation = st.multi ? 'discrete' : 'speakers';
    proc.onaudioprocess = (e) => {
      const d = []; for (let ch = 0; ch < nch; ch++) d.push(new Float32Array(e.inputBuffer.getChannelData(ch)));
      onChunk(Math.round(e.playbackTime * c.sampleRate) - e.inputBuffer.length, d);
    };
    src.connect(proc); proc.connect(silent); inp.proc = proc;
  }
  const mon = c.createGain(); mon.gain.value = $('ae-mon').checked ? 1 : 0;
  src.connect(mon); mon.connect(c.destination); inp.mon = mon;
  buildMeter(nch);
  tr.addEventListener('ended', () => { if (inp.stream === stream) { if (S.rec) stopRecording(); closeInput(); fail('The input was disconnected.'); } });
  kick();
  return inp;
}
function buildMeter(n) {
  const m = $('ae-meter');
  m.innerHTML = '';
  for (let i = 0; i < Math.min(n, 32); i++) { const e = mk('i'); e.appendChild(mk('b')); m.appendChild(e); }
}
let peakHold = 0;
function updateMeter() {
  const bars = $('ae-meter').children;
  let mx = 0;
  for (let i = 0; i < bars.length; i++) {
    const v = inp.peaks[i] || 0; mx = Math.max(mx, v);
    const b = bars[i].firstChild, pct = clamp((dbOf(v) + 60) / 60, 0, 1) * 100;
    b.style.width = pct + '%';
    b.className = v >= 0.99 ? 'clip' : (v > 0.7 ? 'hot' : '');
    inp.peaks[i] = v * 0.86;
  }
  peakHold = Math.max(peakHold * 0.97, mx);
  $('ae-meter-t').textContent = 'Level ' + (peakHold > 0.0005 ? dbOf(peakHold).toFixed(1) + ' dB' : 'silent') + (peakHold >= 0.99 ? '. Too loud, lower the input gain.' : '') + (inp.nch > 1 && inp.multi ? ' (' + inp.nch + ' channels)' : '');
}
async function testInput() {
  fail('');
  if (inp.stream) { closeInput(); return; }
  try { await openInput(); $('ae-test').textContent = 'Stop test'; say('Listening to the input. Speak or play to see the level.'); }
  catch (e) { fail(friendlyErr(e)); closeInput(); }
}
async function refreshDevices(askPermission) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) { fail('This browser cannot list audio inputs.'); return; }
  try {
    if (askPermission) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    }
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    const sel = $('ae-dev'), cur = sel.value;
    sel.innerHTML = '';
    const o0 = mk('option', '', { value: '', text: 'Default input' }); sel.appendChild(o0);
    devs.forEach((d, i) => { if (d.deviceId && d.deviceId !== 'default') sel.appendChild(mk('option', '', { value: d.deviceId, text: d.label || 'Input ' + (i + 1) })); });
    if (Array.from(sel.options).some((o) => o.value === cur)) sel.value = cur;
    if (askPermission) await probeChannels();
  } catch (e) { fail(friendlyErr(e)); }
}
async function probeChannels() {
  probedCh = 0; $('ae-multi-row').hidden = true;
  const info = $('ae-chinfo');
  try {
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 32 } };
    if ($('ae-dev').value) audio.deviceId = { exact: $('ae-dev').value };
    const s = await navigator.mediaDevices.getUserMedia({ audio });
    const n = (s.getAudioTracks()[0].getSettings() || {}).channelCount || 0;
    s.getTracks().forEach((t) => t.stop());
    probedCh = n;
    info.textContent = n ? 'This input offers ' + n + (n === 1 ? ' channel.' : ' channels.') : '';
    if (n > 2) { $('ae-multi-row').hidden = false; }
  } catch (e) { info.textContent = ''; }
}
function beep(c, at, hi) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o.frequency.value = hi ? 1568 : 1046;
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.35, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
  o.connect(g); g.connect(c.destination); o.start(at); o.stop(at + 0.1);
}
async function startRecording() {
  if (S.rec) return;
  fail('');
  if (importing) return;
  if (P.playing) pausePlayback();
  let i;
  try { i = await openInput(); } catch (e) { fail(friendlyErr(e)); closeInput(); return; }
  const c = ctx, sr = c.sampleRate;
  if (c.state !== 'running') { fail('The browser blocked audio. Click on the page and try again.'); return; }
  const beats = +$('ae-count').value || 0;
  const startPos = S.playhead;
  const now = c.currentTime;
  for (let b = 0; b < beats; b++) beep(c, now + 0.05 + b, b === beats - 1);
  const c0 = now + 0.05 + beats;
  const lat = Math.max(0, (+$('ae-lat').value || 0) / 1000);
  lsSet('lat', $('ae-lat').value);
  S.rec = { startPos, c0, c0F: Math.round(c0 * sr), n: i.multi ? i.nch : 1, nch: i.nch, multi: i.multi, lat, liveEnd: startPos };
  P.origin = startPos;
  startPlayback(startPos, c0);
  rebuildHeads(); syncTransport();
  say(beats ? 'Count-in, then recording...' : 'Recording... Press Stop when you are done.');
  $('ae-test').disabled = true;
}
async function stopRecording() {
  const r = S.rec;
  if (!r) return;
  const c = ctx, sr = c.sampleRate;
  const stopFrame = Math.round(c.currentTime * sr);
  stopSources(); P.playing = false;
  if (inp.node) {
    await new Promise((res) => { inp.flushWait = res; try { inp.node.port.postMessage('flush'); } catch (e) { res(); } setTimeout(res, 400); });
  } else await new Promise((res) => setTimeout(res, 120));
  S.rec = null;
  $('ae-test').disabled = false;
  const chunks = inp.chunks.filter((k) => k.f + k.n > r.c0F - sr).sort((a, b) => a.f - b.f);
  inp.chunks = [];
  const keepInput = !!testStream || $('ae-test').textContent === 'Stop test';
  if (!keepInput) closeInput();
  if (!chunks.length || stopFrame <= r.c0F) { rebuildHeads(); syncTransport(); say('Nothing was recorded.'); S.playhead = r.startPos; requestDraw(); return; }
  const F0 = chunks[0].f, Fend = Math.min(stopFrame, chunks[chunks.length - 1].f + chunks[chunks.length - 1].n);
  const total = Fend - F0;
  if (total < 16) { rebuildHeads(); syncTransport(); say('Nothing was recorded.'); return; }
  const nch = r.nch, data = [];
  for (let ch = 0; ch < nch; ch++) data.push(new Float32Array(total));
  for (const k of chunks) for (let ch = 0; ch < nch; ch++) {
    const src = k.d[ch]; if (!src) continue;
    const at = k.f - F0, len = Math.min(k.n, total - at);
    if (len > 0 && at >= 0) data[ch].set(len === k.n ? src : src.subarray(0, len), at);
  }
  const tl0 = r.startPos + (F0 - r.c0F) / sr - r.lat;
  let start = Math.max(0, r.startPos - r.lat), off = start - tl0;
  if (off < 0) { start -= off; off = 0; }
  const made = [];
  const mkBuf = (arrs) => { const b = new AudioBuffer({ numberOfChannels: arrs.length, length: total, sampleRate: sr }); arrs.forEach((a, k) => b.copyToChannel(a, k)); return b; };
  pushHistory();
  const base = S.tracks.length;
  const mkTrack = (name, buf) => {
    const dur = buf.duration - off;
    const t = newTrack(name, null);
    if (dur > MIN_CLIP) t.clips.push(newClip(buf, start, off, dur));
    S.tracks.push(t); made.push(t);
  };
  if (r.multi) data.forEach((d, k) => mkTrack('Input ' + (k + 1), mkBuf([d])));
  else mkTrack('Recording ' + (base + 1), mkBuf(data));
  const first = made.find((t) => t.clips.length);
  if (first) { S.sel.track = first.id; S.sel.clip = first.clips[0].id; }
  S.playhead = r.startPos; P.origin = r.startPos;
  rebuildHeads(); afterEdit(false); syncTransport();
  const secs = first && first.clips.length ? first.clips[0].dur : 0;
  say('Added ' + made.length + (made.length === 1 ? ' track' : ' tracks') + ', ' + secs.toFixed(2) + ' s each.' + (r.lat ? ' Moved earlier by ' + Math.round(r.lat * 1000) + ' ms.' : ''));
}
async function toggleRecord() { if (S.rec) await stopRecording(); else await startRecording(); }

/* ------------------------------------------------------------------ export */
async function renderTracks(list, sr, honor) {
  const end = projectEnd();
  if (end <= 0) throw new Error('There is nothing to export yet. Add or record some audio first.');
  const len = Math.max(1, Math.ceil(end * sr));
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oc = new OAC(2, len, sr);
  const any = honor && S.tracks.some((t) => t.solo);
  buildGraph(oc, oc.destination, list, 0, 0, (tr) => (honor ? audible(tr, any) : true), null);
  return await oc.startRendering();
}
function peakOf(buf) {
  let m = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > m) m = v; } }
  return m;
}
function wavBytes(buf, bits, nCh, scale) {
  const len = buf.length, bps = bits / 8, block = nCh * bps, dataLen = len * block;
  const out = new Uint8Array(44 + dataLen), dv = new DataView(out.buffer);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nCh, true); dv.setUint32(24, buf.sampleRate, true);
  dv.setUint32(28, buf.sampleRate * block, true); dv.setUint16(32, block, true); dv.setUint16(34, bits, true);
  ws(36, 'data'); dv.setUint32(40, dataLen, true);
  const cs = []; for (let k = 0; k < nCh; k++) cs.push(buf.getChannelData(Math.min(k, buf.numberOfChannels - 1)));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let k = 0; k < nCh; k++) {
      let v = cs[k][i] * scale; v = v > 1 ? 1 : (v < -1 ? -1 : v);
      if (bits === 16) { dv.setInt16(o, Math.round(v < 0 ? v * 32768 : v * 32767), true); o += 2; }
      else { const n = Math.round(v < 0 ? v * 8388608 : v * 8388607); out[o] = n & 255; out[o + 1] = (n >> 8) & 255; out[o + 2] = (n >> 16) & 255; o += 3; }
    }
  }
  return out;
}
async function mp3Bytes(buf, kbps, nCh, scale) {
  const mb = await import(MB_URL);
  const enc = await import(MP3_URL);
  enc.registerMp3Encoder();
  const out = new mb.Output({ format: new mb.Mp3OutputFormat(), target: new mb.BufferTarget() });
  const source = new mb.AudioBufferSource({ codec: 'mp3', bitrate: kbps * 1000 });
  out.addAudioTrack(source);
  await out.start();
  const sr = buf.sampleRate, step = sr * 4;
  for (let a = 0; a < buf.length; a += step) {
    const n = Math.min(step, buf.length - a), ab = new AudioBuffer({ numberOfChannels: nCh, length: n, sampleRate: sr });
    for (let k = 0; k < nCh; k++) {
      const src = buf.getChannelData(Math.min(k, buf.numberOfChannels - 1)).subarray(a, a + n);
      if (scale === 1) ab.copyToChannel(src, k);
      else { const t = new Float32Array(n); for (let i = 0; i < n; i++) t[i] = src[i] * scale; ab.copyToChannel(t, k); }
    }
    await source.add(ab);
  }
  source.close();
  await out.finalize();
  return new Uint8Array(out.target.buffer);
}
function exportSettings() {
  const f = $('ae-fmt').value;
  return { kind: f === 'mp3' ? 'mp3' : 'wav', bits: f === 'wav24' ? 24 : 16, sr: +$('ae-sr').value || 44100, kbps: +$('ae-br').value || 192, limit: $('ae-limit').checked };
}
async function encodeBuffer(buf, es, nCh, scale) {
  if (es.kind === 'mp3') return { bytes: await mp3Bytes(buf, es.kbps, nCh, scale), ext: 'mp3', type: 'audio/mpeg' };
  return { bytes: wavBytes(buf, es.bits, nCh, scale), ext: 'wav', type: 'audio/wav' };
}
function saveBlob(blob, name) {
  lastExport = { name, size: blob.size, blob };
  if (noDownload) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
function prog(p) { const el = $('ae-prog'); el.hidden = p == null; if (p != null) el.value = p; }
function sizeText(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
let exporting = false;
async function runExport(kind) {
  if (exporting) return;
  if (S.rec) { fail('Stop recording before you export.'); return; }
  fail('');
  exporting = true;
  const btns = ['ae-exp-mix', 'ae-exp-trk', 'ae-exp-zip'].map($);
  btns.forEach((b) => { b.disabled = true; });
  const es = exportSettings();
  try {
    if (P.playing) pausePlayback();
    if (projectEnd() <= 0) throw new Error('There is nothing to export yet. Add or record some audio first.');
    const stamp = 'audio';
    if (kind === 'mix') {
      say('Rendering the mix...'); prog(10);
      if (!S.tracks.some((t) => t.clips.length && audible(t, S.tracks.some((x) => x.solo)))) throw new Error('Every track is muted. Unmute a track to export the mix.');
      const buf = await renderTracks(S.tracks, es.sr, true);
      const pk2 = peakOf(buf), scale = es.limit && pk2 > 0.999 ? 0.99 / pk2 : 1;
      say('Encoding...'); prog(55);
      const e = await encodeBuffer(buf, es, 2, scale);
      const blob = new Blob([e.bytes], { type: e.type });
      saveBlob(blob, stamp + '-mix.' + e.ext);
      $('ae-last').textContent = 'Saved ' + stamp + '-mix.' + e.ext + ', ' + fmtT(buf.duration, false) + ', ' + sizeText(blob.size) + (scale < 1 ? '. The mix was turned down ' + Math.abs(dbOf(scale)).toFixed(1) + ' dB to avoid clipping.' : (pk2 > 1 ? '. Warning: the mix clips.' : '.'));
    } else if (kind === 'track') {
      const tr = S.tracks.find((t) => t.id === S.sel.track) || (findClip(S.sel.clip) || {}).track;
      if (!tr || !tr.clips.length) throw new Error('Select a track first by clicking its name or a clip.');
      say('Rendering ' + tr.name + '...'); prog(10);
      const ch = trackChannels(tr), buf = await renderTracks([tr], es.sr, false);
      const pk2 = peakOf(buf), scale = es.limit && pk2 > 0.999 ? 0.99 / pk2 : 1;
      prog(55);
      const e = await encodeBuffer(buf, es, ch, scale);
      const name = safeName(tr.name) + '.' + e.ext;
      saveBlob(new Blob([e.bytes], { type: e.type }), name);
      $('ae-last').textContent = 'Saved ' + name + ', ' + sizeText(lastExport.size) + '.';
    } else {
      if (typeof fflate === 'undefined') throw new Error('The ZIP library did not load. Reload the page and try again.');
      const list = S.tracks.filter((t) => t.clips.length), files = {}, used = new Set();
      for (let i = 0; i < list.length; i++) {
        const tr = list[i];
        say('Rendering track ' + (i + 1) + ' of ' + list.length + ': ' + tr.name + '...'); prog(Math.round((i / list.length) * 90) + 5);
        const buf = await renderTracks([tr], es.sr, false), ch = trackChannels(tr);
        const pk2 = peakOf(buf), scale = es.limit && pk2 > 0.999 ? 0.99 / pk2 : 1;
        const e = await encodeBuffer(buf, es, ch, scale);
        let n = String(i + 1).padStart(2, '0') + ' ' + safeName(tr.name);
        while (used.has(n.toLowerCase())) n += '_';
        used.add(n.toLowerCase());
        files[n + '.' + e.ext] = e.bytes;
      }
      say('Packing the ZIP...'); prog(97);
      const zip = fflate.zipSync(files, { level: 0 });
      const blob = new Blob([zip], { type: 'application/zip' });
      saveBlob(blob, stamp + '-tracks.zip');
      $('ae-last').textContent = 'Saved ' + stamp + '-tracks.zip with ' + list.length + (list.length === 1 ? ' file' : ' files') + ', ' + sizeText(blob.size) + '.';
    }
    say('Done.');
  } catch (e) { fail(e && e.message ? e.message : 'The export failed.'); say(''); }
  finally { exporting = false; btns.forEach((b) => { b.disabled = false; }); prog(null); }
}
function trackChannels(tr) {
  return tr.pan === 0 && tr.clips.every((c) => c.buf.numberOfChannels === 1) ? 1 : 2;
}

/* ------------------------------------------------------------------ wiring */
$('ae-play').addEventListener('click', togglePlay);
$('ae-stop').addEventListener('click', stopAll);
$('ae-home').addEventListener('click', () => { S.playhead = 0; if (scroller) scroller.scrollLeft = 0; seek(0, true); });
$('ae-loop').addEventListener('click', () => { S.loop = !S.loop; syncTransport(); });
$('ae-follow').addEventListener('change', (e) => { S.follow = e.target.checked; });
$('ae-zin').addEventListener('click', () => setZoom(S.pps * 1.6));
$('ae-zout').addEventListener('click', () => setZoom(S.pps / 1.6));
$('ae-fit').addEventListener('click', fitZoom);
$('ae-undo').addEventListener('click', undo);
$('ae-redo').addEventListener('click', redo);
$('ae-clear').addEventListener('click', () => {
  if (S.rec) return;
  if (!S.tracks.length) return;
  if (!window.confirm('Remove all tracks? You can still press Undo afterwards.')) return;
  pushHistory(); pausePlayback(); S.tracks = []; S.sel = { track: null, clip: null }; S.playhead = 0;
  rebuildHeads(); afterEdit(false);
});
$('ae-split').addEventListener('click', splitAtPlayhead);
$('ae-dup').addEventListener('click', duplicateClip);
$('ae-del').addEventListener('click', deleteClip);
$('ae-rev').addEventListener('click', reverseClip);
$('ae-norm').addEventListener('click', normalizeClip);
$('ae-gain').addEventListener('input', (e) => {
  const c = selClip(); if (!c) return;
  const v = parseFloat(e.target.value); if (!isFinite(v)) return;
  editOnce('g' + c.id); c.gain = Math.pow(10, clamp(v, -60, 24) / 20); requestDraw(); if (P.playing && !S.rec) reschedule();
});
$('ae-gain').addEventListener('change', () => { const c = selClip(); if (c) gate.delete('g' + c.id); });
$('ae-fin').addEventListener('input', (e) => {
  const c = selClip(); if (!c) return;
  const v = parseFloat(e.target.value); if (!isFinite(v)) return;
  editOnce('fi' + c.id); c.fadeIn = Math.max(0, v); fixFades(c); requestDraw(); if (P.playing && !S.rec) reschedule();
});
$('ae-fin').addEventListener('change', () => { const c = selClip(); if (c) { gate.delete('fi' + c.id); syncClipBar(); } });
$('ae-fout').addEventListener('input', (e) => {
  const c = selClip(); if (!c) return;
  const v = parseFloat(e.target.value); if (!isFinite(v)) return;
  editOnce('fo' + c.id); c.fadeOut = Math.max(0, v); fixFades(c); requestDraw(); if (P.playing && !S.rec) reschedule();
});
$('ae-fout').addEventListener('change', () => { const c = selClip(); if (c) { gate.delete('fo' + c.id); syncClipBar(); } });

$('ae-rec').addEventListener('click', toggleRecord);
$('ae-rec2').addEventListener('click', toggleRecord);
$('ae-test').addEventListener('click', testInput);
$('ae-find').addEventListener('click', () => refreshDevices(true));
$('ae-dev').addEventListener('change', async () => { closeInput(); if (probedCh) await probeChannels(); });
for (const id of ['ae-mode', 'ae-ec', 'ae-ns', 'ae-agc', 'ae-multi']) $(id).addEventListener('change', () => { if (inp.stream && !S.rec) { closeInput(); } });
$('ae-mon').addEventListener('change', (e) => { if (inp.mon) inp.mon.gain.value = e.target.checked ? 1 : 0; });
$('ae-lat').addEventListener('change', () => lsSet('lat', $('ae-lat').value));
$('ae-lat-est').addEventListener('click', () => {
  try {
    const c = getCtx(), ms = Math.round(((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000);
    $('ae-lat').value = String(ms); lsSet('lat', ms);
    say('Set to ' + ms + ' ms. This is the browser\'s estimate of the output delay. Your microphone adds more, so check by ear.');
  } catch (e) { fail(e.message); }
});
$('ae-fmt').addEventListener('change', () => { $('ae-br-row').hidden = $('ae-fmt').value !== 'mp3'; });
$('ae-exp-mix').addEventListener('click', () => runExport('mix'));
$('ae-exp-trk').addEventListener('click', () => runExport('track'));
$('ae-exp-zip').addEventListener('click', () => runExport('zip'));

// Let go of keyboard focus after a mouse click so Space keeps meaning play.
$('ae-tool').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && e.detail > 0 && !b.classList.contains('ms')) b.blur(); });

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (t && t.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
  if (!$('ae-tool').offsetParent) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
  if (mod || e.altKey) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (e.key === 's' || e.key === 'S') { e.preventDefault(); splitAtPlayhead(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { if (selClip()) { e.preventDefault(); deleteClip(); } }
  else if (e.key === 'Home') { e.preventDefault(); S.playhead = 0; scroller.scrollLeft = 0; seek(0, true); }
  else if (e.key === 'l' || e.key === 'L') { S.loop = !S.loop; syncTransport(); }
  else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); toggleRecord(); }
});

window.addEventListener('pagehide', () => {
  stopSources(); closeInput();
  if (ctx && ctx.state !== 'closed') { try { ctx.close(); } catch (e) { /* ok */ } }
});

// start values
$('ae-lat').value = lsGet('lat', '0');
rebuildHeads(); layout(); syncTransport(); updateTime();
if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) refreshDevices(false);

/* Small hook so tests can inject a MediaStream and inspect the result. Not used by the page itself. */
window.__audioEditorTest = {
  injectStream(s) { testStream = s; closeInput(); },
  context() { return getCtx(); },
  noDownload(v) { noDownload = !!v; },
  setProbedChannels(n) { probedCh = n; $('ae-multi-row').hidden = !(n > 2); },
  lastExport() { return lastExport; },
  state() { return { tracks: S.tracks.map((t) => ({ id: t.id, name: t.name, vol: t.vol, pan: t.pan, mute: t.mute, solo: t.solo, clips: t.clips.map((c) => ({ id: c.id, start: c.start, off: c.off, dur: c.dur, gain: c.gain, fadeIn: c.fadeIn, fadeOut: c.fadeOut, ch: c.buf.numberOfChannels, sr: c.buf.sampleRate })) })), playhead: P.playing ? posNow() : S.playhead, playing: P.playing, pps: S.pps, sel: S.sel, rec: !!S.rec, end: projectEnd() }; },
  async renderMix(sr) { return renderTracks(S.tracks, sr || 44100, true); }
};
