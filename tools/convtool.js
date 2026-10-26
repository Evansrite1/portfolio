/* Video converter: video to anything and anything to video. Everything runs in the browser with mediabunny. */
import {
  Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, CanvasSource, AudioBufferSource, AudioBufferSink, CanvasSink,
  Mp4OutputFormat, MovOutputFormat, MkvOutputFormat, WebMOutputFormat, Mp3OutputFormat, WavOutputFormat, OggOutputFormat,
  canEncodeVideo, canEncodeAudio, QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_LOW
} from '/tools/vendor/mediabunny/mediabunny.min.mjs';
import {
  $, show, supported, NO_SUPPORT, fmtSize, fmtTime, setStatus, wireDrop, probe, errText, isCancel, downloadRow, progressUI
} from '/tools/vmcommon.js';
import {
  guessKind, kindFromInfo, TARGETS, outputsFor, defaultTarget, VIDEO_PRESETS, COVER_SIZES, COVER_PRESETS, BITRATES, BITRATE_WORDS,
  GIF_WIDTHS, GIF_FPS, GIF_MAX_SECONDS, resOptions, presetRes, scaledSize, fitWidth, readRange, isTrimmed, outName, barHeights, wrapText
} from '/tools/convcore.js';
import { GifWriter } from '/tools/gifenc.js';

const CONTAINERS = {
  mp4: () => new Mp4OutputFormat(), webm: () => new WebMOutputFormat(), mov: () => new MovOutputFormat(), mkv: () => new MkvOutputFormat(),
  mp3: () => new Mp3OutputFormat(), wav: () => new WavOutputFormat(), m4a: () => new Mp4OutputFormat(), ogg: () => new OggOutputFormat()
};
const CODEC_NAMES = { avc: 'H.264 (works everywhere)', vp9: 'VP9 (good for the web)', av1: 'AV1 (smallest, slow)' };
const codecShort = (c) => CODEC_NAMES[c].split(' (')[0];
const QUALITY = { high: QUALITY_HIGH, balanced: QUALITY_MEDIUM, small: QUALITY_LOW };
const Q_HELP = {
  high: 'High keeps the most detail. The file is larger.',
  balanced: 'Balanced is a good choice for most videos.',
  small: 'Small makes the smallest file with some loss of detail.',
  copy: 'Fast copy does not re-encode the video. It is quick and keeps the quality, but it ignores the resolution and codec choices and only works when the new format supports the video inside.'
};
const ICONS = {
  video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-3v10l-6-3z"/>',
  audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  gif: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'
};
/* Bitrates for a video made from audio. The picture is simple, so it needs far less than normal video. */
const COVER_BITRATE = { high: [1000000, 2500000], balanced: [600000, 1500000], small: [300000, 800000] };
const GROUP_NAMES = { video: 'Video', cover: 'Video from your audio', gif: 'Animated picture', audio: 'Audio only' };

const st = {
  file: null, url: null, kind: null, info: null, gif: null, targets: [], target: null,
  preset: 'whatsapp', q: 'balanced', kbps: {}, canEnc: {},
  cpreset: 'youtube', size: 'landscape', bg: 'color', img: null,
  conv: null, output: null, cancel: false, running: false, outUrl: null
};
const prog = progressUI('cv');
const say = (msg, bad) => setStatus('cv-status', msg, bad);
const tick = () => new Promise((r) => setTimeout(r, 0));
let mp3Ready = null;

/* What this browser can encode. Checked once. */
const capsReady = (async () => {
  const caps = { video: {}, aac: false, opus: false, gifDecode: false };
  if (!supported) return caps;
  for (const c of ['avc', 'vp9', 'av1']) {
    try { caps.video[c] = await canEncodeVideo(c, { width: 1280, height: 720 }); } catch (e) { caps.video[c] = false; }
  }
  try { caps.aac = await canEncodeAudio('aac'); } catch (e) { caps.aac = false; }
  try { caps.opus = await canEncodeAudio('opus'); } catch (e) { caps.opus = false; }
  try { caps.gifDecode = typeof ImageDecoder !== 'undefined' && await ImageDecoder.isTypeSupported('image/gif'); } catch (e) { caps.gifDecode = false; }
  return caps;
})();
if (!supported) say(NO_SUPPORT, true);

function ensureMp3Encoder() {
  if (!mp3Ready) mp3Ready = import('/tools/vendor/mediabunny/mp3-encoder.min.mjs').then((m) => m.registerMp3Encoder());
  return mp3Ready;
}

