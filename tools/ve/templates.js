/* Templates for the video editor.

   A template is a look you can put on a video: the style of the captions, the style of the
   text, the colour of the picture. Save one from a video that looks right, then use it on the
   next one.

   The templates that come with the editor are the ones in this file. Your own are kept in this
   browser, so they are only on this computer. */
const KEY = 've_templates_v1';

/* The templates that come with the editor. Each one says what to change. */
export const BUILT_IN = [
  {
    id: 'clean',
    name: 'Clean',
    note: 'White captions, plain picture',
    cap: { style: 'minimal', size: 6, y: 76, accent: '', anim: 'fade', emph: false, chunk: '3' },
    text: { font: 'Arial, Helvetica, sans-serif', bold: true, color: '#ffffff', bg: false, outline: false, size: 8 },
    filter: 'none',
  },
  {
    id: 'pop',
    name: 'Loud',
    note: 'Big yellow captions that jump',
    cap: { style: 'pop', size: 8, y: 78, accent: '', anim: 'pop', emph: true, chunk: '2' },
    text: { font: 'Impact, "Arial Black", sans-serif', bold: true, color: '#ffd23f', bg: false, outline: true, size: 10 },
    filter: 'vivid',
  },
  {
    id: 'news',
    name: 'News',
    note: 'Red banner along the bottom',
    cap: { style: 'news', size: 6, y: 80, accent: '', anim: 'slide', emph: true, chunk: '3' },
    text: { font: 'Arial, Helvetica, sans-serif', bold: true, color: '#ffffff', bg: true, outline: false, size: 7 },
    filter: 'contrast',
  },
  {
    id: 'aesthetic',
    name: 'Soft',
    note: 'Pretty serif, pink glow',
    cap: { style: 'aesthetic', size: 6, y: 74, accent: '', anim: 'fade', emph: false, chunk: 'line' },
    text: { font: 'Georgia, "Times New Roman", serif', bold: false, color: '#ff7ad9', bg: false, outline: false, size: 8 },
    filter: 'dreamy',
  },
  {
    id: 'typewriter',
    name: 'Terminal',
    note: 'Green text that types itself out',
    cap: { style: 'typewriter', size: 6, y: 78, accent: '', anim: 'none', emph: false, chunk: '2' },
    text: { font: '"Courier New", monospace', bold: false, color: '#7cff9b', bg: false, outline: false, size: 7 },
    filter: 'noir',
  },
  {
    id: 'cinema',
    name: 'Cinema',
    note: 'Wide spaced letters, dark picture',
    cap: { style: 'cinema', size: 6, y: 80, accent: '', anim: 'fade', emph: false, chunk: 'line' },
    text: { font: 'Georgia, "Times New Roman", serif', bold: false, color: '#f4f4f5', bg: false, outline: true, size: 8 },
    filter: 'cinema',
  },
];

/* The picture filters a template can ask for. */
export const TEMPLATE_FILTERS = {
  none: 'none',
  vivid: 'saturate(1.8) contrast(1.1)',
  contrast: 'contrast(1.25) saturate(.9) brightness(.9)',
  dreamy: 'brightness(1.1) saturate(1.2)',
  noir: 'grayscale(1) contrast(1.2)',
  cinema: 'contrast(1.25) saturate(.9) brightness(.9)',
};

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
}

/* The templates you have made, plus the ones that come with the editor. */
export function allTemplates() {
  return BUILT_IN.concat(read());
}

/* Saves the look of the current video as a template. */
export function saveTemplate(tpl) {
  const list = read();
  const t = Object.assign({}, tpl, { id: 't' + Date.now().toString(36), mine: true });
  list.push(t);
  write(list);
  return t;
}

/* Removes one of your templates. */
export function deleteTemplate(id) {
  write(read().filter((t) => t.id !== id));
}

/* Finds a template by name. */
export function findTemplate(name) {
  const all = allTemplates();
  return all.find((t) => t.name.toLowerCase() === String(name || '').toLowerCase()) || null;
}
