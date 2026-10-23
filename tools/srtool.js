/* srtool.js : browser screen recorder. Nothing is uploaded.
   Screen (getDisplayMedia) + optional mic + optional webcam bubble -> MediaRecorder -> WebM/MP4,
   with a remux to MP4 through mediabunny so the file has a correct duration. */
import {
  Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, Mp4OutputFormat, canEncodeVideo
} from '/tools/vendor/mediabunny/mediabunny.min.mjs';

const $ = (id) => document.getElementById(id);
const show = (id, on) => { $(id).hidden = !on; };

const MP4_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
const WEBM_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

/* Test hook: a test page can set window.srTest = { stream, mime } before pressing Start.
   The stream then replaces the screen picker and runs through the same record, pause, stop,
   preview, download and MP4 conversion code. Results are mirrored to window.srTest.out. */
const hook = () => (window.srTest && typeof window.srTest === 'object' ? window.srTest : null);

const S = {
  phase: 'idle', // idle | countdown | recording | paused | busy
  streams: [], rec: null, chunks: [], mime: '', ac: null, worker: null, srcVideo: null, camVideo: null,
  t0: 0, acc: 0, timer: 0, cancelled: false,
  blob: null, mp4: null, url: null, urlMp4: null, duration: 0, mp4Duration: 0
};

function fmtTime(s) {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
}
function fmtSize(b) {
  const mb = b / 1048576;
  return mb >= 1000 ? (mb / 1024).toFixed(2) + ' GB' : (mb >= 10 ? Math.round(mb) : mb.toFixed(1)) + ' MB';
}
function status(msg, bad) {
  const el = $('sr-status');
  el.textContent = msg || '';
  el.style.color = bad ? 'var(--accent)' : '';
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* ---------- support check ---------- */
const isPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
const canCapture = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !!window.MediaRecorder;
const testing = () => !!(hook() && hook().stream);
function gate() {
  if (testing()) return true;
  if (isPhone || !canCapture) {
    show('sr-unsupported', true);
    $('sr-unsupported').textContent = isPhone
      ? 'Screen recording from a web page does not work on phones. Please open this page in Chrome, Edge or Firefox on a laptop or desktop computer.'
      : 'This browser cannot record the screen. Please use an up to date Chrome, Edge or Firefox on a laptop or desktop computer.';
    return false;
  }
  show('sr-unsupported', false);
  return true;
}
if (!gate()) $('sr-start').disabled = true;

/* ---------- settings ---------- */
$('sr-cam').addEventListener('change', () => { show('sr-corner-f', $('sr-cam').checked); });

function pickMime(force) {
  if (!window.MediaRecorder) return '';
  const list = force === 'webm' ? WEBM_TYPES : force === 'mp4' ? MP4_TYPES : MP4_TYPES.concat(WEBM_TYPES);
  for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* ignore */ } }
  return '';
}
const extOf = (mime) => (/mp4/.test(mime) ? 'mp4' : 'webm');
const labelOf = (ext) => (ext === 'mp4' ? 'MP4' : 'WebM');

/* ---------- capture helpers ---------- */
function stopStream(s) { if (s) s.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* ignore */ } }); }

function cleanupCapture() {
  S.streams.forEach(stopStream);
  S.streams = [];
  if (S.worker) { try { S.worker.postMessage('stop'); S.worker.terminate(); } catch (e) { /* ignore */ } S.worker = null; }
  if (S.ac) { try { S.ac.close(); } catch (e) { /* ignore */ } S.ac = null; }
  [S.srcVideo, S.camVideo].forEach((v) => { if (v) { v.pause(); v.srcObject = null; } });
  S.srcVideo = S.camVideo = null;
  clearInterval(S.timer);
  const live = $('sr-live');
  live.pause(); live.srcObject = null;
}