function optButton(attrs, title, sub, pressed) {
  const b = document.createElement('button');
  b.type = 'button';
  Object.entries(attrs).forEach(([k, v]) => { b.dataset[k] = v; });
  b.setAttribute('aria-pressed', String(!!pressed));
  const bt = document.createElement('b'), sm = document.createElement('small');
  bt.textContent = title; sm.textContent = sub;
  b.appendChild(bt); b.appendChild(sm);
  return b;
}
function pressIn(boxId, key, value) {
  document.querySelectorAll('#' + boxId + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[key] === String(value))));
}
function fillSelect(id, items, value) {
  const sel = $(id);
  sel.innerHTML = '';
  items.forEach((it) => { const o = document.createElement('option'); o.value = String(it.value); o.textContent = it.label; sel.appendChild(o); });
  if (value !== undefined && items.some((it) => String(it.value) === String(value))) sel.value = String(value);
}

/* ---------------------------------------------------------------- loading a file */

async function readGif(file) {
  const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' });
  try {
    await dec.tracks.ready;
    await dec.completed;
    const frames = dec.tracks.selectedTrack ? dec.tracks.selectedTrack.frameCount : 0;
    const first = await dec.decode({ frameIndex: 0 });
    const out = { frames, width: first.image.displayWidth, height: first.image.displayHeight };
    first.image.close();
    return out;
  } finally { dec.close(); }
}

async function loadFile(file) {
  if (!file || st.running) return;
  if (!supported) { say(NO_SUPPORT, true); return; }
  const caps = await capsReady;
  const guess = guessKind(file.name, file.type);
  if (guess === 'image') { say('This is a still picture. To change a picture format, use the free image converter.', true); return; }
  say('Reading your file...');
  let kind = null, info = null, gif = null;
  if (guess === 'gif') {
    if (!caps.gifDecode) { say('Your browser cannot read GIF frames. Please use Chrome or Edge on a computer.', true); return; }
    try { gif = await readGif(file); kind = 'gif'; } catch (e) { say('That GIF could not be read. Try another file.', true); return; }
  } else {
    try { info = await probe(file); kind = kindFromInfo(info); } catch (e) { kind = null; }
    if (!kind) { say('That file could not be read. Try an MP4, MOV, MKV or WebM video, or an MP3, WAV, M4A, OGG or FLAC audio file.', true); return; }
  }
  clearOutput();
  if (st.url) URL.revokeObjectURL(st.url);
  Object.assign(st, { file, kind, info, gif, url: URL.createObjectURL(file) });

  /* Check the video codecs again at this file's real size. */
  st.canEnc = Object.assign({}, caps.video);
  if (kind === 'video') {
    for (const c of ['avc', 'vp9', 'av1']) {
      try { st.canEnc[c] = await canEncodeVideo(c, { width: info.width, height: info.height }); } catch (e) { st.canEnc[c] = false; }
    }
  }
  st.targets = outputsFor(kind, info, Object.assign({}, caps, { video: st.canEnc }));
  if (!st.targets.length) { say(kind === 'gif' ? 'Your browser cannot make a video from this GIF. Please use Chrome or Edge on a computer.' : NO_SUPPORT, true); return; }

  $('cv-name').textContent = file.name;
  $('cv-ico').innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[kind] + '</svg>';
  let meta;
  if (kind === 'gif') meta = [fmtSize(file.size), 'GIF', gif.width + 'x' + gif.height, gif.frames + ' frames'];
  else if (kind === 'video') meta = [fmtSize(file.size), info.width + 'x' + info.height, fmtTime(info.duration), info.fps ? info.fps + ' fps' : null, info.hasAudio ? null : 'no sound'];
  else meta = [fmtSize(file.size), 'audio', fmtTime(info.duration), info.sampleRate ? Math.round(info.sampleRate / 100) / 10 + ' kHz' : null];
  $('cv-meta').textContent = meta.filter(Boolean).join(' · ');

  if (kind === 'video') fillSelect('cv-res', resOptions(info.width, info.height), 0);
  $('cv-start').value = ''; $('cv-end').value = '';
  $('cv-end').placeholder = info ? fmtTime(info.duration, true) : '';
  $('cv-title').value = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  $('cv-trim').open = false;

  $('cv-video').removeAttribute('src'); $('cv-audio').removeAttribute('src'); $('cv-gimg').removeAttribute('src');
  if (kind === 'video') $('cv-video').src = st.url;
  if (kind === 'audio') $('cv-audio').src = st.url;
  if (kind === 'gif') $('cv-gimg').src = st.url;

  renderTargets();
  show('cv-drop', false); show('cv-controls', true); show('cv-empty', false); show('cv-result', false);
  say('');
  setTarget(defaultTarget(kind, file.name, st.targets));
}

