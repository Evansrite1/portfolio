import {
  Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget,
  Mp4OutputFormat, WebMOutputFormat, ConversionCanceledError, canEncodeVideo
} from '/tools/vendor/mediabunny/mediabunny.min.mjs';

const $ = (id) => document.getElementById(id);
const AUDIO_BPS = 128000;
const show = (id, on) => { $(id).hidden = !on; };

const st = {
  file: null, url: null, duration: 0, width: 0, height: 0, fps: 0,
  start: 0, end: 0, split: false, cut: 0, targetMb: 0, origMb: 0,
  conv: null, outputs: []
};

function fmtSize(bytes) {
  const mb = bytes / 1048576;
  return mb >= 1000 ? (mb / 1024).toFixed(2) + ' GB' : (mb >= 10 ? Math.round(mb) : mb.toFixed(1)) + ' MB';
}
function fmtTime(s) {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
}
function status(msg, bad) {
  const el = $('vc-status');
  el.textContent = msg || '';
  el.style.color = bad ? '#ff8a80' : '';
}

const supported = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
if (!supported) {
  status('This browser cannot compress video. Please open this page in Chrome, Edge or another up to date Chromium browser on a computer.', true);
}

/* ---------- loading a file ---------- */
async function loadFile(file) {
  if (!file) return;
  if (!supported) return;
  status('Reading your video...');
  let input;
  try {
    input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const vt = await input.getPrimaryVideoTrack();
    if (!vt) throw new Error('no video track');
    st.duration = await input.computeDuration();
    st.width = vt.displayWidth;
    st.height = vt.displayHeight;
    try { const s = await vt.computePacketStats(120); st.fps = Math.round(s.averagePacketRate); } catch (e) { st.fps = 0; }
  } catch (e) {
    status('That file could not be read as a video. Try an MP4, MOV, MKV or WebM file.', true);
    return;
  } finally {
    if (input && input.dispose) input.dispose();
  }
  if (st.url) URL.revokeObjectURL(st.url);
  st.file = file;
  st.url = URL.createObjectURL(file);
  st.origMb = file.size / 1048576;
  st.start = 0; st.end = st.duration; st.split = false; st.cut = st.duration / 2;
  $('vc-split').checked = false;

  $('vc-name').textContent = file.name;
  $('vc-meta').textContent = [fmtSize(file.size), st.width + 'x' + st.height, fmtTime(st.duration), st.fps ? st.fps + ' fps' : null].filter(Boolean).join(' · ');
  const resSel = $('vc-res');
  resSel.innerHTML = '';
  const opts = [['0', 'Keep original (' + st.height + 'p)']];
  [1080, 720, 480, 360].forEach((h) => { if (h < st.height) opts.push([String(h), h + 'p']); });
  opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; resSel.appendChild(o); });

  const slider = $('vc-target');
  slider.min = Math.max(5, Math.round(st.origMb * 0.03));
  slider.max = Math.max(+slider.min + 5, Math.round(st.origMb * 0.9));
  slider.step = st.origMb > 500 ? 10 : 1;
  setPreset(0.25);

  const v = $('vc-video');
  v.src = st.url;
  v.currentTime = 0;
  show('vc-drop', false); show('vc-controls', true);
  show('vc-stage', true); show('vc-empty', false);
  status('');
  drawTimeline();
}

/* ---------- target size ---------- */
function setTarget(mb) {
  st.targetMb = Math.max(+$('vc-target').min, Math.min(+$('vc-target').max, mb));
  $('vc-target').value = st.targetMb;
  $('vc-target-v').textContent = fmtSize(st.targetMb * 1048576);
  updateQuality();
}
function setPreset(frac) {
  document.querySelectorAll('#vc-presets button').forEach((b) => {
    b.setAttribute('aria-pressed', String(+b.dataset.frac === frac));
    const mb = st.origMb * +b.dataset.frac;
    b.querySelector('small').textContent = 'about ' + fmtSize(mb * 1048576);
  });
  setTarget(Math.round(st.origMb * frac));
}
function videoBitrateFor(bytes, seconds) {
  return Math.max(150000, Math.floor(((bytes * 0.94 * 8) / Math.max(1, seconds)) - AUDIO_BPS));
}
function updateQuality() {
  const secs = Math.max(1, (st.end - st.start));
  const bps = videoBitrateFor(st.targetMb * 1048576, secs);
  const h = +$('vc-res').value || st.height;
  const w = Math.round(st.width * h / st.height);
  const perPixel = bps / (w * h * (st.fps || 30));
  let t;
  if (perPixel > 0.12) t = 'Estimated quality: near original. Little will be saved.';
  else if (perPixel > 0.06) t = 'Estimated quality: very good. Looks the same on a phone or laptop screen.';
  else if (perPixel > 0.03) t = 'Estimated quality: good for phones, social media and sharing.';
  else if (perPixel > 0.015) t = 'Estimated quality: noticeable softness. Try a smaller resolution for a sharper picture.';
  else t = 'Estimated quality: low. Pick a larger size or a smaller resolution.';
  $('vc-quality').textContent = t;
}

