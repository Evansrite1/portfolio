import {
  Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget,
  Mp4OutputFormat, MovOutputFormat, MkvOutputFormat, WebMOutputFormat, Mp3OutputFormat, WavOutputFormat,
  canEncodeVideo, QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_LOW
} from '/tools/vendor/mediabunny/mediabunny.min.mjs';
import {
  $, show, supported, NO_SUPPORT, fmtSize, fmtTime, setStatus, wireDrop, probe,
  baseName, errText, isCancel, downloadRow, progressUI
} from '/tools/vmcommon.js';

const FORMATS = {
  mp4: { make: () => new Mp4OutputFormat(), mime: 'video/mp4', label: 'MP4', codecs: ['avc', 'vp9', 'av1'] },
  webm: { make: () => new WebMOutputFormat(), mime: 'video/webm', label: 'WebM', codecs: ['vp9', 'av1'] },
  mkv: { make: () => new MkvOutputFormat(), mime: 'video/x-matroska', label: 'MKV', codecs: ['avc', 'vp9', 'av1'] },
  mov: { make: () => new MovOutputFormat(), mime: 'video/quicktime', label: 'MOV', codecs: ['avc'] },
  mp3: { make: () => new Mp3OutputFormat(), mime: 'audio/mpeg', label: 'MP3', audio: true },
  wav: { make: () => new WavOutputFormat(), mime: 'audio/wav', label: 'WAV', audio: true }
};
const CODEC_NAMES = { avc: 'H.264 (works everywhere)', vp9: 'VP9 (good for the web)', av1: 'AV1 (smallest, slow)' };
const QUALITY = { high: QUALITY_HIGH, balanced: QUALITY_MEDIUM, small: QUALITY_LOW };
const Q_HELP = {
  high: 'High keeps the most detail. The file is larger.',
  balanced: 'Balanced is a good choice for most videos.',
  small: 'Small makes the smallest file with some loss of detail.',
  copy: 'Fast copy does not re-encode the video. It is quick and keeps the quality, but it ignores the resolution and codec choices and only works when the new format supports the video inside.'
};

const st = {
  file: null, url: null, info: null, fmt: 'mp4', q: 'balanced', canEnc: {}, conv: null, outUrl: null, running: false
};
const prog = progressUI('cv');
const say = (msg, bad) => setStatus('cv-status', msg, bad);
let mp3Ready = null;
if (!supported) say(NO_SUPPORT, true);

function ensureMp3Encoder() {
  if (!mp3Ready) mp3Ready = import('/tools/vendor/mediabunny/mp3-encoder.min.mjs').then((m) => m.registerMp3Encoder());
  return mp3Ready;
}

/* The short side of the picture decides "720p" and so on, so portrait videos work too. */
function scaledSize(target) {
  const w = st.info.width, h = st.info.height;
  if (!target) return { width: w, height: h };
  const k = target / Math.min(w, h);
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(w * k), height: even(h * k) };
}

async function loadFile(file) {
  if (!file || st.running) return;
  if (!supported) { say(NO_SUPPORT, true); return; }
  say('Reading your file...');
  let info;
  try { info = await probe(file); } catch (e) {
    say('That file could not be read. Try an MP4, MOV, MKV or WebM file.', true);
    return;
  }
  clearOutput();
  if (st.url) URL.revokeObjectURL(st.url);
  st.file = file; st.info = info; st.url = URL.createObjectURL(file);
  $('cv-name').textContent = file.name;
  $('cv-meta').textContent = [fmtSize(file.size), info.hasVideo ? info.width + 'x' + info.height : 'audio only', fmtTime(info.duration), info.fps ? info.fps + ' fps' : null].filter(Boolean).join(' · ');

  const sel = $('cv-res');
  sel.innerHTML = '';
  const short = Math.min(info.width, info.height);
  const opts = [['0', info.hasVideo ? 'Keep original (' + short + 'p)' : 'Keep original']];
  [1080, 720, 480].forEach((p) => { if (info.hasVideo && p < short) opts.push([String(p), p + 'p']); });
  opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); });

  st.canEnc = {};
  if (info.hasVideo) {
    for (const c of ['avc', 'vp9', 'av1']) {
      try { st.canEnc[c] = await canEncodeVideo(c, { width: info.width, height: info.height }); } catch (e) { st.canEnc[c] = false; }
    }
  }
  $('cv-video').src = st.url;
  show('cv-drop', false); show('cv-controls', true); show('cv-stage', true); show('cv-empty', false);
  show('cv-rstage', false); show('cv-result', false);
  say(info.hasVideo ? '' : 'This file has no video, so only MP3 and WAV are possible.');
  setFormat(info.hasVideo ? st.fmt : 'mp3');
}