function renderTargets() {
  const box = $('cv-targets');
  box.innerHTML = '';
  const groups = [];
  st.targets.forEach((id) => {
    const g = TARGETS[id].group;
    let grp = groups.find((x) => x.g === g);
    if (!grp) { grp = { g, ids: [] }; groups.push(grp); }
    grp.ids.push(id);
  });
  groups.forEach(({ g, ids }) => {
    const p = document.createElement('p'); p.className = 'cv-grp'; p.textContent = GROUP_NAMES[g];
    const grid = document.createElement('div'); grid.className = 'mt-opts cv-auto';
    ids.forEach((id) => {
      const T = TARGETS[id];
      const b = optButton({ t: id }, T.label, T.sub, false);
      b.addEventListener('click', () => setTarget(id));
      grid.appendChild(b);
    });
    box.appendChild(p); box.appendChild(grid);
  });
}

/* ---------------------------------------------------------------- choosing an output */

function setTarget(id) {
  if (!id || st.running) return;
  st.target = id;
  pressIn('cv-targets', 't', id);
  const T = TARGETS[id];
  const vid = T.group === 'video';
  show('cv-p-video', vid && st.kind === 'video');
  show('cv-p-gifin', vid && st.kind === 'gif');
  show('cv-p-audio', T.group === 'audio' && !!BITRATES[id]);
  show('cv-p-cover', T.group === 'cover');
  show('cv-p-gif', T.group === 'gif');
  show('cv-trim', st.kind !== 'gif');
  show('cv-stage', st.kind === 'video');
  show('cv-astage', st.kind === 'audio');
  show('cv-gstage', st.kind === 'gif');
  show('cv-cstage', T.group === 'cover');
  if (T.group === 'cover') { show('cv-astage', true); setCoverPreset(st.cpreset); }
  if (T.group === 'audio') renderBitrates(id);
  if (T.group === 'gif') setupGif();
  if (vid && st.kind === 'video') {
    if (st.preset !== 'custom' && id !== VIDEO_PRESETS[st.preset].fmt) st.preset = 'custom';
    renderPresets();
  }
  $('cv-go').textContent = T.group === 'cover' ? 'Make the video' : 'Convert to ' + T.label;
  refresh();
}

function renderPresets() {
  const box = $('cv-preset');
  if (!box.children.length) {
    Object.entries(VIDEO_PRESETS).forEach(([k, p]) => {
      const b = optButton({ p: k }, p.label, p.sub, false);
      b.addEventListener('click', () => applyPreset(k));
      box.appendChild(b);
    });
    const c = optButton({ p: 'custom' }, 'Custom', 'my own settings', false);
    c.addEventListener('click', () => { st.preset = 'custom'; pressIn('cv-preset', 'p', 'custom'); $('cv-more').open = true; });
    box.appendChild(c);
  }
  if (st.preset !== 'custom') applyPreset(st.preset); else pressIn('cv-preset', 'p', 'custom');
}

function applyPreset(k) {
  const p = VIDEO_PRESETS[k];
  st.preset = k;
  pressIn('cv-preset', 'p', k);
  if (st.target !== p.fmt) { setTarget(p.fmt); return; }
  st.q = p.q; pressIn('cv-q', 'q', p.q);
  $('cv-res').value = String(presetRes(p, st.info.width, st.info.height));
  refresh();
  if ([...$('cv-codec').options].some((o) => o.value === p.codec)) $('cv-codec').value = p.codec;
}

function refresh() {
  const T = TARGETS[st.target];
  $('cv-go').disabled = false;
  if (T.group === 'video' && st.kind === 'video') {
    const codecSel = $('cv-codec');
    const prev = codecSel.value;
    fillSelect('cv-codec', T.codecs.filter((c) => st.canEnc[c]).map((c) => ({ value: c, label: CODEC_NAMES[c] })), prev);
    const none = codecSel.options.length === 0;
    if (none && st.q !== 'copy') {
      say('Your browser cannot encode video for ' + T.label + '. Try Fast copy, another format, or Chrome or Edge on a computer.', true);
      $('cv-go').disabled = true;
    } else say('');
    pressIn('cv-q', 'q', st.q);
    const copy = st.q === 'copy';
    codecSel.disabled = copy; $('cv-res').disabled = copy;
    $('cv-q-help').textContent = Q_HELP[st.q];
  } else say('');
}

function renderBitrates(id) {
  const B = BITRATES[id];
  if (!B) return;
  if (!st.kbps[id]) st.kbps[id] = B.def;
  const box = $('cv-br');
  box.innerHTML = '';
  B.list.forEach((k, i) => {
    const b = optButton({ kbps: k }, String(k), 'kbps, ' + BITRATE_WORDS[i], k === st.kbps[id]);
    b.addEventListener('click', () => { st.kbps[id] = k; pressIn('cv-br', 'kbps', k); });
    box.appendChild(b);
  });
}