function makeTicker(ms, fn) {
  /* A worker timer keeps ticking while this tab is in the background, which is where
     the tab sits when you record another window. */
  try {
    const src = 'let id=0;onmessage=e=>{if(e.data==="stop"){clearInterval(id);return}clearInterval(id);id=setInterval(()=>postMessage(1),e.data)}';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = fn; w.postMessage(ms);
    S.worker = w;
  } catch (e) {
    S.worker = { postMessage() {}, terminate() { clearInterval(iv); } };
    const iv = setInterval(fn, ms);
  }
}

function videoFrom(track) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true;
  v.srcObject = new MediaStream([track]);
  return v.play().then(() => v, () => v);
}

/* ---------- start ---------- */
async function start() {
  if (S.phase !== 'idle' || !gate()) return;
  clearResult();
  status('');
  S.cancelled = false;
  const wantSys = $('sr-sys').checked, wantMic = $('sr-mic').checked, wantCam = $('sr-cam').checked;
  const fps = +$('sr-fps').value, resH = +$('sr-res').value;
  S.phase = 'countdown';
  $('sr-start').disabled = true;

  let screen, mic = null, cam = null;
  try {
    if (testing()) screen = hook().stream;
    else {
      const v = { frameRate: { ideal: fps } };
      if (resH) { v.height = { ideal: resH }; v.width = { ideal: Math.round(resH * 16 / 9) }; }
      screen = await navigator.mediaDevices.getDisplayMedia({ video: v, audio: wantSys });
    }
  } catch (e) {
    S.phase = 'idle'; $('sr-start').disabled = false;
    status(e && e.name === 'NotAllowedError'
      ? 'Recording was cancelled or the browser blocked screen sharing. Press Start recording and pick a screen, window or tab.'
      : 'Could not start the screen capture: ' + (e && e.message ? e.message : e), true);
    return;
  }
  S.streams.push(screen);
  const vtrack = screen.getVideoTracks()[0];
  if (!vtrack) { cleanupCapture(); S.phase = 'idle'; $('sr-start').disabled = false; status('No video was shared. Try again.', true); return; }

  const notes = [];
  if (wantMic) {
    try { mic = (hook() && hook().mic) || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); S.streams.push(mic); }
    catch (e) { notes.push('The microphone was blocked, so it is not recorded.'); }
  }
  if (wantCam) {
    try { cam = (hook() && hook().cam) || await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } }); S.streams.push(cam); }
    catch (e) { notes.push('The webcam was blocked, so no camera circle is added.'); }
  }
  if (wantSys && !testing() && !screen.getAudioTracks().length) {
    notes.push('No computer or tab audio was shared. To record sound, tick Share audio in the browser box (available for tabs, and for the whole screen on Windows and ChromeOS).');
  }

  vtrack.addEventListener('ended', () => {
    if (S.phase === 'countdown') S.cancelled = true;
    else if (S.phase === 'recording' || S.phase === 'paused') stop();
  });

  try {
    S.srcVideo = await videoFrom(vtrack);
    let srcW = S.srcVideo.videoWidth || vtrack.getSettings().width || 1280;
    let srcH = S.srcVideo.videoHeight || vtrack.getSettings().height || 720;
    let outTrack = vtrack, outW = srcW, outH = srcH;

    if (cam) {
      /* Draw the screen and a circular camera into a canvas and record the canvas. */
      S.camVideo = await videoFrom(cam.getVideoTracks()[0]);
      outH = resH && resH < srcH ? resH : srcH;
      outW = Math.round(srcW * outH / srcH);
      outW -= outW % 2; outH -= outH % 2;
      const canvas = document.createElement('canvas');
      canvas.width = outW; canvas.height = outH;
      const ctx = canvas.getContext('2d');
      const corner = $('sr-corner').value;
      const d = Math.round(outH * 0.24), m = Math.round(outH * 0.035);
      const cx = corner.indexOf('l') >= 0 ? m + d / 2 : outW - m - d / 2;
      const cy = corner.indexOf('t') >= 0 ? m + d / 2 : outH - m - d / 2;
      const draw = () => {
        ctx.drawImage(S.srcVideo, 0, 0, outW, outH);
        const cv = S.camVideo; if (!cv || !cv.videoWidth) return;
        const s = Math.min(cv.videoWidth, cv.videoHeight);
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
        ctx.drawImage(cv, (cv.videoWidth - s) / 2, (cv.videoHeight - s) / 2, s, s, cx - d / 2, cy - d / 2, d, d);
        ctx.restore();
        ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(3, d * 0.04); ctx.strokeStyle = '#ffffff'; ctx.stroke();
      };
      draw();
      makeTicker(Math.round(1000 / fps), draw);
      outTrack = canvas.captureStream(fps).getVideoTracks()[0];
    }

    /* Mix system or tab audio and microphone into one track. */
    const audioStreams = [screen, mic].filter((s) => s && s.getAudioTracks().length);
    const tracks = [outTrack];
    if (audioStreams.length) {
      const AC = window.AudioContext || window.webkitAudioContext;
      S.ac = new AC();
      const dest = S.ac.createMediaStreamDestination();
      audioStreams.forEach((s) => S.ac.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(dest));
      if (S.ac.state === 'suspended') await S.ac.resume();
      tracks.push(dest.stream.getAudioTracks()[0]);
    }
    const recStream = new MediaStream(tracks);

    S.mime = pickMime(hook() && hook().mime);
    if (!S.mime) throw new Error('This browser has no supported recording format.');
    const bps = Math.max(2.5e6, Math.min(14e6, Math.round(outW * outH * fps * 0.07)));
    S.rec = new MediaRecorder(recStream, { mimeType: S.mime, videoBitsPerSecond: bps, audioBitsPerSecond: 128000 });
    S.chunks = [];
    S.rec.ondataavailable = (e) => { if (e.data && e.data.size) S.chunks.push(e.data); };
    S.rec.onerror = (e) => { status('Recording error: ' + (e.error && e.error.message ? e.error.message : 'unknown'), true); };
    S.rec.onstop = finish;

    $('sr-live').srcObject = new MediaStream([outTrack]);
    $('sr-live').play().catch(() => {});
    show('sr-empty', false); show('sr-stage', true);
    show('sr-setup', false); show('sr-controls', true);
    $('sr-pause').disabled = true; $('sr-stop').disabled = false;
    $('sr-stop').textContent = 'Cancel';
    $('sr-time').textContent = '0:00';
    if (notes.length) status(notes.join(' '));

    /* 3 second countdown */
    const cd = $('sr-count');
    show('sr-count', true);
    for (let n = 3; n >= 1; n--) {
      cd.textContent = n; cd.setAttribute('aria-label', 'Recording starts in ' + n);
      await sleep(1000);
      if (S.cancelled) break;
    }
    show('sr-count', false);
    if (S.cancelled) { abort('Recording stopped before it started.'); return; }

    S.rec.start(1000);
    S.phase = 'recording';
    S.t0 = performance.now(); S.acc = 0;
    $('sr-pause').disabled = false; $('sr-stop').textContent = 'Stop recording';
    show('sr-rec', true);
    S.timer = setInterval(tick, 250);
  } catch (e) {
    abort('Could not start recording: ' + (e && e.message ? e.message : e), true);
  }
}