function setFormat(f) {
  st.fmt = f;
  document.querySelectorAll('#cv-fmt button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.fmt === f));
    if (st.info && !st.info.hasVideo) b.disabled = !FORMATS[b.dataset.fmt].audio;
    else b.disabled = false;
  });
  refresh();
}

function refresh() {
  const F = FORMATS[st.fmt];
  show('cv-video-opts', !F.audio);
  show('cv-mp3-opts', st.fmt === 'mp3');
  $('cv-go').textContent = 'Convert to ' + F.label;
  $('cv-go').disabled = false;
  if (!F.audio) {
    const codecSel = $('cv-codec');
    const prev = codecSel.value;
    codecSel.innerHTML = '';
    F.codecs.filter((c) => st.canEnc[c]).forEach((c) => {
      const o = document.createElement('option'); o.value = c; o.textContent = CODEC_NAMES[c]; codecSel.appendChild(o);
    });
    if ([...codecSel.options].some((o) => o.value === prev)) codecSel.value = prev;
    const none = codecSel.options.length === 0;
    if (none && st.q !== 'copy') {
      say('Your browser cannot encode video for ' + F.label + '. Try Fast copy, another format, or Chrome or Edge on a computer.', true);
      $('cv-go').disabled = true;
    } else if (st.info && st.info.hasVideo) say('');
    const copy = st.q === 'copy';
    codecSel.disabled = copy; $('cv-res').disabled = copy;
    $('cv-q-help').textContent = Q_HELP[st.q];
  }
}