function setupGif() {
  const w = st.info.width;
  const widths = GIF_WIDTHS.filter((x) => x < w).map((x) => ({ value: x, label: x + ' px' }));
  widths.push({ value: Math.min(w, 800), label: (w <= 800 ? 'Original, ' : '') + Math.min(w, 800) + ' px' });
  const prevW = $('cv-gw').value;
  const wantW = widths.some((x) => String(x.value) === prevW) ? prevW : (widths.some((x) => x.value === 480) ? 480 : widths[widths.length - 1].value);
  fillSelect('cv-gw', widths, wantW);
  fillSelect('cv-gfps', GIF_FPS.map((f) => ({ value: f, label: f + ' fps' + (f === 10 ? ' (smaller)' : ' (smoother)') })), $('cv-gfps').value || 10);
  /* A long video needs a short part for a GIF. */
  if (st.info.duration > GIF_MAX_SECONDS && !$('cv-start').value && !$('cv-end').value) {
    $('cv-start').value = '0:00.0';
    $('cv-end').value = fmtTime(Math.min(10, st.info.duration), true);
    $('cv-trim').open = true;
  }
}

/* ---------------------------------------------------------------- audio to video: the picture */

function setCoverPreset(k) {
  st.cpreset = k;
  const box = $('cv-cpreset');
  if (!box.children.length) {
    Object.entries(COVER_PRESETS).forEach(([id, p]) => {
      const b = optButton({ p: id }, p.label, p.sub, false);
      b.addEventListener('click', () => setCoverPreset(id));
      box.appendChild(b);
    });
    Object.entries(COVER_SIZES).forEach(([id, s]) => {
      const b = optButton({ s: id }, s.label, s.sub, false);
      b.addEventListener('click', () => { st.size = id; pressIn('cv-size', 's', id); st.cpreset = null; pressIn('cv-cpreset', 'p', ''); drawPreview(); });
      $('cv-size').appendChild(b);
    });
  }
  if (k) { st.size = COVER_PRESETS[k].size; st.q = COVER_PRESETS[k].q; }
  pressIn('cv-cpreset', 'p', k || '');
  pressIn('cv-size', 's', st.size);
  drawPreview();
}

function fitRect(sw, sh, W, H, mode) {
  const k = mode === 'contain' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh);
  const w = sw * k, h = sh * k;
  return [(W - w) / 2, (H - h) / 2, w, h];
}

/* Draws everything that does not move: background, picture and title. */
function drawBackground(ctx, W, H) {
  const m = Math.min(W, H);
  ctx.fillStyle = $('cv-color').value;
  ctx.fillRect(0, 0, W, H);
  const useImg = st.bg === 'image' && st.img;
  if (useImg) ctx.drawImage(st.img, ...fitRect(st.img.width, st.img.height, W, H, $('cv-fit').value));
  const title = $('cv-title').value.trim();
  const wave = $('cv-wave').checked;
  if (useImg && (title || wave)) {
    const g = ctx.createLinearGradient(0, H * 0.58, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.58, W, H * 0.42);
  }
  if (!title) return;
  const size = Math.round(m * (useImg ? 0.06 : 0.08));
  ctx.font = '700 ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = $('cv-tcolor').value;
  const lines = wrapText(title, W * 0.84, (t) => ctx.measureText(t).width, 3);
  const lh = size * 1.22;
  const centre = useImg ? H * (wave ? 0.76 : 0.86) : H * (wave ? 0.4 : 0.5);
  const top = centre - (lh * (lines.length - 1)) / 2;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh));
}

const BARS = 40;
function drawBars(ctx, W, H, heights) {
  const m = Math.min(W, H);
  const useImg = st.bg === 'image' && st.img;
  const area = W * 0.8, gap = area / BARS, bw = gap * 0.62;
  const cy = useImg ? H * 0.9 : H * 0.7, maxH = m * (useImg ? 0.1 : 0.16);
  ctx.fillStyle = $('cv-tcolor').value;
  const x0 = (W - area) / 2 + (gap - bw) / 2;
  for (let i = 0; i < BARS; i++) {
    const h = Math.max(bw * 0.6, heights[i] * maxH);
    ctx.fillRect(x0 + i * gap, cy - h / 2, bw, h);
  }
}

function drawPreview() {
  if (!st.target || TARGETS[st.target].group !== 'cover') return;
  const S = COVER_SIZES[st.size], c = $('cv-canvas');
  c.width = S.w; c.height = S.h;
  show('cv-imgbox', st.bg === 'image');
  const ctx = c.getContext('2d');
  drawBackground(ctx, S.w, S.h);
  if ($('cv-wave').checked) {
    const demo = Array.from({ length: 24 }, (_, i) => 0.35 + 0.3 * Math.sin(i * 0.9) * Math.sin(i * 0.37));
    drawBars(ctx, S.w, S.h, barHeights(demo, BARS));
  }
}

/* ---------------------------------------------------------------- running */

function trimRange() {
  if (!st.info) return null;
  return readRange($('cv-start').value, $('cv-end').value, st.info.duration);
}

