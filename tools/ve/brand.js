/* The brand kit for the video editor.

   Your colours, your fonts and your curves, kept in this browser so the next video starts
   where the last one finished. Nothing is stored on a server.

   Colours and curves are small, so they sit in local storage. Fonts are bigger, so they are
   kept in a database on this computer, and only their details are in local storage. */
const KEY = 've_brand_v1';
const DB = 've_fonts', STORE = 'fonts';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
}
function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
}

/* A kit with nothing in it, but with the shapes the rest of the code expects. */
export function emptyBrand() {
  return { colors: [], fonts: [], easings: [], updated: 0 };
}

/* The kit, or an empty one. */
export function loadBrand() {
  const b = read();
  if (!b) return emptyBrand();
  return { colors: b.colors || [], fonts: b.fonts || [], easings: b.easings || [], updated: b.updated || 0 };
}

/* Saves the kit. */
export function saveBrand(brand) {
  const b = { colors: brand.colors || [], fonts: brand.fonts || [], easings: brand.easings || [], updated: Date.now() };
  return write(b);
}

/* Adds a colour. The same colour is not added twice. */
export function addColor(brand, hex, name) {
  const h = String(hex).toUpperCase();
  if (brand.colors.some((c) => c.hex === h)) return brand;
  brand.colors.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), hex: h, name: name || h });
  return brand;
}

/* Adds a curve. */
export function addEase(brand, spec, name) {
  const key = JSON.stringify(spec);
  if (brand.easings.some((e) => JSON.stringify(e.spec) === key)) return brand;
  brand.easings.push({ id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), spec, name: name || 'Custom curve' });
  return brand;
}

/* Removes something from the kit by its name. */
export function removeFromBrand(brand, list, id) {
  brand[list] = (brand[list] || []).filter((x) => x.id !== id);
  return brand;
}

/* ------------------------------------------------------------------ fonts on this computer */
function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('This browser cannot keep fonts.')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* Keeps a font file so it can be used again next time. */
export async function saveFontFile(id, file) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(file, id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/* Gets a font file back. */
export async function getFontFile(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

/* Removes a font file. */
export async function deleteFontFile(id) {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

/* Puts a font into the page so it can be used straight away.
   Returns a promise that says whether the browser took it. */
export async function useFont(id, family, file) {
  if (!('FontFace' in window)) return false;
  try {
    const face = new FontFace(family, await file.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    return true;
  } catch (e) { return false; }
}

/* The font families that are ready to use right now. */
export function readyFonts() {
  if (!document.fonts) return [];
  const out = [];
  document.fonts.forEach((f) => { if (f.family && f.status === 'loaded') out.push(f.family); });
  return out;
}