/* ---------- timeline ---------- */
function pct(t) { return (t / st.duration) * 100; }
function drawTimeline() {
  const sel = $('vc-sel');
  sel.style.left = pct(st.start) + '%';
  sel.style.right = (100 - pct(st.end)) + '%';
  const cut = $('vc-cut');
  cut.hidden = !st.split;
  cut.style.left = pct(st.cut) + '%';
  $('vc-t-start').textContent = 'Start ' + fmtTime(st.start);
  $('vc-len').textContent = 'Length ' + fmtTime(st.end - st.start);
  $('vc-t-end').textContent = 'End ' + fmtTime(st.end);
  $('vc-cut-v').textContent = fmtTime(st.cut);
  show('vc-split-pos', st.split);
  if (st.split) {
    const lo = st.start + 1, hi = st.end - 1;
    st.cut = Math.min(Math.max(st.cut, lo), Math.max(lo, hi));
    const r = $('vc-cutrange');
    r.min = lo; r.max = Math.max(lo + 0.1, hi); r.step = 0.1; r.value = st.cut;
    $('vc-cut-v').textContent = fmtTime(st.cut);
    cut.style.left = pct(st.cut) + '%';
  }
  updateQuality();
}
function dragHandle(el, kind) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    const track = $('vc-time').getBoundingClientRect();
    const move = (ev) => {
      const t = Math.min(1, Math.max(0, (ev.clientX - track.left) / track.width)) * st.duration;
      if (kind === 'start') st.start = Math.min(t, st.end - 1);
      else st.end = Math.max(t, st.start + 1);
      if (st.start < 0) st.start = 0;
      if (st.end > st.duration) st.end = st.duration;
      $('vc-video').currentTime = kind === 'start' ? st.start : st.end;
      drawTimeline();
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  });
}