async function run() {
  if (!st.file || st.running) return;
  const T = TARGETS[st.target];
  let range = null;
  if (st.kind !== 'gif') {
    try { range = trimRange(); } catch (e) { say(errText(e), true); $('cv-trim').open = true; return; }
    if (T.group === 'gif' && range[1] - range[0] > GIF_MAX_SECONDS + 0.05) {
      say('A GIF can be up to ' + GIF_MAX_SECONDS + ' seconds long. Open Trim and pick a shorter part.', true);
      $('cv-trim').open = true; return;
    }
  }
  if (T.group === 'cover' && st.bg === 'image' && !st.img) { say('Choose a picture first, or pick Plain colour.', true); return; }
  clearOutput();
  say('');
  st.running = true; st.cancel = false;
  show('cv-controls', false); show('cv-result', false);
  const verb = T.group === 'cover' ? 'Making your video' : 'Converting';
  prog.start(verb);
  const onP = (p) => prog.update(p, verb);
  try {
    let res;
    if (st.kind === 'gif') res = await gifToVideo(onP);
    else if (T.group === 'cover') res = await audioToVideo(range, onP);
    else if (T.group === 'gif') res = await videoToGif(range, onP);
    else res = await convert(range, onP);
    showResult(res.blob, res.note, range);
  } catch (e) {
    prog.stop(); show('cv-controls', true);
    if (isCancel(e) || st.cancel) say('Stopped.');
    else say('Something went wrong: ' + errText(e), true);
  } finally {
    st.conv = null; st.output = null; st.running = false;
  }
}

/* Video to video, video to audio and audio to audio, with mediabunny's Conversion. */
async function convert(range, onP) {
  const T = TARGETS[st.target], info = st.info, id = st.target;
  if (T.group === 'audio' && !info.hasAudio) throw new Error('This file has no sound, so there is no audio to save.');
  const input = new Input({ source: new BlobSource(st.file), formats: ALL_FORMATS });
  try {
    const target = new BufferTarget();
    const output = new Output({ format: CONTAINERS[id](), target });
    const opts = { input, output, showWarnings: false };
    if (range && isTrimmed(range[0], range[1], info.duration)) opts.trim = { start: range[0], end: range[1] };
    let note;
    if (T.group === 'audio') {
      opts.video = { discard: true };
      const a = { codec: T.codec, forceTranscode: true };
      if (BITRATES[id]) a.bitrate = st.kbps[id] * 1000;
      if (id === 'mp3') {
        await ensureMp3Encoder();
        if (![32000, 44100, 48000].includes(info.sampleRate)) a.sampleRate = 44100;
      } else if (id === 'm4a') {
        if (![44100, 48000].includes(info.sampleRate)) a.sampleRate = 48000;
      } else if (id === 'ogg') {
        if (info.sampleRate !== 48000) a.sampleRate = 48000;
      }
      if (info.channels > 2) a.numberOfChannels = 2;
      opts.audio = a;
      note = id === 'wav' ? 'Sound saved as uncompressed WAV.' : 'Sound saved as ' + T.label + ' at ' + st.kbps[id] + ' kbps.';
    } else if (st.q === 'copy') {
      opts.copy = { mode: 'preferred' };
      note = 'Fast copy: the video was moved into ' + T.label + ' without re-encoding where the codec fits.';
    } else {
      const codec = $('cv-codec').value;
      const resV = +$('cv-res').value;
      const size = scaledSize(info.width, info.height, resV);
      if (!(await canEncodeVideo(codec, size))) throw new Error('Your browser cannot encode ' + codecShort(codec) + ' video at ' + size.width + 'x' + size.height + '. Pick another codec or a smaller resolution.');
      const video = { codec, quality: QUALITY[st.q], forceTranscode: true };
      if (resV) { video.width = size.width; video.height = size.height; video.fit = 'contain'; }
      opts.video = video;
      const pre = st.preset !== 'custom' ? VIDEO_PRESETS[st.preset].label + ' settings: ' : '';
      note = pre + T.label + ', ' + codecShort(codec) + ', ' + st.q + ' quality, ' + size.width + 'x' + size.height + '.';
    }
    const conv = await Conversion.init(opts);
    if (!conv.isValid) throw new Error('This file cannot be converted to ' + T.label + ' in your browser.');
    const lost = conv.discardedTracks.filter((d) => d.reason !== 'discarded_by_user' && (d.track.isVideoTrack() || d.track.isAudioTrack()));
    if (lost.length && T.group === 'video') note += ' Note: ' + lost.length + ' track(s) could not be kept.';
    st.conv = conv;
    conv.onProgress = onP;
    await conv.execute();
    return { blob: new Blob([target.buffer], { type: T.mime }), note };
  } finally { if (input.dispose) input.dispose(); }
}

