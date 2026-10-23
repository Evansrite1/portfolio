import {
  Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget,
  Mp4OutputFormat, MovOutputFormat, MkvOutputFormat, WebMOutputFormat, canEncodeVideo, QUALITY_HIGH, EncodedPacketSink
} from '/tools/vendor/mediabunny/mediabunny.min.mjs';
import {
  $, show, supported, NO_SUPPORT, fmtSize, fmtTime, setStatus, wireDrop, probe,
  baseName, errText, isCancel, downloadRow, progressUI
} from '/tools/vmcommon.js';

const MIN_GAP = 0.2;
const FORMATS = {
  mp4: { make: () => new Mp4OutputFormat(), ext: 'mp4', mime: 'video/mp4', codec: 'avc' },
  mov: { make: () => new MovOutputFormat(), ext: 'mov', mime: 'video/quicktime', codec: 'avc' },
  mkv: { make: () => new MkvOutputFormat(), ext: 'mkv', mime: 'video/x-matroska', codec: 'avc' },
  webm: { make: () => new WebMOutputFormat(), ext: 'webm', mime: 'video/webm', codec: 'vp9' }
};

const st = {
  file: null, url: null, info: null, mode: 'keep', start: 0, end: 0, cut: 0, exact: false,
  conv: null, outputs: [], running: false
};
const prog = progressUI('vt');
const say = (msg, bad) => setStatus('vt-status', msg, bad);
if (!supported) say(NO_SUPPORT, true);

const dur = () => st.info.duration;
const pct = (t) => (t / dur()) * 100;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- loading ---------- */
async function loadFile(file) {
  if (!file || st.running) return;
  if (!supported) { say(NO_SUPPORT, true); return; }
  say('Reading your video...');
  let info;
  try { info = await probe(file); } catch (e) {
    say('That file could not be read as a video. Try an MP4, MOV, MKV or WebM file.', true);
    return;
  }
  if (!info.hasVideo) { say('That file has no video in it. To get the sound, use the video to MP3 tool.', true); return; }
  clearOutputs();
  if (st.url) URL.revokeObjectURL(st.url);
  st.file = file; st.info = info; st.url = URL.createObjectURL(file);
  st.start = 0; st.end = info.duration; st.cut = info.duration / 2; st.exact = false; st.mode = 'keep';
  $('vt-exact').checked = false;
  setMode('keep');
  $('vt-name').textContent = file.name;
  $('vt-meta').textContent = [fmtSize(file.size), info.width + 'x' + info.height, fmtTime(info.duration), info.fps ? info.fps + ' fps' : null].filter(Boolean).join(' · ');
  const v = $('vt-video');
  v.src = st.url; v.currentTime = 0;
  show('vt-drop', false); show('vt-controls', true); show('vt-stage', true); show('vt-empty', false);
  show('vt-rstage', false); show('vt-result', false);
  say('');
  draw();
}

/* ---------- timeline ---------- */
function draw() {
  if (!st.info) return;
  const sel = $('vt-sel');
  sel.style.left = pct(st.start) + '%';
  sel.style.right = (100 - pct(st.end)) + '%';
  const hs = $('vt-h-start'), he = $('vt-h-end');
  hs.style.left = pct(st.start) + '%'; he.style.left = pct(st.end) + '%';
  [[hs, st.start], [he, st.end]].forEach(([h, v]) => {
    h.setAttribute('aria-valuemin', '0'); h.setAttribute('aria-valuemax', String(dur().toFixed(1)));
    h.setAttribute('aria-valuenow', v.toFixed(1)); h.setAttribute('aria-valuetext', fmtTime(v, true));
  });
  $('vt-t-start').textContent = 'Start ' + fmtTime(st.start, true);
  $('vt-len').textContent = 'Length ' + fmtTime(st.end - st.start, true);
  $('vt-t-end').textContent = 'End ' + fmtTime(st.end, true);
  $('vt-cutmark').style.left = pct(st.cut) + '%';
  $('vt-cut-v').textContent = fmtTime(st.cut, true);
  const r = $('vt-cut');
  r.min = '0.5'; r.max = String(Math.max(0.6, dur() - 0.5)); r.step = '0.1'; r.value = String(st.cut);
  $('vt-go').textContent = st.mode === 'split' ? 'Split video' : 'Trim video';
}
function drawHead() {
  if (!st.info) return;
  const p = pct($('vt-video').currentTime || 0) + '%';
  $('vt-head').style.left = p; $('vt-head2').style.left = p;
}
function setMode(m) {
  st.mode = m;
  document.querySelectorAll('#vt-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  show('vt-keep-wrap', m === 'keep'); show('vt-split-wrap', m === 'split');
  draw();
}
function setStart(t) { st.start = clamp(t, 0, st.end - MIN_GAP); draw(); }
function setEnd(t) { st.end = clamp(t, st.start + MIN_GAP, dur()); draw(); }

function dragHandle(el, kind) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    el.focus();
    const rect = $('vt-line').getBoundingClientRect();
    const move = (ev) => {
      const t = clamp((ev.clientX - rect.left) / rect.width, 0, 1) * dur();
      if (kind === 'start') setStart(t); else setEnd(t);
      $('vt-video').currentTime = kind === 'start' ? st.start : st.end;
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
  el.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 1 : 0.1;
    let d = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -step;
    else return;
    e.preventDefault();
    if (kind === 'start') { setStart(st.start + d); $('vt-video').currentTime = st.start; }
    else { setEnd(st.end + d); $('vt-video').currentTime = st.end; }
  });
}
function seekLine(id) {
  $(id).addEventListener('click', (e) => {
    if (e.target.closest('.mt-handle')) return;
    const r = $(id).getBoundingClientRect();
    $('vt-video').currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * dur();
  });
}