async function run() {
  if (!st.file || st.running) return;
  const F = FORMATS[st.fmt], info = st.info;
  clearOutput();
  say('');
  if (F.audio && !info.hasAudio) { say('This file has no audio track, so there is nothing to extract.', true); return; }
  if (!F.audio && !info.hasVideo) { say('This file has no video. Choose MP3 or WAV instead.', true); return; }
  st.running = true;
  show('cv-controls', false); show('cv-result', false);
  prog.start('Converting');
  let input;
  try {
    input = new Input({ source: new BlobSource(st.file), formats: ALL_FORMATS });
    const target = new BufferTarget();
    const output = new Output({ format: F.make(), target });
    const opts = { input, output, showWarnings: false };
    let note;
    if (F.audio) {
      opts.video = { discard: true };
      if (st.fmt === 'mp3') {
        await ensureMp3Encoder();
        const a = { codec: 'mp3', bitrate: (+$('cv-kbps').value) * 1000, forceTranscode: true };
        if (![32000, 44100, 48000].includes(info.sampleRate)) a.sampleRate = 44100;
        if (info.channels > 2) a.numberOfChannels = 2;
        opts.audio = a;
        note = 'Audio saved as MP3 at ' + $('cv-kbps').value + ' kbps.';
      } else {
        opts.audio = { codec: 'pcm-s16', forceTranscode: true };
        note = 'Audio saved as uncompressed WAV.';
      }
    } else if (st.q === 'copy') {
      opts.copy = { mode: 'preferred' };
      note = 'Fast copy: the video was moved into ' + F.label + ' without re-encoding where the codec fits.';
    } else {
      const codec = $('cv-codec').value;
      const size = scaledSize(+$('cv-res').value);
      if (!(await canEncodeVideo(codec, size))) throw new Error('Your browser cannot encode ' + CODEC_NAMES[codec].split(' (')[0] + ' video at ' + size.width + 'x' + size.height + '. Pick another codec or a smaller resolution.');
      const video = { codec, quality: QUALITY[st.q], forceTranscode: true };
      if (+$('cv-res').value) { video.width = size.width; video.height = size.height; video.fit = 'contain'; }
      opts.video = video;
      note = 'Converted to ' + F.label + ' with ' + CODEC_NAMES[codec].split(' (')[0] + ', ' + st.q + ' quality, ' + size.width + 'x' + size.height + '.';
    }
    const conv = await Conversion.init(opts);
    if (!conv.isValid) throw new Error('This file cannot be converted to ' + F.label + ' in your browser.');
    const lost = conv.discardedTracks.filter((d) => d.reason !== 'discarded_by_user' && (d.track.isVideoTrack() || d.track.isAudioTrack()));
    if (lost.length && !F.audio) note += ' Note: ' + lost.length + ' track(s) could not be kept.';
    st.conv = conv;
    conv.onProgress = (p) => prog.update(p, 'Converting');
    await conv.execute();
    st.conv = null;
    showResult(new Blob([target.buffer], { type: F.mime }), F, note);
  } catch (e) {
    prog.stop(); show('cv-controls', true);
    if (isCancel(e)) say('Stopped.');
    else say('Something went wrong: ' + errText(e), true);
  } finally {
    st.conv = null; st.running = false;
    if (input && input.dispose) input.dispose();
  }
}

function showResult(blob, F, note) {
  prog.stop(); show('cv-result', true);
  $('cv-before').textContent = fmtSize(st.file.size);
  $('cv-after').textContent = fmtSize(blob.size);
  const change = Math.round((1 - blob.size / st.file.size) * 100);
  $('cv-save').textContent = change > 0 ? change + '% smaller' : (change < 0 ? Math.abs(change) + '% larger' : 'Same size');
  $('cv-note').textContent = note;
  const name = baseName(st.file) + '-converted.' + st.fmt;
  const box = $('cv-parts');
  box.innerHTML = '';
  const { row, url } = downloadRow(blob, name, F.label + ' · ' + fmtSize(blob.size), true);
  st.outUrl = url;
  box.appendChild(row);
  $('cv-result-preview').src = url;
  show('cv-stage', false); show('cv-rstage', true);
}

function clearOutput() {
  if (st.outUrl) URL.revokeObjectURL(st.outUrl);
  st.outUrl = null;
  $('cv-result-preview').removeAttribute('src');
  $('cv-parts').innerHTML = '';
}

function resetAll() {
  if (st.running) return;
  clearOutput();
  if (st.url) URL.revokeObjectURL(st.url);
  st.url = null; st.file = null; st.info = null;
  $('cv-video').removeAttribute('src');
  $('cv-file').value = '';
  show('cv-result', false); show('cv-progress', false); show('cv-controls', false);
  show('cv-rstage', false); show('cv-stage', false);
  show('cv-drop', true); show('cv-empty', true);
  say('');
}

wireDrop('cv', loadFile);
document.querySelectorAll('#cv-fmt button').forEach((b) => b.addEventListener('click', () => setFormat(b.dataset.fmt)));
document.querySelectorAll('#cv-q button').forEach((b) => b.addEventListener('click', () => {
  st.q = b.dataset.q;
  document.querySelectorAll('#cv-q button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  refresh();
}));
$('cv-go').addEventListener('click', run);
$('cv-stop').addEventListener('click', () => { if (st.conv) st.conv.cancel(); });
$('cv-reset').addEventListener('click', resetAll);
$('cv-again').addEventListener('click', resetAll);
window.__cv = { st, loadFile, run };