/* Cuts an audio buffer to the part inside [s, e]. Returns null when nothing is inside. */
function sliceBuffer(buf, ts, s, e) {
  const a = Math.max(ts, s), b = Math.min(ts + buf.duration, e);
  if (b - a <= 0) return null;
  if (a - ts < 1e-6 && ts + buf.duration - b < 1e-6) return buf;
  const sr = buf.sampleRate, off = Math.round((a - ts) * sr);
  const len = Math.min(buf.length - off, Math.round((b - a) * sr));
  if (len <= 0) return null;
  const out = new AudioBuffer({ length: len, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(off, off + len), c);
  return out;
}

/* Sound plus a picture (and optional moving bars) into an MP4. */
async function audioToVideo(range, onP) {
  const caps = await capsReady;
  const S = COVER_SIZES[st.size], W = S.w, H = S.h;
  if (!(await canEncodeVideo('avc', { width: W, height: H }))) throw new Error('Your browser cannot encode H.264 video at ' + W + 'x' + H + '. Try another size, or Chrome or Edge on a computer.');
  const wave = $('cv-wave').checked;
  const fps = wave ? 30 : 2;
  const [s, e] = range, dur = e - s;
  const input = new Input({ source: new BlobSource(st.file), formats: ALL_FORMATS });
  try {
    const at = await input.getPrimaryAudioTrack();
    if (!at || !(await at.canDecode())) throw new Error('Your browser cannot read the sound in this file.');
    const acodec = caps.aac ? 'aac' : 'opus';
    const abr = st.q === 'small' ? 128000 : 192000;
    const sr = at.sampleRate, chn = at.numberOfChannels;
    let direct = chn <= 2;
    try { direct = direct && await canEncodeAudio(acodec, { sampleRate: sr, numberOfChannels: chn, bitrate: abr }); } catch (x) { direct = false; }

    const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
    drawBackground(bg.getContext('2d'), W, H);
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bg, 0, 0);

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    st.output = output;
    const vsrc = new CanvasSource(canvas, { codec: 'avc', bitrate: (COVER_BITRATE[st.q] || COVER_BITRATE.balanced)[wave ? 1 : 0] });
    output.addVideoTrack(vsrc, { frameRate: fps });
    const asrc = new AudioBufferSource({ codec: acodec, bitrate: abr });
    output.addAudioTrack(asrc);
    const title = $('cv-title').value.trim();
    if (title) output.setMetadataTags({ title });
    await output.start();

    const N = Math.max(1, Math.ceil(dur * fps));
    const sum = wave ? new Float64Array(N) : null, cnt = wave ? new Uint32Array(N) : null;
    const hist = [];
    let frame = 0;
    const addFramesUntil = async (t) => {
      while (frame < N && (frame + 1) / fps <= t + 1e-9) {
        if (st.cancel) throw new Error('cancelled');
        if (wave) {
          const rms = cnt[frame] ? Math.sqrt(sum[frame] / cnt[frame]) : 0;
          const db = rms > 0 ? 20 * Math.log10(rms) : -100;
          hist.push(Math.min(1, Math.max(0, (db + 48) / 44)));
          if (hist.length > BARS) hist.shift();
          ctx.drawImage(bg, 0, 0);
          drawBars(ctx, W, H, barHeights(hist, BARS));
        }
        await vsrc.add(frame / fps, 1 / fps);
        frame++;
      }
    };
    let done = 0, base = 0;
    const feed = async (buf) => {
      if (wave) {
        const r = buf.sampleRate, a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
        for (let i = 0; i < buf.length; i += 4) {
          const f = Math.floor((done + i / r) * fps);
          if (f >= N) break;
          const v = (a[i] + b[i]) / 2;
          sum[f] += v * v; cnt[f]++;
        }
      }
      await asrc.add(buf);
      done += buf.duration;
      await addFramesUntil(done);
      onP(Math.min(0.99, base + (1 - base) * done / dur));
      if (st.cancel) throw new Error('cancelled');
    };

    if (direct) {
      const sink = new AudioBufferSink(at);
      for await (const wb of sink.buffers(s, e)) {
        const buf = sliceBuffer(wb.buffer, wb.timestamp, s, e);
        if (buf) await feed(buf);
      }
    } else {
      /* Change the sample rate or channels first so the encoder accepts the sound. */
      const outCh = Math.min(2, chn), rate = 48000;
      const off = new OfflineAudioContext(outCh, Math.max(1, Math.ceil(dur * rate)), rate);
      const sink = new AudioBufferSink(at);
      for await (const wb of sink.buffers(s, e)) {
        if (st.cancel) throw new Error('cancelled');
        const a = Math.max(wb.timestamp, s), b = Math.min(wb.timestamp + wb.buffer.duration, e);
        if (b <= a) continue;
        const src = off.createBufferSource(); src.buffer = wb.buffer; src.connect(off.destination);
        src.start(a - s, a - wb.timestamp, b - a);
        onP(0.2 * (b - s) / dur);
      }
      const mix = await off.startRendering();
      base = 0.2;
      const step = rate;
      for (let o = 0; o < mix.length; o += step) {
        const len = Math.min(step, mix.length - o);
        const part = new AudioBuffer({ length: len, numberOfChannels: outCh, sampleRate: rate });
        for (let c = 0; c < outCh; c++) part.copyToChannel(mix.getChannelData(c).subarray(o, o + len), c);
        await feed(part);
      }
    }
    await addFramesUntil(Infinity);
    await output.finalize();
    const what = (st.bg === 'image' ? 'your picture' : 'a plain background') + (wave ? ' and moving sound bars' : '');
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), note: 'MP4 video, ' + W + 'x' + H + ', with ' + what + '.' };
  } catch (err) {
    if (st.output) { try { await st.output.cancel(); } catch (x) { /* already closed */ } }
    throw err;
  } finally { if (input.dispose) input.dispose(); }
}

