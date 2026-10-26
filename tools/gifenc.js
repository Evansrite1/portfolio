/* A small animated GIF encoder: median cut colour reduction (up to 256 colours per frame) and LZW compression.
   Pure code with no browser APIs, so it also runs in Node for testing. */

/* Reduces RGBA pixels to a palette. Returns { palette: Uint8Array (r,g,b,...), index: Uint8Array, bits }. */
export function quantize(rgba, maxColors) {
  maxColors = Math.max(2, Math.min(256, maxColors || 256));
  const n = rgba.length >> 2;
  const hist = new Uint32Array(32768);
  const keys = new Uint16Array(n);
  const sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const k = ((rgba[p] >> 3) << 10) | ((rgba[p + 1] >> 3) << 5) | (rgba[p + 2] >> 3);
    keys[i] = k; hist[k]++; sr[k] += rgba[p]; sg[k] += rgba[p + 1]; sb[k] += rgba[p + 2];
  }
  let colors = [];
  for (let k = 0; k < 32768; k++) if (hist[k]) colors.push(k);
  colors = Uint16Array.from(colors);
  const ch = (k, c) => (c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31);

  const boxes = [makeBox(0, colors.length)];
  function makeBox(lo, hi) {
    const mn = [31, 31, 31], mx = [0, 0, 0];
    let count = 0;
    for (let i = lo; i < hi; i++) {
      const k = colors[i];
      for (let c = 0; c < 3; c++) { const v = ch(k, c); if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
      count += hist[k];
    }
    const r = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    const axis = r[1] >= r[0] && r[1] >= r[2] ? 1 : (r[0] >= r[2] ? 0 : 2);
    return { lo, hi, count, axis, range: r[axis] };
  }
  while (boxes.length < maxColors) {
    let best = -1, score = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.hi - b.lo < 2 || b.range === 0) continue;
      const s = b.range * Math.sqrt(b.count);
      if (s > score) { score = s; best = i; }
    }
    if (best < 0) break;
    const b = boxes[best];
    const part = colors.subarray(b.lo, b.hi);
    const ax = b.axis;
    part.sort((x, y) => ch(x, ax) - ch(y, ax));
    let acc = 0, cut = b.hi - 1;
    const half = b.count / 2;
    for (let i = b.lo; i < b.hi - 1; i++) {
      acc += hist[colors[i]];
      if (acc >= half) { cut = i + 1; break; }
    }
    boxes.splice(best, 1, makeBox(b.lo, cut), makeBox(cut, b.hi));
  }
  let bits = 1;
  while ((1 << bits) < boxes.length) bits++;
  const palette = new Uint8Array((1 << bits) * 3);
  const lut = new Uint8Array(32768);
  boxes.forEach((b, bi) => {
    let r = 0, g = 0, bl = 0, w = 0;
    for (let i = b.lo; i < b.hi; i++) {
      const k = colors[i], h = hist[k];
      r += sr[k]; g += sg[k]; bl += sb[k]; w += h;
      lut[k] = bi;
    }
    const to8 = (v) => Math.min(255, Math.round(v / w));
    palette[bi * 3] = to8(r); palette[bi * 3 + 1] = to8(g); palette[bi * 3 + 2] = to8(bl);
  });
  const index = new Uint8Array(n);
  for (let i = 0; i < n; i++) index[i] = lut[keys[i]];
  return { palette, index, bits };
}

class Bytes {
  constructor() { this.buf = new Uint8Array(1 << 16); this.len = 0; }
  grow(more) {
    if (this.len + more <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + more) size *= 2;
    const b = new Uint8Array(size); b.set(this.buf.subarray(0, this.len)); this.buf = b;
  }
  byte(v) { this.grow(1); this.buf[this.len++] = v & 255; }
  word(v) { this.byte(v); this.byte(v >> 8); }
  bytes(arr) { this.grow(arr.length); this.buf.set(arr, this.len); this.len += arr.length; }
  str(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  result() { return this.buf.slice(0, this.len); }
}

/* LZW as used by GIF, written in 255 byte sub-blocks. */
function lzw(out, index, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  const table = new Int16Array(4096 * 256).fill(-1);
  const block = new Uint8Array(255);
  let bl = 0, cur = 0, shift = 0;
  const flushBlock = () => { if (bl) { out.byte(bl); out.bytes(block.subarray(0, bl)); bl = 0; } };
  const emit = (code) => {
    cur |= code << shift; shift += size;
    while (shift >= 8) { block[bl++] = cur & 255; cur >>>= 8; shift -= 8; if (bl === 255) flushBlock(); }
  };
  out.byte(minCode);
  emit(clear);
  let prefix = index[0];
  for (let i = 1; i < index.length; i++) {
    const k = index[i];
    const key = (prefix << 8) | k;
    const hit = table[key];
    if (hit >= 0) { prefix = hit; continue; }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      table.fill(-1);
      size = minCode + 1; next = eoi + 1;
    } else {
      if (next >= (1 << size)) size++;
      table[key] = next++;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (shift > 0) { block[bl++] = cur & 255; if (bl === 255) flushBlock(); }
  flushBlock();
  out.byte(0);
}

export class GifWriter {
  /* loop: 0 means repeat forever. */
  constructor(width, height, loop) {
    this.w = width; this.h = height;
    const o = this.out = new Bytes();
    o.str('GIF89a'); o.word(width); o.word(height);
    o.byte(0x70); o.byte(0); o.byte(0);
    o.byte(0x21); o.byte(0xff); o.byte(11); o.str('NETSCAPE2.0'); o.byte(3); o.byte(1); o.word(loop || 0); o.byte(0);
  }
  /* rgba: width*height*4 bytes. delay in hundredths of a second. */
  addFrame(rgba, delay) {
    const { palette, index, bits } = quantize(rgba, 256);
    this.addIndexed(index, palette, bits, delay);
  }
  addIndexed(index, palette, bits, delay) {
    const o = this.out;
    o.byte(0x21); o.byte(0xf9); o.byte(4); o.byte(0x04); o.word(Math.max(2, Math.round(delay))); o.byte(0); o.byte(0);
    o.byte(0x2c); o.word(0); o.word(0); o.word(this.w); o.word(this.h); o.byte(0x80 | (bits - 1));
    o.bytes(palette);
    lzw(o, index, Math.max(2, bits));
  }
  finish() { this.out.byte(0x3b); return this.out.result(); }
}
