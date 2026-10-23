/* Shared helpers for the video to MP3, video trimmer and video converter tools. */
import {
  Input, ALL_FORMATS, BlobSource, Mp4InputFormat, QuickTimeInputFormat, MatroskaInputFormat, WebMInputFormat
} from '/tools/vendor/mediabunny/mediabunny.min.mjs';

export const $ = (id) => document.getElementById(id);
export const show = (id, on) => { $(id).hidden = !on; };

export const supported = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined'
  && typeof AudioEncoder !== 'undefined' && typeof AudioDecoder !== 'undefined';
export const NO_SUPPORT = 'This browser cannot process media. Please open this page in Chrome, Edge or another up to date Chromium browser on a computer.';

export function fmtSize(bytes) {
  const mb = bytes / 1048576;
  if (mb >= 1000) return (mb / 1024).toFixed(2) + ' GB';
  if (mb >= 10) return Math.round(mb) + ' MB';
  if (mb >= 0.1) return mb.toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
export function fmtTime(s, dec) {
  s = Math.max(0, s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const secTxt = dec ? sec.toFixed(1).padStart(4, '0') : String(Math.floor(sec)).padStart(2, '0');
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + secTxt;
}
/* Accepts 90, 1:30, 1:30.5, 0:01:30 and returns seconds, or NaN. */
export function parseTime(txt) {
  txt = String(txt || '').trim().replace(',', '.');
  if (!txt) return NaN;
  const parts = txt.split(':');
  if (parts.length > 3 || parts.some((p) => p === '' || isNaN(+p) || +p < 0)) return NaN;
  return parts.reduce((a, p) => a * 60 + +p, 0);
}

export function setStatus(id, msg, bad) {
  const el = $(id);
  el.textContent = msg || '';
  el.classList.toggle('mt-err', !!bad);
}

export function wireDrop(prefix, onFile) {
  const drop = $(prefix + '-drop'), input = $(prefix + '-file');
  $(prefix + '-pick').addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
  input.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) onFile(f); });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) onFile(f); });
  drop.addEventListener('click', () => input.click());
}

/* Reads a file's basic facts. Always disposes the Input. */
export async function probe(file) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const info = { hasVideo: false, hasAudio: false, duration: 0, width: 0, height: 0, fps: 0, container: 'other', containerName: '' };
    const vt = await input.getPrimaryVideoTrack();
    const at = await input.getPrimaryAudioTrack();
    if (!vt && !at) throw new Error('no media track');
    info.hasVideo = !!vt; info.hasAudio = !!at;
    info.duration = await input.computeDuration();
    if (vt) {
      info.width = vt.displayWidth; info.height = vt.displayHeight;
      info.videoCodec = vt.codec || null;
      try { const s = await vt.computePacketStats(120); info.fps = Math.round(s.averagePacketRate); } catch (e) { info.fps = 0; }
    }
    if (at) { info.audioCodec = at.codec || null; info.channels = at.numberOfChannels; info.sampleRate = at.sampleRate; }
    const f = await input.getFormat();
    info.containerName = f.name;
    if (f instanceof WebMInputFormat) info.container = 'webm';
    else if (f instanceof MatroskaInputFormat) info.container = 'mkv';
    else if (f instanceof QuickTimeInputFormat) info.container = 'mov';
    else if (f instanceof Mp4InputFormat) info.container = 'mp4';
    return info;
  } finally {
    if (input.dispose) input.dispose();
  }
}

export function baseName(file) { return file.name.replace(/\.[^.]+$/, '') || 'media'; }

export function errText(e) { return e && e.message ? e.message : String(e); }
export function isCancel(e) { return !!e && (/cancel/i.test(e.name || '') || /cancel/i.test(e.message || '')); }

/* Makes a download row. Returns {row, url}. */
export function downloadRow(blob, filename, detail, primary) {
  const url = URL.createObjectURL(blob);
  const row = document.createElement('div');
  row.className = 'mt-part';
  const left = document.createElement('span');
  const b = document.createElement('b'), s = document.createElement('small');
  b.textContent = filename; s.textContent = detail;
  left.appendChild(b); left.appendChild(s);
  const a = document.createElement('a');
  a.className = 'btn' + (primary ? ' primary' : '');
  a.href = url; a.download = filename; a.textContent = 'Download';
  row.appendChild(left); row.appendChild(a);
  return { row, url };
}

export function progressUI(prefix) {
  const t0 = { v: 0 };
  return {
    start(verb) {
      t0.v = Date.now();
      $(prefix + '-pb').style.width = '0%';
      $(prefix + '-pl').textContent = (verb || 'Working') + '... 0%';
      show(prefix + '-progress', true);
    },
    update(frac, verb) {
      const p = Math.min(1, Math.max(0, frac));
      $(prefix + '-pb').style.width = (p * 100) + '%';
      $(prefix + '-bar').setAttribute('aria-valuenow', String(Math.floor(p * 100)));
      const el = (Date.now() - t0.v) / 1000;
      const eta = p > 0.03 ? Math.max(0, el / p - el) : null;
      $(prefix + '-pl').textContent = (verb || 'Working') + '... ' + Math.floor(p * 100) + '%' + (eta !== null && eta > 2 ? ', about ' + fmtTime(eta) + ' left' : '');
    },
    stop() { show(prefix + '-progress', false); }
  };
}