/* Part of a video into an animated GIF. */
async function videoToGif(range, onP) {
  const [s, e] = range;
  const fps = +$('cv-gfps').value || 10;
  const { width: W, height: H } = fitWidth(st.info.width, st.info.height, +$('cv-gw').value || 480);
  const input = new Input({ source: new BlobSource(st.file), formats: ALL_FORMATS });
  try {
    const vt = await input.getPrimaryVideoTrack();
    if (!vt || !(await vt.canDecode())) throw new Error('Your browser cannot read the picture in this video.');
    const sink = new CanvasSink(vt, { width: W, height: H, fit: 'fill', poolSize: 1 });
    const n = Math.max(1, Math.floor((e - s) * fps));
    const times = Array.from({ length: n }, (_, i) => s + i / fps);
    const work = document.createElement('canvas'); work.width = W; work.height = H;
    const wctx = work.getContext('2d', { willReadFrequently: true });
    const gif = new GifWriter(W, H, 0);
    let i = 0;
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      if (st.cancel) throw new Error('cancelled');
      if (wc) { wctx.drawImage(wc.canvas, 0, 0, W, H); }
      gif.addFrame(wctx.getImageData(0, 0, W, H).data, 100 / fps);
      i++;
      onP(i / n);
      await tick();
    }
    const bytes = gif.finish();
    return { blob: new Blob([bytes], { type: 'image/gif' }), note: 'GIF, ' + W + 'x' + H + ', ' + fps + ' frames per second, ' + fmtTime(e - s, true) + ' long.' };
  } finally { if (input.dispose) input.dispose(); }
}

/* An animated GIF into MP4 or WebM. */
async function gifToVideo(onP) {
  const T = TARGETS[st.target];
  const codec = T.codecs.find((c) => st.canEnc[c]);
  if (!codec) throw new Error('Your browser cannot encode video for ' + T.label + '.');
  const even = (x) => Math.max(2, Math.round(x / 2) * 2);
  let W = even(st.gif.width), H = even(st.gif.height);
  if (Math.max(W, H) > 1920) ({ width: W, height: H } = fitWidth(W, H, Math.round(1920 * W / Math.max(W, H))));
  if (!(await canEncodeVideo(codec, { width: W, height: H }))) {
    const k = 480 / Math.min(W, H);
    W = even(W * k); H = even(H * k);
    if (!(await canEncodeVideo(codec, { width: W, height: H }))) throw new Error('Your browser cannot encode a video of this size.');
  }
  const reps = +$('cv-rep').value || 1;
  const dec = new ImageDecoder({ data: await st.file.arrayBuffer(), type: 'image/gif' });
  try {
    await dec.tracks.ready; await dec.completed;
    const frames = dec.tracks.selectedTrack.frameCount;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const target = new BufferTarget();
    const output = new Output({ format: CONTAINERS[st.target](), target });
    st.output = output;
    const vsrc = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH });
    output.addVideoTrack(vsrc);
    await output.start();
    let t = 0;
    const total = frames * reps;
    for (let i = 0; i < total; i++) {
      if (st.cancel) throw new Error('cancelled');
      const { image } = await dec.decode({ frameIndex: i % frames });
      const d = image.duration && image.duration > 10000 ? image.duration / 1e6 : 0.1;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(image, 0, 0, W, H);
      image.close();
      await vsrc.add(t, d, i % frames === 0 ? { keyFrame: true } : undefined);
      t += d;
      onP((i + 1) / total);
      if (i % 5 === 0) await tick();
    }
    await output.finalize();
    return { blob: new Blob([target.buffer], { type: T.mime }), note: T.label + ' video, ' + W + 'x' + H + ', ' + fmtTime(t, true) + ' long, no sound.' };
  } catch (err) {
    if (st.output) { try { await st.output.cancel(); } catch (x) { /* already closed */ } }
    throw err;
  } finally { dec.close(); }
}