/* ---------- cutting ---------- */
async function snapToKeyframe(t) {
  if (t <= 0.001) return 0;
  const input = new Input({ source: new BlobSource(st.file), formats: ALL_FORMATS });
  try {
    const vt = await input.getPrimaryVideoTrack();
    const p = await new EncodedPacketSink(vt).getKeyPacket(t, { verifyKeyPackets: true });
    return p ? Math.max(0, p.timestamp) : 0;
  } finally { if (input.dispose) input.dispose(); }
}

async function cutRange(a, b, exact) {
  const f = FORMATS[st.info.container] || FORMATS.mp4;
  const input = new Input({ source: new BlobSource(st.file), formats: ALL_FORMATS });
  try {
    const target = new BufferTarget();
    const output = new Output({ format: f.make(), target });
    const opts = { input, output, showWarnings: false };
    if (a > 0.001 || b < dur() - 0.001) opts.trim = { start: a, end: b };
    if (exact) {
      const video = { forceTranscode: true, codec: f.codec, quality: QUALITY_HIGH };
      if (!(await canEncodeVideo(video.codec, { width: st.info.width, height: st.info.height }))) delete video.codec;
      opts.video = video;
    } else {
      opts.copy = { mode: 'forced' };
    }
    const conv = await Conversion.init(opts);
    const lost = conv.discardedTracks.filter((d) => d.track.isVideoTrack() || d.track.isAudioTrack());
    if (!conv.isValid || (!exact && lost.length)) {
      throw new Error(exact
        ? 'This video cannot be re-encoded in your browser.'
        : 'This file cannot be cut losslessly into a ' + f.ext.toUpperCase() + ' file. Turn on Exact cut (re-encode) and try again.');
    }
    st.conv = conv;
    conv.onProgress = (p) => cutRange.onFrac && cutRange.onFrac(p);
    await conv.execute();
    st.conv = null;
    return { blob: new Blob([target.buffer], { type: f.mime }), ext: f.ext, start: a, end: b };
  } finally {
    st.conv = null;
    if (input.dispose) input.dispose();
  }
}

