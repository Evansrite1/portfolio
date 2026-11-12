/* The ways a video can be saved out, for the video editor.

   The editor can write an MP4, a WebM, an animated GIF, a set of PNG pictures, and a ProRes
   movie when the browser can make one. It can also write a WebM with a see-through background,
   and a ProRes with alpha, which is what you want when the video goes over something else.

   The frame rate is yours to choose. The common ones are here, and any number between 1 and 60
   can be typed in. */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
import { GifWriter } from '../gifenc.js';

export const EXPORT_FORMATS = [
  { id: 'mp4', name: 'MP4', ext: 'mp4', mime: 'video/mp4', note: 'Plays everywhere. The usual choice.' },
  { id: 'webm', name: 'WebM', ext: 'webm', mime: 'video/webm', note: 'Small file, good on the web.' },
  { id: 'gif', name: 'Animated GIF', ext: 'gif', mime: 'image/gif', note: 'Loops forever. No sound.' },
  { id: 'png', name: 'PNG pictures', ext: 'zip', mime: 'application/zip', note: 'One picture for every frame, in a zip.' },
  { id: 'prores', name: 'ProRes 4444', ext: 'mov', mime: 'video/quicktime', note: 'Big file, made for editing. Keep the background see-through.' },
];

export const FPS_CHOICES = [
  { id: '24', name: '24 fps', note: 'Film' },
  { id: '23.976', name: '23.976 fps', note: 'Film, slow and quiet' },
  { id: '30', name: '30 fps', note: 'Normal' },
  { id: '29.97', name: '29.97 fps', note: 'Normal, slow and quiet' },
  { id: '60', name: '60 fps', note: 'Smooth' },
];

/* The sizes on offer. */
export const RES_CHOICES = [
  { id: '2160', name: '4K', short: '2160p' },
  { id: '1440', name: '2K', short: '1440p' },
  { id: '1080', name: 'Full HD', short: '1080p' },
  { id: '720', name: 'HD', short: '720p' },
  { id: '480', name: 'Small', short: '480p' },
];

/* A rough idea of how big the file will be, so a choice can be made before the work starts. */
export function estimateSize(W, H, fps, durS, bpp) {
  const bytes = (W * H * fps * bpp + 128000) * durS / 8;
  return bytes;
}

export function sizeLabel(n) {
  const mb = n / 1048576;
  if (mb >= 1000) return (mb / 1024).toFixed(2) + ' GB';
  if (mb >= 10) return Math.round(mb) + ' MB';
  return mb.toFixed(1) + ' MB';
}

/* Whether this computer can be trusted with a big job.
   A 4K movie at 120 frames a second asks a lot of a laptop, so the editor says so first. */
export function deviceCheck(W, H, fps) {
  const px = W * H;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const notes = [];
  if (px >= 3840 * 2160 && fps >= 60) {
    notes.push('4K at ' + fps + ' frames a second is a lot. It may take a long time, or run out of memory on a weaker computer. 1080p at 30 frames a second is quicker.');
  } else if (px >= 3840 * 2160) {
    notes.push('4K takes a while to make. 1080p is quicker if you do not need the size.');
  } else if (px >= 2560 * 1440 && fps >= 60) {
    notes.push('2K at ' + fps + ' frames a second may be slow on a weaker computer.');
  }
  if (cores <= 2) notes.push('This computer has few cores, so making the video will take longer.');
  if (mem <= 2) notes.push('This computer has little memory. A smaller size may be needed.');
  return notes;
}

/* Turns a list of RGBA frames into an animated GIF.
   frames: each one is { data: Uint8ClampedArray, delay: number } where delay is in hundredths
   of a second. */
export function buildGif(frames, width, height, loop) {
  const writer = new GifWriter(width, height, loop == null ? 0 : loop);
  for (const f of frames) writer.addFrame(f.data, f.delay);
  return new Blob([writer.finish()], { type: 'image/gif' });
}

/* The zip maker is a small script that is fetched the first time it is needed. */
let ffLoad = null;
function loadFflate() {
  if (window.fflate) return Promise.resolve(window.fflate);
  if (!ffLoad) {
    ffLoad = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '/tools/vendor/fflate/fflate.min.js';
      s.onload = () => res(window.fflate);
      s.onerror = () => { ffLoad = null; rej(new Error('The zip maker did not load.')); };
      document.head.appendChild(s);
    });
  }
  return ffLoad;
}

/* Turns a list of PNG blobs into one zip file. */
export async function buildZip(files) {
  const ff = await loadFflate();
  const entries = {};
  for (const f of files) entries[f.name] = [f.data, { level: 0 }];
  const zipped = ff.zipSync(entries, { level: 0 });
  return new Blob([zipped], { type: 'application/zip' });
}

/* The name of a frame picture, so they come out in order. */
export function frameName(i, total) {
  const n = String(total).length;
  return 'frame-' + String(i).padStart(n, '0') + '.png';
}

/* What the editor should say about a format before it starts. */
export function formatNote(id, alpha) {
  const f = EXPORT_FORMATS.find((x) => x.id === id);
  if (!f) return '';
  let note = f.note;
  if (id === 'webm' && alpha) note = 'WebM with a see-through background. Chrome and Firefox play it, some other programs do not.';
  if (id === 'prores') note = alpha ? 'ProRes 4444 with a see-through background. Big file, made for editing in other programs.' : f.note;
  if (id === 'gif' && alpha) note = 'A GIF cannot have a see-through background.';
  return note;
}

/* Whether the browser can make a given kind of file. */
export async function canMake(mb, id, alpha) {
  if (id === 'gif') return true;
  if (id === 'png') return true;
  if (id === 'mp4') return !!(await mb.canEncodeVideo('avc'));
  if (id === 'webm') return alpha ? !!(await mb.canEncodeVideo('vp9')) : !!(await mb.canEncodeVideo('vp9'));
  if (id === 'prores') return !!(await mb.canEncodeVideo('prores'));
  return false;
}

export { clamp };
