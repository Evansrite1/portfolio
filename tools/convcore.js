/* Plain logic for the video converter: input detection, the outputs each input allows, presets and file names.
   No browser or media library code here, so it can be tested on its own. */

export const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'aif', 'aiff', 'weba', 'wma'];
export const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', '3gp', 'ts', 'mts', 'm2ts', 'wmv', 'flv', 'ogv'];
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'heic', 'heif', 'avif', 'svg', 'tif', 'tiff'];

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

/* A first guess from the file name and type, before the file is opened. */
export function guessKind(name, type) {
  const ext = extOf(name), t = String(type || '').toLowerCase();
  if (t === 'image/gif' || ext === 'gif') return 'gif';
  if (t.startsWith('image/') || IMAGE_EXT.includes(ext)) return 'image';
  if (t.startsWith('audio/') || AUDIO_EXT.includes(ext)) return 'audio';
  if (t.startsWith('video/') || VIDEO_EXT.includes(ext)) return 'video';
  return 'unknown';
}

/* The real kind, from what the media library found inside the file. */
export function kindFromInfo(info) {
  if (!info) return null;
  if (info.hasVideo) return 'video';
  if (info.hasAudio) return 'audio';
  return null;
}

export const TARGETS = {
  mp4: { label: 'MP4', sub: 'works everywhere', group: 'video', ext: 'mp4', mime: 'video/mp4', codecs: ['avc', 'vp9', 'av1'] },
  webm: { label: 'WebM', sub: 'web video', group: 'video', ext: 'webm', mime: 'video/webm', codecs: ['vp9', 'av1'] },
  mov: { label: 'MOV', sub: 'Apple and editors', group: 'video', ext: 'mov', mime: 'video/quicktime', codecs: ['avc'] },
  mkv: { label: 'MKV', sub: 'flexible container', group: 'video', ext: 'mkv', mime: 'video/x-matroska', codecs: ['avc', 'vp9', 'av1'] },
  cover: { label: 'MP4 video', sub: 'sound with a picture', group: 'cover', ext: 'mp4', mime: 'video/mp4', codecs: ['avc'] },
  gif: { label: 'GIF', sub: 'short, silent, loops', group: 'gif', ext: 'gif', mime: 'image/gif' },
  mp3: { label: 'MP3', sub: 'small, plays everywhere', group: 'audio', ext: 'mp3', mime: 'audio/mpeg', codec: 'mp3' },
  wav: { label: 'WAV', sub: 'uncompressed, large', group: 'audio', ext: 'wav', mime: 'audio/wav', codec: 'pcm-s16' },
  m4a: { label: 'M4A', sub: 'AAC, Apple and phones', group: 'audio', ext: 'm4a', mime: 'audio/mp4', codec: 'aac' },
  ogg: { label: 'OGG', sub: 'Opus, small', group: 'audio', ext: 'ogg', mime: 'audio/ogg', codec: 'opus' }
};

/* Which outputs make sense for an input. caps: { video: {avc, vp9, av1}, aac, opus, gifDecode }. */
export function outputsFor(kind, info, caps) {
  caps = caps || {};
  const v = caps.video || {};
  const anyCodec = (id) => TARGETS[id].codecs.some((c) => v[c]);
  const audioOut = () => ['mp3', 'wav'].concat(caps.aac ? ['m4a'] : [], caps.opus ? ['ogg'] : []);
  if (kind === 'video') {
    const out = ['mp4', 'webm', 'mov', 'mkv'].filter(anyCodec);
    out.push('gif');
    if (!info || info.hasAudio) out.push(...audioOut());
    return out;
  }
  if (kind === 'audio') return (v.avc ? ['cover'] : []).concat(audioOut());
  if (kind === 'gif') return caps.gifDecode ? ['mp4', 'webm'].filter(anyCodec) : [];
  return [];
}

export function defaultTarget(kind, name, list) {
  const pick = (id) => (list.includes(id) ? id : list[0] || null);
  if (kind === 'audio') return pick(extOf(name) === 'mp3' ? 'cover' : 'mp3');
  return pick('mp4');
}

export const VIDEO_PRESETS = {
  whatsapp: { label: 'WhatsApp', sub: 'MP4, 720p, sends fast', fmt: 'mp4', codec: 'avc', res: 720, q: 'balanced' },
  instagram: { label: 'Instagram', sub: 'MP4, 1080p, high', fmt: 'mp4', codec: 'avc', res: 1080, q: 'high' },
  youtube: { label: 'YouTube', sub: 'MP4, full size, high', fmt: 'mp4', codec: 'avc', res: 0, q: 'high' },
  small: { label: 'Smaller file', sub: 'MP4, 480p, small', fmt: 'mp4', codec: 'avc', res: 480, q: 'small' }
};