async function run() {
  if (!st.file || st.running) return;
  clearOutputs();
  st.running = true;
  say('');
  show('vt-controls', false); show('vt-result', false);
  prog.start(st.exact ? 'Re-encoding' : 'Cutting');
  const exact = st.exact;
  const base = baseName(st.file);
  let ranges, note = '';
  try {
    if (st.mode === 'split') {
      let cut = st.cut;
      if (!exact) {
        cut = await snapToKeyframe(st.cut);
        if (cut < MIN_GAP || cut > dur() - MIN_GAP) throw new Error('There is no keyframe close to that split point. Move the split point, or turn on Exact cut (re-encode).');
        note = 'Lossless split. The cut landed on a keyframe at ' + fmtTime(cut, true) + ' (you chose ' + fmtTime(st.cut, true) + '). Part 2 starts exactly where part 1 ends.';
      } else note = 'Exact cut at ' + fmtTime(cut, true) + '. Both parts were re-encoded.';
      ranges = [[0, cut, base + '-part1'], [cut, dur(), base + '-part2']];
    } else {
      let a = st.start;
      if (!exact) {
        a = await snapToKeyframe(st.start);
        note = 'Lossless cut. It starts at ' + fmtTime(a, true) + ', the keyframe at or before the ' + fmtTime(st.start, true) + ' you chose. Turn on Exact cut (re-encode) if you need the exact frame.';
      } else note = 'Exact cut. The video was re-encoded and starts at ' + fmtTime(a, true) + '.';
      ranges = [[a, st.end, base + '-trimmed']];
    }
    const total = ranges.reduce((s, r) => s + (r[1] - r[0]), 0);
    let done = 0;
    for (let i = 0; i < ranges.length; i++) {
      const [a, b, label] = ranges[i];
      const share = (b - a) / total;
      $('vt-pt').textContent = ranges.length > 1 ? 'Part ' + (i + 1) + ' of ' + ranges.length : '';
      cutRange.onFrac = (p) => prog.update(done + p * share, exact ? 'Re-encoding' : 'Cutting');
      const res = await cutRange(a, b, exact);
      res.label = label;
      done += share;
      st.outputs.push(res);
    }
    showResult(note);
  } catch (e) {
    prog.stop(); show('vt-controls', true);
    clearOutputs();
    if (isCancel(e)) say('Stopped.');
    else say('Something went wrong: ' + errText(e), true);
  } finally {
    st.running = false; st.conv = null; cutRange.onFrac = null;
  }
}

function showResult(note) {
  prog.stop(); show('vt-result', true);
  const after = st.outputs.reduce((s, o) => s + o.blob.size, 0);
  $('vt-before').textContent = fmtSize(st.file.size);
  $('vt-after').textContent = fmtSize(after);
  const kept = st.outputs.reduce((s, o) => s + (o.end - o.start), 0);
  $('vt-save').textContent = fmtTime(kept, true) + ' kept';
  $('vt-note').textContent = note;
  const box = $('vt-parts');
  box.innerHTML = '';
  st.outputs.forEach((o, i) => {
    const name = o.label + '.' + o.ext;
    const { row, url } = downloadRow(o.blob, name, fmtTime(o.start, true) + ' to ' + fmtTime(o.end, true) + ' · ' + fmtSize(o.blob.size), i === 0);
    o.url = url;
    if (st.outputs.length > 1) {
      const pv = document.createElement('button');
      pv.type = 'button'; pv.className = 'btn'; pv.textContent = 'Preview';
      pv.addEventListener('click', () => { $('vt-result-preview').src = url; });
      row.insertBefore(pv, row.lastChild);
    }
    box.appendChild(row);
  });
  $('vt-result-preview').src = st.outputs[0].url;
  show('vt-stage', false); show('vt-rstage', true);
}

function clearOutputs() {
  st.outputs.forEach((o) => o.url && URL.revokeObjectURL(o.url));
  st.outputs = [];
  $('vt-result-preview').removeAttribute('src');
  $('vt-parts').innerHTML = '';
}

function resetAll() {
  if (st.running) return;
  clearOutputs();
  if (st.url) URL.revokeObjectURL(st.url);
  st.url = null; st.file = null; st.info = null;
  $('vt-video').removeAttribute('src');
  $('vt-file').value = '';
  show('vt-result', false); show('vt-progress', false); show('vt-controls', false);
  show('vt-rstage', false); show('vt-stage', false);
  show('vt-drop', true); show('vt-empty', true);
  say('');
}

/* ---------- wire up ---------- */
wireDrop('vt', loadFile);
document.querySelectorAll('#vt-mode button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
dragHandle($('vt-h-start'), 'start');
dragHandle($('vt-h-end'), 'end');
seekLine('vt-line'); seekLine('vt-line2');
$('vt-set-start').addEventListener('click', () => setStart($('vt-video').currentTime));
$('vt-set-end').addEventListener('click', () => setEnd($('vt-video').currentTime));
$('vt-set-cut').addEventListener('click', () => { st.cut = clamp($('vt-video').currentTime, 0.5, Math.max(0.6, dur() - 0.5)); draw(); });
$('vt-cut').addEventListener('input', function () { st.cut = +this.value; $('vt-video').currentTime = st.cut; draw(); });
$('vt-exact').addEventListener('change', function () { st.exact = this.checked; });
$('vt-video').addEventListener('timeupdate', drawHead);
$('vt-video').addEventListener('seeked', drawHead);
$('vt-go').addEventListener('click', run);
$('vt-stop').addEventListener('click', () => { if (st.conv) st.conv.cancel(); });
$('vt-reset').addEventListener('click', resetAll);
$('vt-again').addEventListener('click', resetAll);
window.__vt = { st, loadFile, run };