function elapsed() { return (S.acc + (S.phase === 'recording' ? performance.now() - S.t0 : 0)) / 1000; }
function tick() { $('sr-time').textContent = fmtTime(elapsed()); }

function abort(msg, bad) {
  try { if (S.rec && S.rec.state !== 'inactive') { S.rec.onstop = null; S.rec.stop(); } } catch (e) { /* ignore */ }
  cleanupCapture();
  S.rec = null; S.chunks = [];
  S.phase = 'idle';
  show('sr-count', false); show('sr-rec', false); show('sr-controls', false); show('sr-setup', true);
  show('sr-stage', false); show('sr-empty', true);
  $('sr-start').disabled = false;
  status(msg, bad);
}

function pauseResume() {
  if (S.phase === 'recording') {
    S.rec.pause(); S.acc += performance.now() - S.t0; S.phase = 'paused';
    $('sr-pause').textContent = 'Resume'; show('sr-rec', false); tick();
    status('Paused. Nothing is being recorded.');
  } else if (S.phase === 'paused') {
    S.rec.resume(); S.t0 = performance.now(); S.phase = 'recording';
    $('sr-pause').textContent = 'Pause'; show('sr-rec', true); status('');
  }
}

function stop() {
  if (S.phase === 'countdown') { S.cancelled = true; return; }
  if (S.phase !== 'recording' && S.phase !== 'paused') return;
  if (S.phase === 'recording') S.acc += performance.now() - S.t0;
  S.phase = 'busy';
  clearInterval(S.timer);
  show('sr-rec', false);
  try { S.rec.requestData(); } catch (e) { /* ignore */ }
  S.rec.stop();
}

