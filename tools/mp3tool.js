import {
  Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, Mp3OutputFormat, WavOutputFormat
} from '/tools/vendor/mediabunny/mediabunny.min.mjs';
import {
  $, show, supported, NO_SUPPORT, fmtSize, fmtTime, parseTime, setStatus, wireDrop, probe,
  baseName, errText, isCancel, downloadRow, progressUI
} from '/tools/vmcommon.js';

const st = { file: null, url: null, info: null, fmt: 'mp3', kbps: 192, conv: null, outUrl: null, running: false };
const prog = progressUI('m3');
const say = (msg, bad) => setStatus('m3-status', msg, bad);
let mp3Ready = null;

if (!supported) say(NO_SUPPORT, true);

function ensureMp3Encoder() {
  if (!mp3Ready) {
    mp3Ready = import('/tools/vendor/mediabunny/mp3-encoder.min.mjs').then((m) => m.registerMp3Encoder());
  }
  return mp3Ready;
}

function updateGoLabel() {
  $('m3-go').textContent = st.fmt === 'mp3' ? 'Convert to MP3' : 'Convert to WAV';
  show('m3-br-wrap', st.fmt === 'mp3');
}

async function loadFile(file) {
  if (!file || st.running) return;
  if (!supported) { say(NO_SUPPORT, true); return; }
  say('Reading your file...');
  let info;
  try {
    info = await probe(file);
  } catch (e) {
    say('That file could not be read. Try an MP4, MOV, MKV, WebM, WAV or M4A file.', true);
    return;
  }
  if (!info.hasAudio) {
    say('This file has no audio track, so there is nothing to extract.', true);
    return;
  }
  clearOutput();
  if (st.url) URL.revokeObjectURL(st.url);
  st.file = file; st.info = info;
  st.url = URL.createObjectURL(file);
  $('m3-name').textContent = file.name;
  $('m3-meta').textContent = [fmtSize(file.size), fmtTime(info.duration), info.hasVideo ? 'video with audio' : 'audio only'].join(' · ');
  $('m3-start').value = '';
  $('m3-end').value = '';
  $('m3-end').placeholder = fmtTime(info.duration, true);
  $('m3-player').src = st.url;
  show('m3-drop', false); show('m3-controls', true); show('m3-playwrap', true); show('m3-empty', false);
  show('m3-result', false);
  say('');
}

function readRange() {
  const d = st.info.duration;
  const sTxt = $('m3-start').value.trim(), eTxt = $('m3-end').value.trim();
  let s = sTxt ? parseTime(sTxt) : 0, e = eTxt ? parseTime(eTxt) : d;
  if (isNaN(s) || isNaN(e)) throw new Error('Start and end must be times like 1:30 or 75.5.');
  s = Math.max(0, s); e = Math.min(d, e);
  if (e - s < 0.2) throw new Error('The end time must be after the start time, and the range must be inside the file (length ' + fmtTime(d, true) + ').');
  return [s, e];
}

async function run() {
  if (!st.file || st.running) return;
  let range;
  try { range = readRange(); } catch (e) { say(errText(e), true); return; }
  const [s, e] = range;
  clearOutput();
  st.running = true;
  say('');
  show('m3-controls', false); show('m3-result', false);
  prog.start('Converting');
  let input;
  try {
    const mp3 = st.fmt === 'mp3';
    if (mp3) await ensureMp3Encoder();
    input = new Input({ source: new BlobSource(st.file), formats: ALL_FORMATS });
    const target = new BufferTarget();
    const output = new Output({ format: mp3 ? new Mp3OutputFormat() : new WavOutputFormat(), target });
    const audio = mp3 ? { codec: 'mp3', bitrate: st.kbps * 1000, forceTranscode: true } : { codec: 'pcm-s16', forceTranscode: true };
    const sr = st.info.sampleRate, ch = st.info.channels;
    if (mp3 && ![32000, 44100, 48000].includes(sr)) audio.sampleRate = 44100;
    if (mp3 && ch > 2) audio.numberOfChannels = 2;
    const opts = { input, output, video: { discard: true }, audio, showWarnings: false };
    if (s > 0.01 || e < st.info.duration - 0.01) opts.trim = { start: s, end: e };
    const conv = await Conversion.init(opts);
    if (!conv.isValid) throw new Error('Your browser cannot read or write the audio in this file.');
    st.conv = conv;
    conv.onProgress = (p) => prog.update(p, 'Converting');
    await conv.execute();
    st.conv = null;
    const blob = new Blob([target.buffer], { type: mp3 ? 'audio/mpeg' : 'audio/wav' });
    showResult(blob, mp3 ? 'mp3' : 'wav', s, e);
  } catch (err) {
    prog.stop(); show('m3-controls', true);
    if (isCancel(err)) say('Stopped.');
    else say('Something went wrong: ' + errText(err) + ' Try another file or format.', true);
  } finally {
    st.conv = null; st.running = false;
    if (input && input.dispose) input.dispose();
  }
}

function showResult(blob, ext, s, e) {
  prog.stop(); show('m3-result', true);
  const name = baseName(st.file) + (s > 0.01 || e < st.info.duration - 0.01 ? '-clip' : '') + '.' + ext;
  $('m3-dur').textContent = fmtTime(e - s, true);
  $('m3-size').textContent = fmtSize(blob.size);
  $('m3-fmtout').textContent = ext === 'mp3' ? 'MP3 ' + st.kbps + ' kbps' : 'WAV';
  const box = $('m3-parts');
  box.innerHTML = '';
  const { row, url } = downloadRow(blob, name, fmtTime(e - s, true) + ' · ' + fmtSize(blob.size), true);
  st.outUrl = url;
  box.appendChild(row);
  $('m3-result-player').src = url;
  show('m3-controls', false);
}

function clearOutput() {
  if (st.outUrl) URL.revokeObjectURL(st.outUrl);
  st.outUrl = null;
  $('m3-result-player').removeAttribute('src');
  $('m3-parts').innerHTML = '';
}

function resetAll() {
  if (st.running) return;
  clearOutput();
  if (st.url) URL.revokeObjectURL(st.url);
  st.url = null; st.file = null; st.info = null;
  $('m3-player').removeAttribute('src');
  $('m3-file').value = '';
  show('m3-result', false); show('m3-progress', false); show('m3-controls', false); show('m3-playwrap', false);
  show('m3-drop', true); show('m3-empty', true);
  say('');
}

wireDrop('m3', loadFile);
document.querySelectorAll('#m3-fmt button').forEach((b) => b.addEventListener('click', () => {
  st.fmt = b.dataset.fmt;
  document.querySelectorAll('#m3-fmt button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  updateGoLabel();
}));
document.querySelectorAll('#m3-br button').forEach((b) => b.addEventListener('click', () => {
  st.kbps = +b.dataset.kbps;
  document.querySelectorAll('#m3-br button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));
$('m3-set-start').addEventListener('click', () => { $('m3-start').value = fmtTime($('m3-player').currentTime, true); });
$('m3-set-end').addEventListener('click', () => { $('m3-end').value = fmtTime($('m3-player').currentTime, true); });
$('m3-go').addEventListener('click', run);
$('m3-stop').addEventListener('click', () => { if (st.conv) st.conv.cancel(); });
$('m3-reset').addEventListener('click', resetAll);
$('m3-again').addEventListener('click', resetAll);
updateGoLabel();
window.__m3 = { st, loadFile, run };