/* ---------------------------------------------------------------- result */

function showResult(blob, note, range) {
  prog.stop(); show('cv-result', true);
  const T = TARGETS[st.target];
  $('cv-before').textContent = fmtSize(st.file.size);
  $('cv-after').textContent = fmtSize(blob.size);
  const change = Math.round((1 - blob.size / st.file.size) * 100);
  $('cv-save').textContent = change > 0 ? change + '% smaller' : (change < 0 ? Math.abs(change) + '% larger' : 'Same size');
  $('cv-note').textContent = note;
  const trimmed = !!range && isTrimmed(range[0], range[1], st.info.duration);
  const name = outName(st.file.name, st.target, { trimmed });
  const box = $('cv-parts');
  box.innerHTML = '';
  const { row, url } = downloadRow(blob, name, T.label + ' · ' + fmtSize(blob.size), true);
  st.outUrl = url;
  box.appendChild(row);
  const g = T.group;
  show('cv-rvstage', g === 'video' || g === 'cover');
  show('cv-raudio', g === 'audio');
  show('cv-rgstage', g === 'gif');
  if (g === 'video' || g === 'cover') $('cv-rvideo').src = url;
  else if (g === 'audio') $('cv-raudio').src = url;
  else $('cv-rimg').src = url;
  ['cv-stage', 'cv-astage', 'cv-gstage', 'cv-cstage'].forEach((id) => show(id, false));
  $('cv-video').pause(); $('cv-audio').pause();
}

function clearOutput() {
  if (st.outUrl) URL.revokeObjectURL(st.outUrl);
  st.outUrl = null;
  ['cv-rvideo', 'cv-raudio', 'cv-rimg'].forEach((id) => $(id).removeAttribute('src'));
  $('cv-parts').innerHTML = '';
}

function backToSettings() {
  if (st.running) return;
  clearOutput();
  show('cv-result', false); show('cv-controls', true);
  setTarget(st.target);
}

function resetAll() {
  if (st.running) return;
  clearOutput();
  if (st.url) URL.revokeObjectURL(st.url);
  Object.assign(st, { url: null, file: null, info: null, gif: null, kind: null, target: null });
  ['cv-video', 'cv-audio', 'cv-gimg'].forEach((id) => $(id).removeAttribute('src'));
  $('cv-file').value = '';
  ['cv-result', 'cv-progress', 'cv-controls', 'cv-stage', 'cv-astage', 'cv-gstage', 'cv-cstage'].forEach((id) => show(id, false));
  show('cv-drop', true); show('cv-empty', true);
  say('');
}

/* ---------------------------------------------------------------- wiring */

wireDrop('cv', loadFile);
document.querySelectorAll('#cv-q button').forEach((b) => b.addEventListener('click', () => {
  st.q = b.dataset.q; pressIn('cv-q', 'q', st.q);
  st.preset = 'custom'; pressIn('cv-preset', 'p', 'custom');
  refresh();
}));
['cv-res', 'cv-codec'].forEach((id) => $(id).addEventListener('change', () => { st.preset = 'custom'; pressIn('cv-preset', 'p', 'custom'); }));
document.querySelectorAll('#cv-bg button').forEach((b) => b.addEventListener('click', () => {
  st.bg = b.dataset.bg; pressIn('cv-bg', 'bg', st.bg); drawPreview();
  if (st.bg === 'image' && !st.img) $('cv-img').click();
}));
$('cv-imgpick').addEventListener('click', () => $('cv-img').click());
$('cv-img').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const bmp = await createImageBitmap(f);
    if (st.img && st.img.close) st.img.close();
    st.img = bmp;
    $('cv-imgname').textContent = f.name;
    say('');
  } catch (x) { say('That picture could not be opened. Try a JPG, PNG or WebP file.', true); }
  drawPreview();
});
['cv-title', 'cv-color', 'cv-tcolor'].forEach((id) => $(id).addEventListener('input', drawPreview));
['cv-fit', 'cv-wave'].forEach((id) => $(id).addEventListener('change', drawPreview));
const player = () => (st.kind === 'audio' ? $('cv-audio') : $('cv-video'));
$('cv-set-start').addEventListener('click', () => { $('cv-start').value = fmtTime(player().currentTime, true); });
$('cv-set-end').addEventListener('click', () => { $('cv-end').value = fmtTime(player().currentTime, true); });
$('cv-go').addEventListener('click', run);
$('cv-stop').addEventListener('click', () => { st.cancel = true; if (st.conv) st.conv.cancel(); });
$('cv-reset').addEventListener('click', resetAll);
$('cv-again').addEventListener('click', resetAll);
$('cv-other').addEventListener('click', backToSettings);
window.__cv = { st, loadFile, run, setTarget };