/* ---------- finish and preview ---------- */
async function finish() {
  const type = (S.rec && S.rec.mimeType) || S.mime;
  const secs = S.acc / 1000;
  cleanupCapture();
  S.rec = null;
  S.phase = 'idle';
  show('sr-controls', false); show('sr-setup', true); $('sr-start').disabled = false;
  $('sr-pause').textContent = 'Pause';
  if (!S.chunks.length) { show('sr-stage', false); show('sr-empty', true); status('Nothing was recorded. Try again and let it run for a second or two.', true); return; }
  S.blob = new Blob(S.chunks, { type: type.split(';')[0] });
  S.chunks = [];
  S.duration = secs;
  S.url = URL.createObjectURL(S.blob);
  show('sr-stage', false);
  showResult();
  status('Recording saved in this tab. Nothing was uploaded.');
  if (hook()) { hook().out = hook().out || {}; hook().out.blob = S.blob; hook().out.mime = type; hook().out.wallSeconds = secs; }
  /* Measure the real duration of the file with mediabunny. */
  try {
    const d = await readDuration(S.blob);
    if (S.blob) { S.duration = d || secs; $('sr-meta').textContent = metaText(S.blob, S.duration); }
    if (hook()) hook().out.duration = d;
  } catch (e) { /* keep wall clock estimate */ }
}

function metaText(blob, dur) { return labelOf(extOf(blob.type)) + ' · ' + fmtTime(dur) + ' · ' + fmtSize(blob.size); }

async function readDuration(blob) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try { return await input.computeDuration(); } finally { if (input.dispose) input.dispose(); }
}

function fixInfinity(v) {
  v.addEventListener('loadedmetadata', function f() {
    v.removeEventListener('loadedmetadata', f);
    if (v.duration === Infinity) {
      v.currentTime = 1e101;
      v.addEventListener('timeupdate', function g() { v.removeEventListener('timeupdate', g); v.currentTime = 0; });
    }
  });
}

function showResult() {
  const v = $('sr-result-video');
  v.pause(); v.removeAttribute('src');
  const useMp4 = !!S.mp4;
  v.src = useMp4 ? S.urlMp4 : S.url;
  fixInfinity(v);
  v.load();
  show('sr-result', true);
  const native = extOf(S.blob.type);
  $('sr-meta').textContent = metaText(useMp4 ? S.mp4 : S.blob, useMp4 ? S.mp4Duration : S.duration);
  $('sr-dl').textContent = 'Download ' + labelOf(native);
  $('sr-convert').textContent = native === 'mp4' ? 'Fix duration and save as MP4' : 'Convert to MP4';
  show('sr-dl-mp4', useMp4);
  show('sr-dl', !(useMp4 && native === 'mp4'));
  $('sr-convert').hidden = useMp4;
}