/* ---------- compress ---------- */
async function encodeRange(start, end, label, partIdx, partCount, targetBytes, onFrac) {
  const fmtSel = $('vc-fmt').value;
  const webm = fmtSel === 'webm';
  const h = +$('vc-res').value;
  const bps = videoBitrateFor(targetBytes, end - start);
  const origBps = (st.file.size * 8) / st.duration;
  const input = new Input({ source: new BlobSource(st.file), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({ format: webm ? new WebMOutputFormat() : new Mp4OutputFormat(), target });
  const video = { bitrate: Math.min(bps, origBps), forceTranscode: true };
  if (h && h < st.height) { video.height = h; video.width = Math.round(st.width * h / st.height / 2) * 2; video.fit = 'contain'; }
  video.codec = webm ? 'vp9' : 'avc';
  if (!(await canEncodeVideo(video.codec, { bitrate: video.bitrate, width: video.width || st.width, height: video.height || st.height }))) delete video.codec;
  const conv = await Conversion.init({
    input, output,
    video,
    audio: { bitrate: AUDIO_BPS },
    trim: { start, end },
    showWarnings: false
  });
  if (!conv.isValid) throw new Error('This video format cannot be converted in your browser.');
  st.conv = conv;
  conv.onProgress = (p) => onFrac(p);
  await conv.execute();
  st.conv = null;
  const blob = new Blob([target.buffer], { type: webm ? 'video/webm' : 'video/mp4' });
  return { blob, label, ext: webm ? 'webm' : 'mp4', start, end };
}

async function run() {
  if (!st.file) return;
  st.outputs = [];
  show('vc-controls', false); show('vc-progress', true); show('vc-result', false);
  const targetBytes = st.targetMb * 1048576;
  const ranges = st.split
    ? [[st.start, st.cut], [st.cut, st.end]]
    : [[st.start, st.end]];
  const totalDur = ranges.reduce((a, r) => a + (r[1] - r[0]), 0);
  const base = st.file.name.replace(/\.[^.]+$/, '');
  let done = 0;
  const t0 = Date.now();
  try {
    for (let i = 0; i < ranges.length; i++) {
      const [a, b] = ranges[i];
      const share = (b - a) / totalDur;
      const partBytes = targetBytes * share;
      const label = ranges.length > 1 ? base + '-part' + (i + 1) : base + '-compressed';
      $('vc-pt').textContent = ranges.length > 1 ? 'Part ' + (i + 1) + ' of ' + ranges.length : '';
      const res = await encodeRange(a, b, label, i, ranges.length, partBytes, (p) => {
        const total = Math.min(1, done + p * share);
        $('vc-pb').style.width = (total * 100) + '%';
        const el = (Date.now() - t0) / 1000;
        const eta = total > 0.03 ? Math.max(0, el / total - el) : null;
        $('vc-pl').textContent = 'Compressing... ' + Math.floor(total * 100) + '%' + (eta !== null ? ', about ' + fmtTime(eta) + ' left' : '');
      });
      done += share;
      st.outputs.push(res);
    }
  } catch (e) {
    show('vc-progress', false); show('vc-controls', true);
    if (e instanceof ConversionCanceledError || (e && /cancel/i.test(e.name || e.message))) status('Stopped.');
    else status('Something went wrong: ' + (e && e.message ? e.message : e) + ' Try a smaller resolution or another format.', true);
    return;
  }
  showResult();
}

function showResult() {
  show('vc-progress', false); show('vc-result', true);
  const after = st.outputs.reduce((a, o) => a + o.blob.size, 0);
  const keptFrac = st.outputs.reduce((a, o) => a + (o.end - o.start), 0) / st.duration;
  $('vc-before').textContent = fmtSize(st.file.size);
  $('vc-after').textContent = fmtSize(after);
  const saved = Math.round((1 - after / (st.file.size * keptFrac)) * 100);
  $('vc-save').textContent = saved > 0 ? saved + '% smaller' : 'Already well compressed';
  const box = $('vc-parts');
  box.innerHTML = '';
  st.outputs.forEach((o, i) => {
    o.url = URL.createObjectURL(o.blob);
    const row = document.createElement('div');
    row.className = 'vc-part';
    const left = document.createElement('span');
    left.innerHTML = '<b></b><small></small>';
    left.querySelector('b').textContent = o.label + '.' + o.ext;
    left.querySelector('small').textContent = fmtTime(o.start) + ' to ' + fmtTime(o.end) + ' · ' + fmtSize(o.blob.size);
    const a = document.createElement('a');
    a.className = 'btn' + (i === 0 ? ' primary' : '');
    a.href = o.url; a.download = o.label + '.' + o.ext; a.textContent = 'Download';
    row.appendChild(left); row.appendChild(a);
    box.appendChild(row);
  });
  const rp = $('vc-result-preview');
  rp.src = st.outputs[0].url;
  show('vc-stage', false);
  show('vc-rstage', true);
}

function resetAll() {
  st.outputs.forEach((o) => o.url && URL.revokeObjectURL(o.url));
  st.outputs = [];
  if (st.url) URL.revokeObjectURL(st.url);
  st.url = null; st.file = null;
  $('vc-video').removeAttribute('src'); $('vc-result-preview').removeAttribute('src');
  $('vc-file').value = '';
  show('vc-result', false); show('vc-progress', false); show('vc-controls', false);
  show('vc-rstage', false); show('vc-stage', false);
  show('vc-drop', true); show('vc-empty', true);
  status('');
}

/* ---------- wire up ---------- */
$('vc-pick').addEventListener('click', (e) => { e.stopPropagation(); $('vc-file').click(); });
$('vc-file').addEventListener('change', (e) => loadFile(e.target.files[0]));
const drop = $('vc-drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
drop.addEventListener('click', () => $('vc-file').click());

document.querySelectorAll('#vc-presets button').forEach((b) => b.addEventListener('click', () => setPreset(+b.dataset.frac)));
$('vc-target').addEventListener('input', function () {
  document.querySelectorAll('#vc-presets button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  setTarget(+this.value);
});
$('vc-res').addEventListener('change', updateQuality);
$('vc-split').addEventListener('change', function () {
  st.split = this.checked;
  if (st.split) st.cut = (st.start + st.end) / 2;
  drawTimeline();
});
$('vc-cutrange').addEventListener('input', function () { st.cut = +this.value; $('vc-video').currentTime = st.cut; drawTimeline(); });
$('vc-set-start').addEventListener('click', () => { const t = $('vc-video').currentTime; if (t < st.end - 1) { st.start = t; drawTimeline(); } });
$('vc-set-end').addEventListener('click', () => { const t = $('vc-video').currentTime; if (t > st.start + 1) { st.end = t; drawTimeline(); } });
dragHandle($('vc-h-start'), 'start');
dragHandle($('vc-h-end'), 'end');
$('vc-time').addEventListener('click', (e) => {
  if (e.target.closest('.vc-sel i')) return;
  const r = $('vc-time').getBoundingClientRect();
  $('vc-video').currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * st.duration;
});
$('vc-video').addEventListener('timeupdate', () => { $('vc-tc').textContent = fmtTime($('vc-video').currentTime) + ' / ' + fmtTime(st.duration); });
$('vc-go').addEventListener('click', run);
$('vc-stop').addEventListener('click', () => { if (st.conv) st.conv.cancel(); });
$('vc-reset').addEventListener('click', resetAll);
$('vc-again').addEventListener('click', resetAll);
window.__vc = { st, loadFile };