export const COVER_SIZES = {
  square: { label: 'Square', sub: '1080 x 1080', w: 1080, h: 1080 },
  landscape: { label: 'Landscape', sub: '1920 x 1080', w: 1920, h: 1080 },
  portrait: { label: 'Portrait', sub: '1080 x 1920', w: 1080, h: 1920 }
};
export const COVER_PRESETS = {
  whatsapp: { label: 'WhatsApp', sub: 'square, sends fast', size: 'square', q: 'balanced' },
  instagram: { label: 'Instagram', sub: 'portrait, Reels', size: 'portrait', q: 'high' },
  youtube: { label: 'YouTube', sub: 'landscape, high', size: 'landscape', q: 'high' },
  small: { label: 'Smaller file', sub: 'square, small', size: 'square', q: 'small' }
};

export const BITRATES = {
  mp3: { list: [128, 192, 256, 320], def: 192 },
  m4a: { list: [96, 128, 192, 256], def: 192 },
  ogg: { list: [64, 96, 128, 192], def: 128 }
};
export const BITRATE_WORDS = ['small', 'good', 'great', 'best'];

export const GIF_WIDTHS = [320, 480, 640];
export const GIF_FPS = [10, 15];
export const GIF_MAX_SECONDS = 30;

/* Resolution options for a video: keep original, then the common sizes smaller than it. */
export function resOptions(width, height) {
  const short = Math.min(width, height);
  const out = [{ value: 0, label: 'Keep original (' + short + 'p)' }];
  [1080, 720, 480].forEach((p) => { if (p < short) out.push({ value: p, label: p + 'p' }); });
  return out;
}
/* A preset's resolution, or 0 (keep) when the video is already that small. */
export function presetRes(preset, width, height) {
  const short = Math.min(width, height);
  return preset.res && preset.res < short ? preset.res : 0;
}

/* The short side of the picture decides "720p", so portrait videos work too. Sizes are even for H.264. */
export function scaledSize(width, height, target) {
  if (!target) return { width, height };
  const k = target / Math.min(width, height);
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(width * k), height: even(height * k) };
}
/* Fits a picture inside a box of the given width, never larger than the original, keeping the shape. */
export function fitWidth(width, height, maxW) {
  const w = Math.min(maxW, width);
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(w), height: even(height * w / width) };
}

export function parseTime(txt) {
  txt = String(txt || '').trim().replace(',', '.');
  if (!txt) return NaN;
  const parts = txt.split(':');
  if (parts.length > 3 || parts.some((p) => p === '' || isNaN(+p) || +p < 0)) return NaN;
  return parts.reduce((a, p) => a * 60 + +p, 0);
}

/* Reads the optional trim boxes. Returns [start, end] in seconds or throws a plain message. */
export function readRange(startTxt, endTxt, duration) {
  const sT = String(startTxt || '').trim(), eT = String(endTxt || '').trim();
  let s = sT ? parseTime(sT) : 0, e = eT ? parseTime(eT) : duration;
  if (isNaN(s) || isNaN(e)) throw new Error('Start and end must be times like 1:30 or 75.5.');
  s = Math.max(0, s); e = Math.min(duration, e);
  if (e - s < 0.2) throw new Error('The end time must be after the start time, and both must be inside the file.');
  return [s, e];
}
export function isTrimmed(s, e, duration) { return s > 0.01 || e < duration - 0.01; }

/* Output file name: the original name with the new extension. */
export function outName(fileName, target, opts) {
  opts = opts || {};
  const T = TARGETS[target];
  let base = String(fileName || '').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'media';
  if (opts.trimmed) base += '-clip';
  if (target === 'cover') base += '-video';
  else if (T.ext === extOf(fileName) && !opts.trimmed) base += '-converted';
  return base + '.' + T.ext;
}

/* Bar heights for the waveform animation: level is 0..1 now, hist holds recent levels, newest last. */
export function barHeights(hist, bars) {
  const out = new Array(bars);
  const mid = (bars - 1) / 2;
  for (let i = 0; i < bars; i++) {
    const back = Math.round(Math.abs(i - mid));
    const v = hist.length ? hist[Math.max(0, hist.length - 1 - back)] : 0;
    out[i] = Math.min(1, Math.max(0.04, v));
  }
  return out;
}

/* Splits a title into lines that fit, using a measure(text) function for the width. */
export function wrapText(text, maxWidth, measure, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (measure(next) <= maxWidth || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (maxLines && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] += '...';
    return kept;
  }
  return lines;
}