function clearResult() {
  const v = $('sr-result-video');
  v.pause(); v.removeAttribute('src'); v.load();
  if (S.url) URL.revokeObjectURL(S.url);
  if (S.urlMp4) URL.revokeObjectURL(S.urlMp4);
  S.url = S.urlMp4 = null; S.blob = S.mp4 = null;
  show('sr-result', false); show('sr-convprog', false);
  if (hook() && hook().out) hook().out = {};
}

/* ---------- download and convert ---------- */
function save(blob, name) {
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
function baseName() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return 'screen-recording-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
$('sr-dl').addEventListener('click', () => {
  if (!S.blob) return;
  if (hook()) { hook().out = hook().out || {}; hook().out.downloaded = (hook().out.downloaded || 0) + 1; }
  save(S.blob, baseName() + '.' + extOf(S.blob.type));
});
$('sr-dl-mp4').addEventListener('click', () => {
  if (!S.mp4) return;
  if (hook()) { hook().out = hook().out || {}; hook().out.downloadedMp4 = (hook().out.downloadedMp4 || 0) + 1; }
  save(S.mp4, baseName() + '.mp4');
});

let conv = null;
async function convert() {
  if (!S.blob || conv) return;
  const hasVT = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
  if (!hasVT) { status('This browser cannot convert video to MP4. Use Chrome or Edge, or download the WebM.', true); return; }
  $('sr-convert').disabled = true; $('sr-dl').disabled = true;
  show('sr-convprog', true);
  $('sr-cpl').textContent = 'Converting to MP4... 0%'; $('sr-cpb').style.width = '0%';
  status('');
  let input;
  try {
    input = new Input({ source: new BlobSource(S.blob), formats: ALL_FORMATS });
    const vt = await input.getPrimaryVideoTrack();
    const w = vt ? vt.displayWidth : 0, h = vt ? vt.displayHeight : 0;
    const video = { codec: 'avc' };
    if (w && h && (w % 2 || h % 2)) { video.width = w - (w % 2); video.height = h - (h % 2); video.fit = 'fill'; }
    if (!(await canEncodeVideo('avc', { width: video.width || w || 1280, height: video.height || h || 720, bitrate: 6e6 }))) delete video.codec;
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    conv = await Conversion.init({ input, output, video, audio: { codec: 'aac', bitrate: 128000 }, showWarnings: false });
    if (!conv.isValid) throw new Error('This recording cannot be converted in your browser.');
    conv.onProgress = (p) => {
      $('sr-cpb').style.width = (p * 100) + '%';
      $('sr-cpl').textContent = 'Converting to MP4... ' + Math.floor(p * 100) + '%';
    };
    await conv.execute();
    const mp4 = new Blob([target.buffer], { type: 'video/mp4' });
    const dur = await readDuration(mp4);
    if (S.urlMp4) URL.revokeObjectURL(S.urlMp4);
    S.mp4 = mp4; S.urlMp4 = URL.createObjectURL(mp4); S.mp4Duration = dur || S.duration;
    if (hook()) { hook().out = hook().out || {}; hook().out.mp4 = mp4; hook().out.mp4Duration = dur; }
    showResult();
    status('Done. The MP4 plays on almost every phone, computer and editor.');
  } catch (e) {
    const cancelled = e && /cancel/i.test(e.name || e.message || '');
    status(cancelled ? 'Conversion stopped.' : 'The MP4 conversion failed: ' + (e && e.message ? e.message : e) + ' You can still download the WebM.', !cancelled);
  } finally {
    conv = null;
    if (input && input.dispose) input.dispose();
    show('sr-convprog', false);
    $('sr-convert').disabled = false; $('sr-dl').disabled = false;
  }
}
$('sr-convert').addEventListener('click', convert);
$('sr-cstop').addEventListener('click', () => { if (conv) conv.cancel(); });

$('sr-start').addEventListener('click', start);
$('sr-pause').addEventListener('click', pauseResume);
$('sr-stop').addEventListener('click', stop);
$('sr-again').addEventListener('click', () => { clearResult(); show('sr-empty', true); status(''); });
window.addEventListener('pagehide', () => { cleanupCapture(); });
