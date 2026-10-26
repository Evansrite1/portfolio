window.AM = window.AM || {};
(function () {
  'use strict';
  /*
   * AM.Spectral: spectral analysis and repair for the Audio mastering app.
   * FFT, STFT and inverse STFT, a spectrogram view with selection and repair tools,
   * noise reduction, hum removal, click removal, region attenuation and
   * ITU-R BS.1770-4 loudness with loudness matching.
   * Everything runs in the browser. Nothing is uploaded.
   */
  const AM = window.AM;
  const COL = { bg: '#161618', panel: '#1f1f23', line: '#2b2b30', text: '#b6b6bd', accent: '#ff5b52', ok: '#2fbf71' };

  /* ------------------------------------------------------------------ */
  /* Core maths. Self contained so it can also run inside a Web Worker.  */
  /* ------------------------------------------------------------------ */
  function spectroCore() {
    // Radix-2 FFT for real input of size n, using one complex FFT of size n / 2.
    function FFT(n) {
      if (!(n >= 4) || (n & (n - 1)) !== 0) throw new Error('FFT size must be a power of two, 4 or more');
      const h = n >> 1;
      this.n = n;
      this.h = h;
      let bits = 0;
      while ((1 << bits) < h) bits++;
      this.rev = new Uint32Array(h);
      for (let i = 0; i < h; i++) {
        let r = 0;
        for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
        this.rev[i] = r;
      }
      const q = Math.max(1, h >> 1);
      this.ct = new Float64Array(q);
      this.st = new Float64Array(q);
      for (let k = 0; k < q; k++) {
        this.ct[k] = Math.cos(2 * Math.PI * k / h);
        this.st[k] = Math.sin(2 * Math.PI * k / h);
      }
      this.tr = new Float64Array(h + 1);
      this.ti = new Float64Array(h + 1);
      for (let k = 0; k <= h; k++) {
        this.tr[k] = Math.cos(2 * Math.PI * k / n);
        this.ti[k] = Math.sin(2 * Math.PI * k / n);
      }
      this.zr = new Float64Array(h);
      this.zi = new Float64Array(h);
    }
    FFT.prototype.cfft = function (re, im, inv) {
      const m = this.h, rev = this.rev, ct = this.ct, st = this.st;
      for (let i = 0; i < m; i++) {
        const j = rev[i];
        if (j > i) {
          let t = re[i]; re[i] = re[j]; re[j] = t;
          t = im[i]; im[i] = im[j]; im[j] = t;
        }
      }
      for (let size = 2; size <= m; size <<= 1) {
        const half = size >> 1, step = m / size;
        for (let i = 0; i < m; i += size) {
          for (let j = 0, k = 0; j < half; j++, k += step) {
            const wr = ct[k], wi = inv ? st[k] : -st[k];
            const a = i + j, b = a + half;
            const xr = re[b] * wr - im[b] * wi;
            const xi = re[b] * wi + im[b] * wr;
            re[b] = re[a] - xr; im[b] = im[a] - xi;
            re[a] += xr; im[a] += xi;
          }
        }
      }
    };
    // x: n real samples. outRe, outIm: n / 2 + 1 bins (unnormalised DFT).
    FFT.prototype.forward = function (x, outRe, outIm) {
      const h = this.h, zr = this.zr, zi = this.zi, tr = this.tr, ti = this.ti;
      for (let k = 0; k < h; k++) { zr[k] = x[2 * k]; zi[k] = x[2 * k + 1]; }
      this.cfft(zr, zi, false);
      outRe[0] = zr[0] + zi[0]; outIm[0] = 0;
      outRe[h] = zr[0] - zi[0]; outIm[h] = 0;
      for (let k = 1; k < h; k++) {
        const ar = zr[k], ai = zi[k], br = zr[h - k], bi = -zi[h - k];
        const er = (ar + br) * 0.5, ei = (ai + bi) * 0.5;
        const dr = (ar - br) * 0.5, di = (ai - bi) * 0.5;
        const or = di, oi = -dr;
        const wr = tr[k], wi = -ti[k];
        outRe[k] = er + or * wr - oi * wi;
        outIm[k] = ei + or * wi + oi * wr;
      }
    };
    // re, im: n / 2 + 1 bins. out: n real samples (exact inverse of forward).
    FFT.prototype.inverse = function (re, im, out) {
      const h = this.h, zr = this.zr, zi = this.zi, tr = this.tr, ti = this.ti;
      for (let k = 0; k < h; k++) {
        const ar = re[k], ai = im[k], br = re[h - k], bi = -im[h - k];
        const er = (ar + br) * 0.5, ei = (ai + bi) * 0.5;
        const dr = (ar - br) * 0.5, di = (ai - bi) * 0.5;
        const wr = tr[k], wi = ti[k];
        const or = dr * wr - di * wi, oi = dr * wi + di * wr;
        zr[k] = er - oi; zi[k] = ei + or;
      }
      this.cfft(zr, zi, true);
      const s = 1 / h;
      for (let k = 0; k < h; k++) { out[2 * k] = zr[k] * s; out[2 * k + 1] = zi[k] * s; }
    };

    function hann(n) {
      const w = new Float64Array(n);
      for (let k = 0; k < n; k++) w[k] = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / n);
      return w;
    }

    // Spectrogram columns c0 to c1 - 1 of mono data, in dB where a full scale sine reads 0 dB.
    // Column c covers samples [start + c * step, start + (c + 1) * step).
    function columns(data, fftSize, start, step, c0, c1, out, state) {
      const n = fftSize, bins = n / 2 + 1, half = n / 2, len = data.length;
      if (!state.fft || state.fft.n !== n) {
        state.fft = new FFT(n);
        state.win = hann(n);
        state.frame = new Float64Array(n);
        state.re = new Float64Array(bins);
        state.im = new Float64Array(bins);
        state.acc = new Float64Array(bins);
      }
      const fft = state.fft, win = state.win, frame = state.frame, re = state.re, im = state.im, acc = state.acc;
      const sub = step > n ? Math.min(4, Math.ceil(step / n)) : 1;
      const norm = 16 / (n * n) / sub;
      for (let c = c0; c < c1; c++) {
        acc.fill(0);
        for (let s = 0; s < sub; s++) {
          const center = Math.round(start + (c + (s + 0.5) / sub) * step);
          const p0 = center - half;
          for (let k = 0; k < n; k++) {
            const i = p0 + k;
            frame[k] = (i >= 0 && i < len) ? data[i] * win[k] : 0;
          }
          fft.forward(frame, re, im);
          for (let k = 0; k < bins; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
        }
        const o = c * bins;
        for (let k = 0; k < bins; k++) out[o + k] = 10 * Math.log10(acc[k] * norm + 1e-16);
      }
    }

    return { FFT: FFT, hann: hann, columns: columns };
  }

  const CORE = spectroCore();
  const FFT = CORE.FFT;
  const fftCache = new Map();
  const winCache = new Map();
  function getFFT(n) {
    let f = fftCache.get(n);
    if (!f) { f = new FFT(n); fftCache.set(n, f); }
    return f;
  }
  function hann(n) {
    let w = winCache.get(n);
    if (!w) { w = CORE.hann(n); winCache.set(n, w); }
    return w;
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */
  function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function isPow2(n) { return n >= 4 && (n & (n - 1)) === 0; }
  function pow2Size(n, d) { n = Math.round(num(n, d)); return isPow2(n) ? n : d; }
  const now = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
  function pause() { return new Promise(r => setTimeout(r, 0)); }
  function dbToLin(db) { return Math.pow(10, db / 20); }
  function linToDb(v) { return v > 0 ? 20 * Math.log10(v) : -Infinity; }

  // Cooperative time slicing so long work never blocks the page for long.
  function slicer(onProgress, budget) {
    let t = now();
    const b = budget || 25;
    const report = f => {
      if (typeof onProgress === 'function') { try { onProgress(clamp(f, 0, 1)); } catch (e) { /* ignore listener errors */ } }
    };
    return {
      report: report,
      due: () => now() - t > b,
      yield: async f => { if (f != null) report(f); await pause(); t = now(); }
    };
  }

  class PlainBuffer {
    constructor(channels, length, sampleRate) {
      this.numberOfChannels = channels;
      this.length = length;
      this.sampleRate = sampleRate;
      this._d = [];
      for (let c = 0; c < channels; c++) this._d.push(new Float32Array(length));
    }
    get duration() { return this.length / this.sampleRate; }
    getChannelData(c) { return this._d[c]; }
    copyToChannel(src, c, start) { this._d[c].set(src.length + (start || 0) > this.length ? src.subarray(0, this.length - (start || 0)) : src, start || 0); }
    copyFromChannel(dst, c, start) { const s = start || 0; dst.set(this._d[c].subarray(s, s + dst.length)); }
  }

  function createBuffer(channels, length, sampleRate) {
    channels = Math.max(1, channels | 0);
    length = Math.max(1, length | 0);
    if (typeof AudioBuffer === 'function') {
      try { return new AudioBuffer({ numberOfChannels: channels, length: length, sampleRate: sampleRate }); } catch (e) { /* try the next way */ }
    }
    const ctx = AM.engine && AM.engine.ctx;
    if (ctx && typeof ctx.createBuffer === 'function') {
      try { return ctx.createBuffer(channels, length, sampleRate); } catch (e) { /* try the next way */ }
    }
    if (typeof OfflineAudioContext === 'function') {
      try { return new OfflineAudioContext(channels, length, sampleRate).createBuffer(channels, length, sampleRate); } catch (e) { /* use the plain buffer */ }
    }
    return new PlainBuffer(channels, length, sampleRate);
  }
  function setChannel(buf, c, data) {
    if (typeof buf.copyToChannel === 'function') {
      try { buf.copyToChannel(data, c, 0); return; } catch (e) { /* fall back to set */ }
    }
    buf.getChannelData(c).set(data);
  }
  function channelsOf(buf) {
    const a = [];
    for (let c = 0; c < buf.numberOfChannels; c++) a.push(buf.getChannelData(c));
    return a;
  }
  function fromChannels(chs, sampleRate) {
    const b = createBuffer(chs.length, chs[0].length, sampleRate);
    for (let c = 0; c < chs.length; c++) setChannel(b, c, chs[c]);
    return b;
  }
  function cloneBuffer(buf) {
    return fromChannels(channelsOf(buf).map(d => new Float32Array(d)), buf.sampleRate);
  }
  function sliceBuffer(buf, s0, s1) {
    s0 = clamp(Math.floor(s0), 0, buf.length);
    s1 = clamp(Math.floor(s1), s0 + 1, buf.length);
    if (s1 <= s0) s1 = Math.min(buf.length, s0 + 1);
    return fromChannels(channelsOf(buf).map(d => d.slice(s0, s1)), buf.sampleRate);
  }
  function checkBuffer(buf) {
    if (!buf || typeof buf.getChannelData !== 'function' || !(buf.length > 0)) throw new Error('No audio to work on.');
  }

  /* ------------------------------------------------------------------ */
  /* STFT                                                                */
  /* ------------------------------------------------------------------ */
  // Frames are centred: frame i covers samples [i * hop - fftSize / 2, i * hop + fftSize / 2).
  function frameCount(len, fftSize, hop) {
    return len > 0 ? Math.floor((len - 1 + fftSize / 2) / hop) + 1 : 0;
  }
  function fillFrame(x, start, win, frame) {
    const n = win.length, len = x.length;
    if (start >= 0 && start + n <= len) {
      for (let k = 0; k < n; k++) frame[k] = x[start + k] * win[k];
    } else {
      for (let k = 0; k < n; k++) {
        const i = start + k;
        frame[k] = (i >= 0 && i < len) ? x[i] * win[k] : 0;
      }
    }
  }

  // Public: magnitude STFT of one channel. mags are raw |X| (unnormalised DFT of the Hann windowed frame).
  function stft(channelData, sampleRate, fftSize, hop) {
    fftSize = pow2Size(fftSize, 2048);
    hop = Math.max(1, Math.round(num(hop, fftSize / 4)));
    const fft = getFFT(fftSize), win = hann(fftSize), bins = fftSize / 2 + 1;
    const F = frameCount(channelData.length, fftSize, hop);
    const frame = new Float64Array(fftSize), re = new Float64Array(bins), im = new Float64Array(bins);
    const mags = new Array(F);
    for (let i = 0; i < F; i++) {
      fillFrame(channelData, i * hop - fftSize / 2, win, frame);
      fft.forward(frame, re, im);
      const m = new Float32Array(bins);
      for (let k = 0; k < bins; k++) m[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      mags[i] = m;
    }
    return { mags: mags, bins: bins, frames: F, hop: hop, fftSize: fftSize, sampleRate: sampleRate };
  }

  // Public: complex STFT, for use with istft.
  function stftComplex(channelData, fftSize, hop) {
    fftSize = pow2Size(fftSize, 2048);
    hop = Math.max(1, Math.round(num(hop, fftSize / 4)));
    const fft = getFFT(fftSize), win = hann(fftSize), bins = fftSize / 2 + 1;
    const F = frameCount(channelData.length, fftSize, hop);
    const frame = new Float64Array(fftSize);
    const re = new Array(F), im = new Array(F);
    for (let i = 0; i < F; i++) {
      fillFrame(channelData, i * hop - fftSize / 2, win, frame);
      re[i] = new Float64Array(bins);
      im[i] = new Float64Array(bins);
      fft.forward(frame, re[i], im[i]);
    }
    return { re: re, im: im, frames: F, bins: bins, fftSize: fftSize, hop: hop, length: channelData.length };
  }

  // Public: inverse STFT with weighted overlap add (Hann synthesis window, normalised by the window power sum).
  function istft(spec) {
    const n = spec.fftSize, hop = spec.hop, len = spec.length;
    const fft = getFFT(n), win = hann(n);
    const out = new Float32Array(len), ws = new Float32Array(len), y = new Float64Array(n);
    for (let i = 0; i < spec.frames; i++) {
      fft.inverse(spec.re[i], spec.im[i], y);
      const start = i * hop - n / 2;
      for (let k = 0; k < n; k++) {
        const p = start + k;
        if (p >= 0 && p < len) { out[p] += y[k] * win[k]; ws[p] += win[k] * win[k]; }
      }
    }
    for (let p = 0; p < len; p++) out[p] = ws[p] > 1e-9 ? out[p] / ws[p] : 0;
    return out;
  }

  // Streaming STFT processing of one channel with a look ahead of `delay` frames.
  // handler.begin(F), handler.analyze(i, re, im), handler.synth(j, re, im) (may change re, im in place).
  async function stftProcess(x, n, hop, delay, handler, sl, p0, pSpan) {
    const len = x.length, bins = n / 2 + 1, half = n / 2;
    const fft = getFFT(n), win = hann(n);
    const F = frameCount(len, n, hop);
    if (handler.begin) handler.begin(F);
    const out = new Float32Array(len), ws = new Float32Array(len);
    const R = delay + 1;
    const ringRe = [], ringIm = [];
    for (let r = 0; r < R; r++) { ringRe.push(new Float64Array(bins)); ringIm.push(new Float64Array(bins)); }
    const frame = new Float64Array(n), y = new Float64Array(n);
    const synth = j => {
      const re = ringRe[j % R], im = ringIm[j % R];
      handler.synth(j, re, im);
      fft.inverse(re, im, y);
      const start = j * hop - half;
      for (let k = 0; k < n; k++) {
        const p = start + k;
        if (p >= 0 && p < len) { out[p] += y[k] * win[k]; ws[p] += win[k] * win[k]; }
      }
    };
    for (let i = 0; i < F; i++) {
      fillFrame(x, i * hop - half, win, frame);
      const re = ringRe[i % R], im = ringIm[i % R];
      fft.forward(frame, re, im);
      if (handler.analyze) handler.analyze(i, re, im);
      if (i - delay >= 0) synth(i - delay);
      if (sl && sl.due()) await sl.yield(p0 + pSpan * (i / F));
    }
    for (let j = Math.max(0, F - delay); j < F; j++) synth(j);
    for (let p = 0; p < len; p++) out[p] = ws[p] > 1e-9 ? out[p] / ws[p] : 0;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Noise profile and noise reduction                                   */
  /* ------------------------------------------------------------------ */
  // Public: learn the noise from a part of the buffer (seconds). Mean magnitude and mean power per bin.
  function noiseProfile(audioBuffer, start, end, opts) {
    checkBuffer(audioBuffer);
    opts = opts || {};
    const n = pow2Size(opts.fftSize, 2048), hop = n / 4, bins = n / 2 + 1;
    const sr = audioBuffer.sampleRate, len = audioBuffer.length;
    let s0 = clamp(Math.floor(num(start, 0) * sr), 0, len);
    let s1 = clamp(Math.ceil(num(end, len / sr) * sr), 0, len);
    if (s1 < s0) { const t = s0; s0 = s1; s1 = t; }
    if (s1 - s0 < n) {
      const mid = (s0 + s1) >> 1;
      s0 = Math.max(0, mid - n / 2);
      s1 = Math.min(len, s0 + n);
      s0 = Math.max(0, s1 - n);
    }
    const fft = getFFT(n), win = hann(n);
    const frame = new Float64Array(n), re = new Float64Array(bins), im = new Float64Array(bins);
    const mag = new Float64Array(bins), pow = new Float64Array(bins);
    const positions = [];
    const last = Math.max(s0, s1 - n);
    const total = Math.floor((last - s0) / hop) + 1;
    const stride = Math.max(1, Math.ceil(total / 400));
    for (let f = 0; f < total; f += stride) positions.push(s0 + f * hop);
    const chs = channelsOf(audioBuffer);
    let count = 0;
    for (const p of positions) {
      for (const x of chs) {
        fillFrame(x, p, win, frame);
        fft.forward(frame, re, im);
        for (let k = 0; k < bins; k++) {
          const pw = re[k] * re[k] + im[k] * im[k];
          pow[k] += pw;
          mag[k] += Math.sqrt(pw);
        }
        count++;
      }
    }
    const m = new Float32Array(bins), pw = new Float32Array(bins);
    for (let k = 0; k < bins; k++) { m[k] = mag[k] / Math.max(1, count); pw[k] = pow[k] / Math.max(1, count); }
    return { fftSize: n, sampleRate: sr, bins: bins, mag: m, power: pw, frames: count, start: s0 / sr, end: s1 / sr };
  }

  // Guess a noise profile from the quietest frames when the user did not learn one.
  async function autoProfile(audioBuffer, n, sl) {
    const hop = n / 4, bins = n / 2 + 1, len = audioBuffer.length;
    const fft = getFFT(n), win = hann(n);
    const chs = channelsOf(audioBuffer);
    const total = Math.max(1, Math.floor(Math.max(0, len - n) / hop) + 1);
    const want = Math.min(total, 600);
    const frames = [];
    const frame = new Float64Array(n), re = new Float64Array(bins), im = new Float64Array(bins);
    for (let f = 0; f < want; f++) {
      const p = Math.floor(f * (total - 1) / Math.max(1, want - 1)) * hop;
      const pw = new Float32Array(bins);
      let e = 0;
      for (const x of chs) {
        fillFrame(x, p, win, frame);
        fft.forward(frame, re, im);
        for (let k = 0; k < bins; k++) { const v = re[k] * re[k] + im[k] * im[k]; pw[k] += v / chs.length; e += v; }
      }
      frames.push({ e: e, pw: pw });
      if (sl && sl.due()) await sl.yield(0.1 * f / want);
    }
    frames.sort((a, b) => a.e - b.e);
    const use = Math.max(3, Math.ceil(frames.length * 0.1));
    const pow = new Float32Array(bins), mag = new Float32Array(bins);
    const k0 = Math.min(use, frames.length);
    for (let i = 0; i < k0; i++) for (let k = 0; k < bins; k++) pow[k] += frames[i].pw[k] / k0;
    for (let k = 0; k < bins; k++) mag[k] = Math.sqrt(pow[k]);
    return { fftSize: n, sampleRate: audioBuffer.sampleRate, bins: bins, mag: mag, power: pow, frames: k0, auto: true };
  }

  // Public: spectral noise reduction (Wiener style gain from smoothed power) with a learned noise profile.
  // amount: how far noise is lowered in dB. sensitivity 0 to 10: higher removes more. smoothing 0 to 10: less musical noise.
  async function denoise(audioBuffer, profile, opts) {
    checkBuffer(audioBuffer);
    opts = opts || {};
    const amount = clamp(num(opts.amount, 24), 0, 100);
    const sensitivity = clamp(num(opts.sensitivity, 5), 0, 10);
    const smoothing = clamp(num(opts.smoothing, 5), 0, 10);
    const sl = slicer(opts.onProgress);
    if (!profile || !profile.power) profile = await autoProfile(audioBuffer, pow2Size(opts.fftSize, 2048), sl);
    const n = profile.fftSize, hop = n / 4, bins = n / 2 + 1;
    const noiseP = profile.power;
    const gmin = dbToLin(-amount);
    const beta = 1 + sensitivity * 0.25;
    const D = Math.round(smoothing * 0.4);
    const K = Math.round(smoothing * 0.3);
    const rel = smoothing * 0.06;
    const tw = [];
    for (let d = -K; d <= K; d++) tw.push(K + 1 - Math.abs(d));
    const chs = channelsOf(audioBuffer);
    const outs = [];
    for (let c = 0; c < chs.length; c++) {
      const R = 2 * D + 1;
      const pw = [];
      for (let r = 0; r < R; r++) pw.push(new Float32Array(bins));
      const tmp = new Float64Array(bins);
      const prevG = new Float32Array(bins).fill(1);
      let F = 0;
      const handler = {
        begin: f => { F = f; },
        analyze: (i, re, im) => {
          for (let k = 0; k < bins; k++) tmp[k] = re[k] * re[k] + im[k] * im[k];
          const p = pw[i % R];
          for (let k = 0; k < bins; k++) {
            let s = 0, ws = 0;
            for (let d = -K; d <= K; d++) {
              const q = k + d;
              if (q < 0 || q >= bins) continue;
              const w = tw[d + K];
              s += tmp[q] * w; ws += w;
            }
            p[k] = s / ws;
          }
        },
        synth: (j, re, im) => {
          const lo = Math.max(0, j - D), hi = Math.min(F - 1, j + D);
          const cnt = hi - lo + 1;
          for (let k = 0; k < bins; k++) {
            let s = 0;
            for (let f = lo; f <= hi; f++) s += pw[f % R][k];
            const ps = s / cnt;
            let g = 1 - beta * noiseP[k] / (ps + 1e-30);
            if (g < gmin) g = gmin;
            if (g < prevG[k]) g = prevG[k] * rel + g * (1 - rel);
            prevG[k] = g;
            re[k] *= g; im[k] *= g;
          }
        }
      };
      outs.push(await stftProcess(chs[c], n, hop, D, handler, sl, c / chs.length, 1 / chs.length));
    }
    sl.report(1);
    return fromChannels(outs, audioBuffer.sampleRate);
  }

  /* ------------------------------------------------------------------ */
  /* Hum removal                                                         */
  /* ------------------------------------------------------------------ */
  function notchCoefs(f, q, sr) {
    const w0 = 2 * Math.PI * f / sr, cs = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    return { b0: 1 / a0, b1: -2 * cs / a0, b2: 1 / a0, a1: -2 * cs / a0, a2: (1 - alpha) / a0 };
  }

  function humFreqs(opts, sr) {
    const base = num(opts.freq, 50) === 60 ? 60 : clamp(num(opts.freq, 50), 20, 1000);
    const harm = clamp(Math.round(num(opts.harmonics, 4)), 1, 8);
    const out = [];
    for (let h = 1; h <= harm; h++) if (base * h < sr * 0.45) out.push(base * h);
    return out;
  }

  async function dehumJs(audioBuffer, freqs, q, sl) {
    const sr = audioBuffer.sampleRate, chs = channelsOf(audioBuffer), len = audioBuffer.length;
    const co = freqs.map(f => notchCoefs(f, q, sr));
    const S = co.length;
    const outs = [];
    for (let c = 0; c < chs.length; c++) {
      const x = chs[c], y = new Float32Array(len);
      const st = new Float64Array(S * 4); // x1 x2 y1 y2 per section
      const CH = 32768;
      for (let a = 0; a < len; a += CH) {
        const b = Math.min(len, a + CH);
        for (let i = a; i < b; i++) {
          let v = x[i];
          for (let s = 0; s < S; s++) {
            const k = co[s], o = s * 4;
            const out = k.b0 * v + k.b1 * st[o] + k.b2 * st[o + 1] - k.a1 * st[o + 2] - k.a2 * st[o + 3];
            st[o + 1] = st[o]; st[o] = v;
            st[o + 3] = st[o + 2]; st[o + 2] = out;
            v = out;
          }
          y[i] = v;
        }
        if (sl.due()) await sl.yield((c + b / len) / chs.length);
      }
      outs.push(y);
    }
    return fromChannels(outs, sr);
  }

  async function dehumOffline(audioBuffer, freqs, q) {
    const ch = audioBuffer.numberOfChannels, len = audioBuffer.length, sr = audioBuffer.sampleRate;
    const oc = new OfflineAudioContext(ch, len, sr);
    let input = audioBuffer;
    if (typeof AudioBuffer !== 'function' || !(audioBuffer instanceof AudioBuffer)) {
      input = oc.createBuffer(ch, len, sr);
      for (let c = 0; c < ch; c++) setChannel(input, c, audioBuffer.getChannelData(c));
    }
    const src = oc.createBufferSource();
    src.buffer = input;
    let node = src;
    for (const f of freqs) {
      const bq = oc.createBiquadFilter();
      bq.type = 'notch';
      bq.frequency.value = f;
      bq.Q.value = q;
      node.connect(bq);
      node = bq;
    }
    node.connect(oc.destination);
    src.start(0);
    const r = await oc.startRendering();
    if (!r || r.numberOfChannels !== ch || r.length !== len) throw new Error('Offline render size mismatch');
    return r;
  }

  // Public: remove mains hum with narrow notch filters at the base frequency and its harmonics.
  async function dehum(audioBuffer, opts) {
    checkBuffer(audioBuffer);
    opts = opts || {};
    const q = clamp(num(opts.q, 30), 1, 200);
    const freqs = humFreqs(opts, audioBuffer.sampleRate);
    const sl = slicer(opts.onProgress);
    if (!freqs.length) return cloneBuffer(audioBuffer);
    if (!opts.forceJs && typeof OfflineAudioContext === 'function') {
      try {
        sl.report(0);
        const r = await dehumOffline(audioBuffer, freqs, q);
        sl.report(1);
        return r;
      } catch (e) { /* use the plain JavaScript filters */ }
    }
    const r = await dehumJs(audioBuffer, freqs, q, sl);
    sl.report(1);
    return r;
  }

  /* ------------------------------------------------------------------ */
  /* Click removal                                                       */
  /* ------------------------------------------------------------------ */
  // Autoregressive coefficients by least squares (covariance method). Prediction: x[n] = sum a[k] x[n - 1 - k].
  function arCoefs(seg, order) {
    const n = seg.length, p = order;
    if (n < p * 2) return null;
    const C = new Float64Array(p * p), d = new Float64Array(p);
    for (let t = p; t < n; t++) {
      const xt = seg[t];
      for (let j = 0; j < p; j++) {
        const xj = seg[t - 1 - j];
        d[j] += xt * xj;
        const row = j * p;
        for (let k = j; k < p; k++) C[row + k] += xj * seg[t - 1 - k];
      }
    }
    let tr = 0;
    for (let j = 0; j < p; j++) { for (let k = 0; k < j; k++) C[j * p + k] = C[k * p + j]; tr += C[j * p + j]; }
    if (tr <= 1e-20) return null;
    const reg = tr / p * 1e-7;
    for (let j = 0; j < p; j++) C[j * p + j] += reg;
    // Cholesky solve
    const L = new Float64Array(p * p);
    for (let j = 0; j < p; j++) {
      let s = C[j * p + j];
      for (let k = 0; k < j; k++) s -= L[j * p + k] * L[j * p + k];
      if (s <= 0) return null;
      const dj = Math.sqrt(s);
      L[j * p + j] = dj;
      for (let i = j + 1; i < p; i++) {
        let v = C[i * p + j];
        for (let k = 0; k < j; k++) v -= L[i * p + k] * L[j * p + k];
        L[i * p + j] = v / dj;
      }
    }
    const y = new Float64Array(p), a = new Float64Array(p);
    for (let i = 0; i < p; i++) { let v = d[i]; for (let k = 0; k < i; k++) v -= L[i * p + k] * y[k]; y[i] = v / L[i * p + i]; }
    for (let i = p - 1; i >= 0; i--) { let v = y[i]; for (let k = i + 1; k < p; k++) v -= L[k * p + i] * a[k]; a[i] = v / L[i * p + i]; }
    return a;
  }

  function repairGap(y, s, e, sr) {
    const L = e - s;
    const M = clamp(L * 6, 192, 512);
    const order = Math.min(24, Math.floor(M / 4));
    const canBefore = s - M >= 0, canAfter = e + M <= y.length;
    let fwd = null, bwd = null;
    if (canBefore) {
      const seg = y.subarray(s - M, s);
      const a = arCoefs(seg, order);
      if (a) {
        fwd = new Float64Array(L);
        const hist = Array.from(seg.subarray(M - order));
        for (let i = 0; i < L; i++) {
          let v = 0;
          for (let k = 0; k < order; k++) v += a[k] * hist[hist.length - 1 - k];
          fwd[i] = v;
          hist.push(v); hist.shift();
        }
      }
    }
    if (canAfter) {
      const seg = Float64Array.from(y.subarray(e, e + M)).reverse();
      const a = arCoefs(seg, order);
      if (a) {
        bwd = new Float64Array(L);
        const hist = Array.from(seg.subarray(M - order));
        for (let i = 0; i < L; i++) {
          let v = 0;
          for (let k = 0; k < order; k++) v += a[k] * hist[hist.length - 1 - k];
          bwd[L - 1 - i] = v;
          hist.push(v); hist.shift();
        }
      }
    }
    const left = s > 0 ? y[s - 1] : (e < y.length ? y[e] : 0);
    const right = e < y.length ? y[e] : left;
    const limit = Math.max(Math.abs(left), Math.abs(right)) * 4 + 0.05;
    for (let i = 0; i < L; i++) {
      const w = L > 1 ? 0.5 - 0.5 * Math.cos(Math.PI * (i + 0.5) / L) : 0.5;
      const lin = left + (right - left) * (i + 1) / (L + 1);
      let v;
      if (fwd && bwd) v = fwd[i] * (1 - w) + bwd[i] * w;
      else if (fwd) v = fwd[i] * (1 - w) + lin * w;
      else if (bwd) v = lin * (1 - w) + bwd[i] * w;
      else v = lin;
      if (!Number.isFinite(v) || Math.abs(v) > limit) v = lin;
      y[s + i] = v;
    }
  }

  // Public: find short spikes that stand far above the local level and rebuild them from the sound around them.
  // sensitivity 1 to 10 (higher finds more). Returns a new buffer; result.clicksFixed is set when possible.
  async function declick(audioBuffer, opts) {
    checkBuffer(audioBuffer);
    opts = opts || {};
    const sens = clamp(num(opts.sensitivity, 5), 1, 10);
    const thr = 3 + (10 - sens) * 1.5;
    const sr = audioBuffer.sampleRate, len = audioBuffer.length;
    const W = Math.max(8, Math.round(sr * 0.01));
    const margin = Math.max(2, Math.round(sr * 0.0004));
    const maxLen = Math.max(8, Math.round(sr * num(opts.maxLength, 0.004)));
    const sl = slicer(opts.onProgress);
    const chs = channelsOf(audioBuffer);
    const outs = [];
    let fixed = 0;
    for (let c = 0; c < chs.length; c++) {
      const x = chs[c], y = new Float32Array(x);
      const ex = i => (i <= 0 || i >= len - 1) ? 0 : Math.abs(x[i] - 0.5 * (x[i - 1] + x[i + 1]));
      // running mean of |e| over [i - W, i + W]
      let sum = 0;
      for (let i = 0; i <= Math.min(W, len - 1); i++) sum += ex(i);
      let regStart = -1, lastHit = -1;
      const regions = [];
      for (let i = 0; i < len; i++) {
        if (i > 0) {
          const add = i + W, sub = i - W - 1;
          if (add < len) sum += ex(add);
          if (sub >= 0) sum -= ex(sub);
        }
        const cnt = Math.min(len - 1, i + W) - Math.max(0, i - W) + 1;
        const env = Math.max(0, sum) / cnt;
        const e = ex(i);
        if (e > thr * env + 2e-4 && e > thr * 2e-5) {
          if (regStart < 0 || i - lastHit > margin * 2) {
            if (regStart >= 0) regions.push([regStart, lastHit]);
            regStart = i;
          }
          lastHit = i;
        }
        if ((i & 8191) === 0 && sl.due()) await sl.yield((c + 0.6 * i / len) / chs.length);
      }
      if (regStart >= 0) regions.push([regStart, lastHit]);
      for (let r = 0; r < regions.length; r++) {
        const s = Math.max(1, regions[r][0] - margin), e = Math.min(len - 1, regions[r][1] + margin + 1);
        if (e - s > maxLen || e <= s) continue;
        repairGap(y, s, e, sr);
        fixed++;
        if ((r & 63) === 0 && sl.due()) await sl.yield((c + 0.6 + 0.4 * r / regions.length) / chs.length);
      }
      outs.push(y);
    }
    sl.report(1);
    const out = fromChannels(outs, sr);
    try { out.clicksFixed = fixed; } catch (e) { /* read only object */ }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Region attenuation                                                  */
  /* ------------------------------------------------------------------ */
  // Public: lower (or raise) the energy inside a time and frequency rectangle with soft edges.
  async function attenuateRegion(audioBuffer, opts) {
    checkBuffer(audioBuffer);
    opts = opts || {};
    const sr = audioBuffer.sampleRate, len = audioBuffer.length, nyq = sr / 2;
    const n = pow2Size(opts.fftSize, 2048), hop = n / 4, bins = n / 2 + 1, binHz = sr / n;
    let t0 = num(opts.t0, 0), t1 = num(opts.t1, len / sr);
    if (t1 < t0) { const t = t0; t0 = t1; t1 = t; }
    let f0 = clamp(num(opts.f0, 0), 0, nyq), f1 = clamp(num(opts.f1, nyq), 0, nyq);
    if (f1 < f0) { const t = f0; f0 = f1; f1 = t; }
    const g = dbToLin(clamp(num(opts.db, -20), -120, 24));
    const tt = clamp(num(opts.timeTaper, 0.015), 0.001, 0.5);
    const segStart = Math.max(0, Math.floor((t0 - tt) * sr) - n);
    const segEnd = Math.min(len, Math.ceil((t1 + tt) * sr) + n);
    const sl = slicer(opts.onProgress);
    const chs = channelsOf(audioBuffer);
    if (segEnd <= segStart) return cloneBuffer(audioBuffer);
    // frequency weights with soft edges
    const fw = new Float32Array(bins);
    const ftLo = Math.max(2 * binHz, f0 * 0.06), ftHi = Math.max(2 * binHz, f1 * 0.06);
    for (let k = 0; k < bins; k++) {
      const f = k * binHz;
      let w;
      if (f >= f0 && f <= f1) w = 1;
      else if (f < f0) w = f > f0 - ftLo ? 0.5 + 0.5 * Math.cos(Math.PI * (f0 - f) / ftLo) : 0;
      else w = f < f1 + ftHi ? 0.5 + 0.5 * Math.cos(Math.PI * (f - f1) / ftHi) : 0;
      fw[k] = w;
    }
    if (f0 <= binHz) for (let k = 0; k < bins && k * binHz <= f0; k++) fw[k] = 1;
    if (f1 >= nyq - binHz) for (let k = bins - 1; k >= 0 && k * binHz >= f1; k--) fw[k] = 1;
    const timeW = t => {
      if (t >= t0 && t <= t1) return 1;
      if (t < t0) return t > t0 - tt ? 0.5 + 0.5 * Math.cos(Math.PI * (t0 - t) / tt) : 0;
      return t < t1 + tt ? 0.5 + 0.5 * Math.cos(Math.PI * (t - t1) / tt) : 0;
    };
    const outs = [];
    for (let c = 0; c < chs.length; c++) {
      const seg = chs[c].subarray(segStart, segEnd);
      const handler = {
        synth: (j, re, im) => {
          const tw = timeW((segStart + j * hop) / sr);
          if (tw <= 0) return;
          for (let k = 0; k < bins; k++) {
            const w = tw * fw[k];
            if (w <= 0) continue;
            const s = 1 - (1 - g) * w;
            re[k] *= s; im[k] *= s;
          }
        }
      };
      const res = await stftProcess(seg, n, hop, 0, handler, sl, c / chs.length, 1 / chs.length);
      const y = new Float32Array(chs[c]);
      y.set(res, segStart);
      outs.push(y);
    }
    sl.report(1);
    return fromChannels(outs, sr);
  }

  /* ------------------------------------------------------------------ */
  /* Loudness: ITU-R BS.1770-4, EBU R128 loudness range                  */
  /* ------------------------------------------------------------------ */
  function kWeighting(sr) {
    // Stage 1: high shelf. Stage 2: high pass (RLB). Same design as libebur128, exact at 48 kHz.
    let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    let K = Math.tan(Math.PI * f0 / sr);
    const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const s1 = {
      b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0,
      a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0
    };
    f0 = 38.13547087602444; Q = 0.5003270373238773;
    K = Math.tan(Math.PI * f0 / sr);
    a0 = 1 + K / Q + K * K;
    const s2 = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
    return [s1, s2];
  }
  function channelWeights(nch) {
    const w = new Float64Array(nch).fill(1);
    if (nch === 6) { w[3] = 0; w[4] = 1.41; w[5] = 1.41; }
    else if (nch === 5) { w[3] = 1.41; w[4] = 1.41; }
    return w;
  }

  // 4x oversampling interpolation table for true peak: 12 taps per phase, Hann windowed sinc, unity DC gain.
  const TP_TAPS = 12;
  const TP_TABLE = (function () {
    const t = [];
    for (let p = 1; p < 4; p++) {
      const row = new Float64Array(TP_TAPS);
      let s = 0;
      for (let j = 0; j < TP_TAPS; j++) {
        const d = (TP_TAPS / 2 - 1) + p / 4 - j; // distance from tap x[n - 5 + j] to n + p / 4
        const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
        const w = 0.5 + 0.5 * Math.cos(Math.PI * d / (TP_TAPS / 2));
        row[j] = sinc * w; s += row[j];
      }
      for (let j = 0; j < TP_TAPS; j++) row[j] /= s;
      t.push(row);
    }
    return t;
  })();
  function interPeak(x, n) {
    // largest absolute value of the three interpolated points between x[n] and x[n + 1]
    const len = x.length, base = n - (TP_TAPS / 2 - 1);
    let m = 0;
    for (let p = 0; p < 3; p++) {
      const row = TP_TABLE[p];
      let v = 0;
      if (base >= 0 && base + TP_TAPS <= len) {
        for (let j = 0; j < TP_TAPS; j++) v += row[j] * x[base + j];
      } else {
        for (let j = 0; j < TP_TAPS; j++) { const i = base + j; if (i >= 0 && i < len) v += row[j] * x[i]; }
      }
      v = Math.abs(v);
      if (v > m) m = v;
    }
    return m;
  }

  class LoudnessMeter {
    constructor(sr, nch) {
      this.sr = sr; this.nch = nch;
      this.k = kWeighting(sr);
      this.g = channelWeights(nch);
      this.st = new Float64Array(nch * 8);
      this.seg = Math.max(1, Math.round(sr * 0.1));
      this.acc = 0; this.cnt = 0;
      this.segs = [];
      this.peak = 0; this.tp = 0;
    }
    process(chs, from, to) {
      const k1 = this.k[0], k2 = this.k[1], st = this.st, g = this.g, nch = this.nch, seg = this.seg;
      let acc = this.acc, cnt = this.cnt, peak = this.peak, tp = this.tp;
      for (let i = from; i < to; i++) {
        let e = 0;
        for (let c = 0; c < nch; c++) {
          const xv = chs[c][i];
          const ax = xv < 0 ? -xv : xv;
          if (ax > peak) peak = ax;
          if (ax > tp) tp = ax;
          if (g[c] === 0) continue;
          const o = c * 8;
          const y1 = k1.b0 * xv + k1.b1 * st[o] + k1.b2 * st[o + 1] - k1.a1 * st[o + 2] - k1.a2 * st[o + 3];
          st[o + 1] = st[o]; st[o] = xv; st[o + 3] = st[o + 2]; st[o + 2] = y1;
          const y2 = k2.b0 * y1 + k2.b1 * st[o + 4] + k2.b2 * st[o + 5] - k2.a1 * st[o + 6] - k2.a2 * st[o + 7];
          st[o + 5] = st[o + 4]; st[o + 4] = y1; st[o + 7] = st[o + 6]; st[o + 6] = y2;
          e += g[c] * y2 * y2;
        }
        acc += e; cnt++;
        if (cnt === seg) { this.segs.push(acc); acc = 0; cnt = 0; }
      }
      // true peak: only look between samples that are near the current peak, the rest cannot win
      const lim = peak * 0.35;
      for (let c = 0; c < nch; c++) {
        const x = chs[c];
        const end = Math.min(to, x.length - 1);
        for (let i = from; i < end; i++) {
          const a = x[i], b = x[i + 1];
          if ((a > lim || a < -lim || b > lim || b < -lim)) {
            const v = interPeak(x, i);
            if (v > tp) tp = v;
          }
        }
      }
      this.acc = acc; this.cnt = cnt; this.peak = peak; this.tp = tp;
    }
    result() {
      const segs = this.segs, seg = this.seg;
      const L = p => -0.691 + 10 * Math.log10(p);
      let blocks = [];
      if (segs.length >= 4) {
        for (let j = 0; j + 4 <= segs.length; j++) blocks.push((segs[j] + segs[j + 1] + segs[j + 2] + segs[j + 3]) / (4 * seg));
      } else {
        let s = this.acc, c = this.cnt;
        for (const v of segs) { s += v; c += seg; }
        if (c > 0) blocks.push(s / c);
      }
      let lufs = -Infinity, momentaryMax = -Infinity;
      const abs = blocks.filter(p => p > 0 && L(p) > -70);
      for (const p of blocks) if (p > 0) momentaryMax = Math.max(momentaryMax, L(p));
      if (abs.length) {
        const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
        const rel = L(mean) - 10;
        const gated = abs.filter(p => L(p) > rel);
        if (gated.length) lufs = L(gated.reduce((a, b) => a + b, 0) / gated.length);
      }
      // loudness range from 3 s short term blocks every 100 ms
      let lra = 0, shortMax = -Infinity;
      if (segs.length >= 30) {
        const st = [];
        let s = 0;
        for (let j = 0; j < 30; j++) s += segs[j];
        st.push(s / (30 * seg));
        for (let j = 30; j < segs.length; j++) { s += segs[j] - segs[j - 30]; st.push(Math.max(0, s) / (30 * seg)); }
        for (const p of st) if (p > 0) shortMax = Math.max(shortMax, L(p));
        const a = st.filter(p => p > 0 && L(p) > -70);
        if (a.length) {
          const mean = a.reduce((x, y) => x + y, 0) / a.length;
          const rel = L(mean) - 20;
          const v = a.filter(p => L(p) > rel).map(L).sort((x, y) => x - y);
          if (v.length > 1) {
            const pick = q => v[clamp(Math.round(q * (v.length - 1)), 0, v.length - 1)];
            lra = Math.max(0, pick(0.95) - pick(0.10));
          }
        }
      }
      return {
        lufs: lufs,
        peakDb: linToDb(this.peak),
        truePeakDb: linToDb(Math.max(this.tp, this.peak)),
        lra: lra,
        momentaryMax: momentaryMax,
        shortTermMax: shortMax
      };
    }
  }

  // Public: integrated loudness (LUFS), sample peak, true peak (dBTP) and loudness range (LU). Synchronous.
  function loudness(audioBuffer) {
    checkBuffer(audioBuffer);
    const m = new LoudnessMeter(audioBuffer.sampleRate, audioBuffer.numberOfChannels);
    m.process(channelsOf(audioBuffer), 0, audioBuffer.length);
    const r = m.result();
    r.duration = audioBuffer.length / audioBuffer.sampleRate;
    return r;
  }

  // Public: same as loudness, but time sliced and with progress. Returns a Promise.
  async function loudnessAsync(audioBuffer, opts) {
    checkBuffer(audioBuffer);
    opts = opts || {};
    const sl = slicer(opts.onProgress);
    const m = new LoudnessMeter(audioBuffer.sampleRate, audioBuffer.numberOfChannels);
    const chs = channelsOf(audioBuffer), len = audioBuffer.length;
    const CH = 1 << 15;
    for (let a = 0; a < len; a += CH) {
      m.process(chs, a, Math.min(len, a + CH));
      if (sl.due()) await sl.yield(a / len);
    }
    sl.report(1);
    const r = m.result();
    r.duration = len / audioBuffer.sampleRate;
    return r;
  }

  // Gain plus a look ahead peak limiter (5 ms look ahead, smooth attack, 80 ms release).
  async function gainLimit(audioBuffer, gain, ceil, sl, p0, pSpan) {
    const sr = audioBuffer.sampleRate, len = audioBuffer.length, chs = channelsOf(audioBuffer);
    const L = Math.max(1, Math.round(sr * 0.005));
    const r = new Float32Array(len);
    const lim = ceil * 0.35 / Math.max(gain, 1e-12);
    for (let i = 0; i < len; i++) {
      let d = 0;
      for (let c = 0; c < chs.length; c++) {
        const x = chs[c];
        const a = Math.abs(x[i]);
        if (a > d) d = a;
        if (i + 1 < len && (a > lim || Math.abs(x[i + 1]) > lim)) {
          const v = interPeak(x, i);
          if (v > d) d = v;
        }
      }
      d *= gain;
      r[i] = d > ceil ? ceil / d : 1;
      if ((i & 16383) === 0 && sl.due()) await sl.yield(p0 + pSpan * 0.5 * i / len);
    }
    // g1[n] = min of r over [n, n + L] (monotonic queue)
    const g1 = new Float32Array(len);
    const q = new Int32Array(len + L + 2);
    let qh = 0, qt = 0;
    let next = 0;
    for (let n = 0; n < len; n++) {
      const want = Math.min(len - 1, n + L);
      while (next <= want) {
        while (qt > qh && r[q[qt - 1]] >= r[next]) qt--;
        q[qt++] = next++;
      }
      while (q[qh] < n) qh++;
      g1[n] = r[q[qh]];
      if ((n & 16383) === 0 && sl.due()) await sl.yield(p0 + pSpan * 0.5);
    }
    // g2: moving average of g1 over [n - L + 1, n], padded with g1[0]; g3: release smoothing, never above g2
    const rc = 1 - Math.exp(-1 / (0.08 * sr));
    const outs = chs.map(() => new Float32Array(len));
    let sum = g1[0] * L, g3 = 1;
    const ceilSafe = ceil;
    for (let n = 0; n < len; n++) {
      sum += g1[n] - (n - L >= 0 ? g1[n - L] : g1[0]);
      let g2 = sum / L;
      const rec = g3 + (1 - g3) * rc;
      g3 = Math.min(g2, rec);
      const k = gain * g3;
      for (let c = 0; c < chs.length; c++) {
        let v = chs[c][n] * k;
        if (v > ceilSafe) v = ceilSafe; else if (v < -ceilSafe) v = -ceilSafe;
        outs[c][n] = v;
      }
      if ((n & 16383) === 0 && sl.due()) await sl.yield(p0 + pSpan * (0.5 + 0.5 * n / len));
    }
    return fromChannels(outs, sr);
  }

  // Public: gain to reach the target loudness, with a look ahead limiter keeping peaks under the ceiling (dBTP).
  async function matchLoudness(audioBuffer, targetLufs, ceilingDb, opts) {
    checkBuffer(audioBuffer);
    opts = opts || {};
    const target = num(targetLufs, -14);
    const ceilDb = Math.min(0, num(ceilingDb, -1));
    const ceil = dbToLin(ceilDb);
    const sl = slicer(opts.onProgress);
    const first = await loudnessAsync(audioBuffer, { onProgress: f => sl.report(f * 0.15) });
    if (!Number.isFinite(first.lufs)) return cloneBuffer(audioBuffer);
    let gainDb = target - first.lufs;
    let out = null, res = null;
    const tries = 4;
    for (let t = 0; t < tries; t++) {
      const base = 0.15 + 0.85 * t / tries, span = 0.85 / tries;
      out = await gainLimit(audioBuffer, dbToLin(gainDb), ceil * 0.9995, sl, base, span * 0.7);
      res = await loudnessAsync(out, { onProgress: f => sl.report(base + span * (0.7 + 0.3 * f)) });
      if (!Number.isFinite(res.lufs)) break;
      const diff = target - res.lufs;
      if (Math.abs(diff) < 0.05) break;
      if (diff > 0 && gainDb > 40) break;
      gainDb += diff;
    }
    // final safety trim if interpolation still finds a true peak over the ceiling
    if (res && res.truePeakDb > ceilDb) {
      const s = dbToLin(ceilDb - res.truePeakDb) * 0.9995;
      for (let c = 0; c < out.numberOfChannels; c++) {
        const d = out.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] *= s;
      }
    }
    sl.report(1);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Spectrogram worker                                                  */
  /* ------------------------------------------------------------------ */
  const WORKER_SRC =
    'var core = (' + spectroCore.toString() + ')();\n' +
    'var store = null; var st = {};\n' +
    'onmessage = function (e) {\n' +
    '  var m = e.data;\n' +
    '  if (m.type === "data") { store = { id: m.id, data: m.data }; return; }\n' +
    '  if (m.type === "cols") {\n' +
    '    if (!store || store.id !== m.dataId) { postMessage({ job: m.job, error: "no data" }); return; }\n' +
    '    var bins = m.fftSize / 2 + 1; var out = new Float32Array(m.count * bins);\n' +
    '    var chunk = Math.max(1, Math.ceil(m.count / 20));\n' +
    '    for (var c = 0; c < m.count; c += chunk) {\n' +
    '      core.columns(store.data, m.fftSize, m.start, m.step, c, Math.min(m.count, c + chunk), out, st);\n' +
    '      postMessage({ job: m.job, progress: Math.min(1, (c + chunk) / m.count) });\n' +
    '    }\n' +
    '    postMessage({ job: m.job, out: out }, [out.buffer]);\n' +
    '  }\n' +
    '};\n';

  /* ------------------------------------------------------------------ */
  /* Colour map                                                          */
  /* ------------------------------------------------------------------ */
  const LUT = (function () {
    const stops = [
      [0.00, 4, 4, 14], [0.14, 14, 18, 72], [0.32, 86, 28, 128], [0.50, 168, 40, 110],
      [0.66, 238, 104, 36], [0.82, 250, 196, 50], [0.93, 255, 240, 140], [1.00, 255, 255, 255]
    ];
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      let s = 0;
      while (s < stops.length - 2 && v > stops[s + 1][0]) s++;
      const a = stops[s], b = stops[s + 1];
      const t = clamp((v - a[0]) / (b[0] - a[0]), 0, 1);
      lut[i * 3] = a[1] + (b[1] - a[1]) * t;
      lut[i * 3 + 1] = a[2] + (b[2] - a[2]) * t;
      lut[i * 3 + 2] = a[3] + (b[3] - a[3]) * t;
    }
    return lut;
  })();

  /* ------------------------------------------------------------------ */
  /* View                                                                */
  /* ------------------------------------------------------------------ */
  const CSS = [
    '.amsp{display:flex;flex-direction:column;height:100%;min-height:260px;background:' + COL.bg + ';color:' + COL.text + ';font:12px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-sizing:border-box;user-select:none}',
    '.amsp *{box-sizing:border-box}',
    '.amsp-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:4px 6px;background:' + COL.panel + ';border-bottom:1px solid ' + COL.line + '}',
    '.amsp-grp{display:flex;align-items:center;gap:4px;padding-right:8px;border-right:1px solid ' + COL.line + '}',
    '.amsp-grp:last-child{border-right:0}',
    '.amsp-lbl{opacity:.8;white-space:nowrap}',
    '.amsp-title{font-weight:600;color:#e4e4e8;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.amsp button{height:22px;padding:0 8px;background:#2a2a30;color:#dcdce2;border:1px solid #34343b;border-radius:3px;font:inherit;cursor:pointer;white-space:nowrap}',
    '.amsp button:hover:not(:disabled){border-color:#55555e;background:#303037}',
    '.amsp button:disabled{opacity:.45;cursor:default}',
    '.amsp button.amsp-on{border-color:' + COL.accent + ';color:#fff}',
    '.amsp button.amsp-primary{background:' + COL.accent + ';border-color:' + COL.accent + ';color:#fff}',
    '.amsp button.amsp-primary:hover:not(:disabled){background:#ff7068}',
    '.amsp select,.amsp input[type=number]{height:22px;background:' + COL.bg + ';color:#dcdce2;border:1px solid #34343b;border-radius:3px;font:inherit;padding:0 3px}',
    '.amsp input[type=number]{width:52px}',
    '.amsp input[type=range]{width:80px;accent-color:' + COL.accent + '}',
    '.amsp input[type=checkbox]{accent-color:' + COL.accent + ';margin:0}',
    '.amsp-wrap{position:relative;flex:1;min-height:120px;overflow:hidden;background:' + COL.bg + '}',
    '.amsp-wrap canvas{position:absolute;left:0;top:0;width:100%;height:100%;cursor:crosshair}',
    '.amsp-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;opacity:.75}',
    '.amsp-status{display:flex;gap:12px;align-items:center;padding:3px 8px;background:' + COL.panel + ';border-top:1px solid ' + COL.line + ';min-height:22px}',
    '.amsp-status .amsp-msg{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.amsp-status .amsp-ok{color:' + COL.ok + '}',
    '.amsp-status .amsp-err{color:' + COL.accent + '}',
    '.amsp-read{font-variant-numeric:tabular-nums;white-space:nowrap;opacity:.85}'
  ].join('\n');
  let cssAdded = false;
  function addCss() {
    if (cssAdded || typeof document === 'undefined') return;
    cssAdded = true;
    const s = document.createElement('style');
    s.id = 'am-spectral-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k in e && k !== 'list') { try { e[k] = v; } catch (er) { e.setAttribute(k, v); } }
        else e.setAttribute(k, v);
      }
    }
    if (kids) for (const c of kids) if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return e;
  }
  function fmtTime(t, step) {
    const dec = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
    if (t < 60 && step < 60) return t.toFixed(dec) + 's';
    const m = Math.floor(t / 60), s = t - m * 60;
    const ss = s.toFixed(dec);
    return m + ':' + (s < 10 ? '0' : '') + ss;
  }
  function fmtHz(f) {
    if (f >= 1000) return (Math.round(f / 100) / 10) + 'k';
    return String(Math.round(f));
  }
  function fmtClock(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  }

  const ML = 46, MT = 18; // CSS px margins for the Hz ruler (left) and time ruler (top)

  class View {
    constructor(containerEl, engine) {
      this.container = containerEl;
      this.engine = engine || AM.engine || null;
      this.clipId = null;
      this.orig = null;
      this.work = null;
      this.steps = [];
      this.sel = null;
      this.profile = null;
      this.view = { t0: 0, t1: 1 };
      this.cols = null;
      this.mono = null;
      this.dataId = 0;
      this.job = 0;
      this.busy = false;
      this.log = false;
      this.fftSize = 2048;
      this.bright = 20;
      this.contrast = 45;
      this.preview = null;
      this._sig = '';
      this._worker = null;
      this._workerOk = typeof Worker === 'function' && typeof Blob === 'function' && typeof URL !== 'undefined' && !!URL.createObjectURL;
      this._timer = 0;
      this._onChange = () => this._engineChanged();
      addCss();
      this._build();
      if (this.engine && typeof this.engine.on === 'function') this.engine.on('change', this._onChange);
    }

    /* ---------- public ---------- */
    open(clipId) {
      this.clipId = clipId;
      this.sel = null;
      this.profile = null;
      this._load(true);
    }
    close() {
      this._stopPreview();
      this.clipId = null;
      this.orig = this.work = null;
      this.steps = [];
      this.sel = null;
      this.cols = null;
      this.mono = null;
      this.job++;
      this._sig = '';
      if (this._worker) { try { this._worker.terminate(); } catch (e) { /* ignore */ } this._worker = null; }
      this._showEmpty('Pick an audio clip to see its spectrum here.');
      this._updateButtons();
    }
    refresh() {
      if (this.clipId && this.engine) {
        const f = this._find();
        if (!f) { this.close(); return; }
        if (this._sigOf(f.clip) !== this._sig) { this._load(false); return; }
      }
      this._resize();
      this._schedule(0);
      this._draw();
    }
    destroy() {
      this.close();
      if (this.engine && typeof this.engine.off === 'function') this.engine.off('change', this._onChange);
      if (this._ro) { try { this._ro.disconnect(); } catch (e) { /* ignore */ } }
      window.removeEventListener('resize', this._onResize);
      if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    }

    /* ---------- building ---------- */
    _build() {
      const v = this;
      const numIn = (val, min, max, step, title) => el('input', { type: 'number', value: val, min: min, max: max, step: step, title: title });
      const btn = (text, title, fn, cls) => el('button', { type: 'button', text: text, title: title, class: cls || null, onclick: fn });
      const lbl = t => el('span', { class: 'amsp-lbl', text: t });
      const grp = kids => el('div', { class: 'amsp-grp' }, kids);

      this.ui = {};
      const u = this.ui;
      u.title = el('span', { class: 'amsp-title', text: 'Spectral' });
      u.fft = el('select', { title: 'Detail of the picture. Bigger shows finer pitch, smaller shows finer timing.' }, [
        el('option', { value: '1024', text: '1024' }), el('option', { value: '2048', text: '2048', selected: true }),
        el('option', { value: '4096', text: '4096' }), el('option', { value: '8192', text: '8192' })
      ]);
      u.fft.addEventListener('change', () => { v.fftSize = Number(u.fft.value) || 2048; v._schedule(0); });
      u.scale = el('select', { title: 'Frequency scale' }, [
        el('option', { value: 'lin', text: 'Linear' }), el('option', { value: 'log', text: 'Log' })
      ]);
      u.scale.addEventListener('change', () => { v.log = u.scale.value === 'log'; v._image(); v._draw(); });
      u.bright = el('input', { type: 'range', min: 0, max: 60, step: 1, value: this.bright, title: 'Brightness' });
      u.bright.addEventListener('input', () => { v.bright = Number(u.bright.value); v._image(); v._draw(); });
      u.contrast = el('input', { type: 'range', min: 0, max: 100, step: 1, value: this.contrast, title: 'Contrast' });
      u.contrast.addEventListener('input', () => { v.contrast = Number(u.contrast.value); v._image(); v._draw(); });
      u.zOut = btn('-', 'Zoom out', () => v._zoom(1.6));
      u.zIn = btn('+', 'Zoom in', () => v._zoom(1 / 1.6));
      u.zFit = btn('Fit', 'Show the whole clip', () => v._fit());

      u.redDb = numIn(-20, -100, 0, 1, 'How much to lower the selected area, in dB');
      u.reduce = btn('Reduce selection', 'Lower the sound inside the box you dragged', () => v._toolReduce());
      u.learn = btn('Learn noise', 'Drag over a part with only noise, then press this', () => v._toolLearn());
      u.nrAmt = numIn(24, 0, 60, 1, 'How far to lower the noise, in dB');
      u.nrSens = numIn(5, 0, 10, 0.5, 'Sensitivity 0 to 10. Higher removes more but can dull quiet sounds.');
      u.nrSmooth = numIn(5, 0, 10, 0.5, 'Smoothing 0 to 10. Higher avoids watery, chirpy leftovers.');
      u.nr = btn('Reduce noise', 'Lower steady background noise (on the selected time, or the whole clip)', () => v._toolDenoise());
      u.humF = el('select', { title: 'Mains frequency. 50 Hz in most of the world, 60 Hz in the Americas.' }, [
        el('option', { value: '50', text: '50 Hz' }), el('option', { value: '60', text: '60 Hz' })
      ]);
      u.humH = numIn(4, 1, 8, 1, 'Number of harmonics to remove (1 to 8)');
      u.hum = btn('Remove hum', 'Remove mains hum and its harmonics', () => v._toolHum());
      u.clkSens = numIn(5, 1, 10, 1, 'Sensitivity 1 to 10. Higher finds more clicks.');
      u.clk = btn('Remove clicks', 'Find and repair short clicks and pops', () => v._toolClicks());

      u.before = el('input', { type: 'checkbox', title: 'Preview the sound before your changes' });
      u.prev = btn('Preview', 'Play the result (the selected time, or the whole clip)', () => v._togglePreview());
      u.undo = btn('Step back', 'Undo the last change in this panel', () => v._stepBack());
      u.reset = btn('Reset', 'Drop all changes that are not applied yet', () => v._reset());
      u.apply = btn('Apply', 'Put the result on the clip. You can undo it with Ctrl+Z.', () => v._apply(), 'amsp-primary');

      const bar1 = el('div', { class: 'amsp-bar' }, [
        grp([u.title]),
        grp([lbl('Detail'), u.fft, lbl('Scale'), u.scale]),
        grp([lbl('Brightness'), u.bright, lbl('Contrast'), u.contrast]),
        grp([lbl('Zoom'), u.zOut, u.zIn, u.zFit])
      ]);
      const bar2 = el('div', { class: 'amsp-bar' }, [
        grp([u.redDb, lbl('dB'), u.reduce]),
        grp([u.learn, lbl('Amount'), u.nrAmt, lbl('Sensitivity'), u.nrSens, lbl('Smoothing'), u.nrSmooth, u.nr]),
        grp([u.humF, lbl('Harmonics'), u.humH, u.hum]),
        grp([lbl('Sensitivity'), u.clkSens, u.clk]),
        grp([el('label', { class: 'amsp-lbl', title: u.before.title }, [u.before, ' Before']), u.prev, u.undo, u.reset, u.apply])
      ]);
      u.canvas = el('canvas', {});
      u.empty = el('div', { class: 'amsp-empty', text: 'Pick an audio clip to see its spectrum here.' });
      u.wrap = el('div', { class: 'amsp-wrap' }, [u.canvas, u.empty]);
      u.msg = el('span', { class: 'amsp-msg', text: 'Drag on the picture to select a time and frequency area. Scroll to zoom, Shift and scroll to move.' });
      u.read = el('span', { class: 'amsp-read', text: '' });
      u.prog = el('span', { class: 'amsp-read', text: '' });
      const status = el('div', { class: 'amsp-status' }, [u.msg, u.prog, u.read]);
      this.root = el('div', { class: 'amsp' }, [bar1, bar2, u.wrap, status]);
      this.container.appendChild(this.root);
      try { this.g = u.canvas.getContext('2d'); } catch (e) { this.g = null; }

      u.canvas.addEventListener('mousedown', e => this._down(e));
      u.canvas.addEventListener('mousemove', e => { if (!this._drag) this._hover(e); });
      u.canvas.addEventListener('mouseleave', () => { u.read.textContent = ''; });
      u.canvas.addEventListener('dblclick', () => { this.sel = null; this._draw(); this._updateButtons(); });
      u.canvas.addEventListener('wheel', e => this._wheel(e), { passive: false });
      this._onResize = () => { this._resize(); this._schedule(150); this._draw(); };
      if (typeof ResizeObserver === 'function') {
        this._ro = new ResizeObserver(() => this._onResize());
        this._ro.observe(u.wrap);
      } else {
        window.addEventListener('resize', this._onResize);
      }
      this.root.tabIndex = -1;
      this.root.addEventListener('keydown', e => {
        if (e.key === 'Escape') { this.sel = null; this._draw(); this._updateButtons(); }
      });
      this._resize();
      this._updateButtons();
    }

    _showEmpty(text) {
      this.ui.empty.textContent = text;
      this.ui.empty.style.display = text ? '' : 'none';
      this._draw();
    }
    _say(text, kind) {
      this.ui.msg.textContent = text;
      this.ui.msg.className = 'amsp-msg' + (kind === 'ok' ? ' amsp-ok' : kind === 'err' ? ' amsp-err' : '');
    }
    _updateButtons() {
      const u = this.ui, has = !!this.work, b = this.busy;
      const dis = (x, d) => { x.disabled = !!d; };
      [u.learn, u.nr, u.hum, u.clk, u.zOut, u.zIn, u.zFit].forEach(x => dis(x, !has || b));
      dis(u.reduce, !has || b || !this.sel);
      dis(u.prev, !has || (b && !this.preview));
      dis(u.undo, !has || b || !this.steps.length);
      dis(u.reset, !has || b || this.work === this.orig);
      dis(u.apply, !has || b || this.work === this.orig);
      u.prev.textContent = this.preview ? 'Stop' : 'Preview';
      u.prev.classList.toggle('amsp-on', !!this.preview);
      u.learn.classList.toggle('amsp-on', !!(this.profile && !this.profile.auto));
    }

    /* ---------- loading ---------- */
    _find() {
      if (!this.engine || !this.clipId || typeof this.engine.findClip !== 'function') return null;
      const f = this.engine.findClip(this.clipId);
      return f && f.clip ? f : null;
    }
    _sigOf(clip) {
      return [clip.srcId, clip.offset, clip.length, clip.rate || 1].join('|');
    }
    _load(fresh) {
      this._stopPreview();
      const f = this._find();
      if (!f) { this.orig = this.work = null; this._showEmpty('That clip was not found.'); this._updateButtons(); return; }
      const clip = f.clip;
      if (clip.kind && clip.kind !== 'audio') {
        this.orig = this.work = null;
        this._showEmpty('Spectral tools work on audio clips. Pick an audio clip.');
        this._updateButtons();
        return;
      }
      const src = this.engine.sources && this.engine.sources.get(clip.srcId);
      if (!src || !src.buffer) {
        this.orig = this.work = null;
        this._showEmpty('The audio for this clip is not loaded yet.');
        this._updateButtons();
        return;
      }
      const buf = src.buffer, sr = buf.sampleRate;
      const rate = clip.rate > 0 ? clip.rate : 1;
      const s0 = clamp(Math.round(num(clip.offset, 0) * sr), 0, buf.length - 1);
      const n = clamp(Math.round(num(clip.length, buf.duration) * rate * sr), 1, buf.length - s0);
      this.srcName = src.name || clip.name || 'Audio';
      this.orig = sliceBuffer(buf, s0, s0 + n);
      this.work = this.orig;
      this.steps = [];
      this._sig = this._sigOf(clip);
      this.ui.title.textContent = clip.name || this.srcName;
      this.ui.title.title = clip.name || this.srcName;
      const dur = this.orig.length / sr;
      if (fresh || this.view.t1 > dur || this.view.t1 <= this.view.t0) this.view = { t0: 0, t1: dur };
      if (this.sel && (this.sel.t0 >= dur)) this.sel = null;
      this.cols = null;
      this._showEmpty('');
      this._newData();
      this._updateButtons();
    }
    _engineChanged() {
      if (!this.clipId) return;
      const f = this._find();
      if (!f) { this.close(); this._showEmpty('The clip was removed.'); return; }
      if (this._sigOf(f.clip) !== this._sig) {
        const pending = this.work && this.work !== this.orig && !this._applying;
        this._load(false);
        if (pending) this._say('The clip changed, so changes that were not applied were dropped.');
      }
    }

    _setWork(buf, label) {
      this.steps.push(this.work);
      if (this.steps.length > 12) this.steps.shift();
      this.work = buf;
      this._newData();
      this._updateButtons();
      if (label) this._say(label + ' Press Preview to listen, then Apply to keep it.', 'ok');
    }
    _stepBack() {
      if (!this.steps.length) return;
      this._stopPreview();
      this.work = this.steps.pop();
      this._newData();
      this._updateButtons();
      this._say('Went back one step.');
    }
    _reset() {
      this._stopPreview();
      this.work = this.orig;
      this.steps = [];
      this._newData();
      this._updateButtons();
      this._say('All changes not applied were dropped.');
    }

    /* ---------- spectrogram data ---------- */
    _newData() {
      const w = this.work;
      if (!w) return;
      const len = w.length, chs = channelsOf(w);
      const mono = new Float32Array(len);
      const k = 1 / chs.length;
      for (const d of chs) for (let i = 0; i < len; i++) mono[i] += d[i] * k;
      this.mono = mono;
      this.dataId++;
      if (this._workerOk) {
        try {
          if (!this._worker) this._makeWorker();
          const copy = mono.slice();
          this._worker.postMessage({ type: 'data', id: this.dataId, data: copy }, [copy.buffer]);
        } catch (e) { this._workerOk = false; this._worker = null; }
      }
      this._schedule(0);
    }
    _makeWorker() {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      this._worker = new Worker(url);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      this._worker.onmessage = e => this._workerMsg(e.data);
      this._worker.onerror = () => {
        this._workerOk = false;
        try { this._worker.terminate(); } catch (er) { /* ignore */ }
        this._worker = null;
        this._schedule(0);
      };
    }
    _schedule(ms) {
      clearTimeout(this._timer);
      if (!this.work) return;
      this._timer = setTimeout(() => this._compute(), ms || 0);
    }
    _compute() {
      if (!this.work || !this.mono) return;
      const p = this.plot;
      if (!p || p.w < 2 || p.h < 2) return;
      const sr = this.work.sampleRate;
      const count = clamp(Math.round(p.w), 1, 4096);
      const t0 = this.view.t0, t1 = this.view.t1;
      const req = {
        job: ++this.job, dataId: this.dataId, fftSize: this.fftSize,
        start: t0 * sr, step: (t1 - t0) * sr / count, count: count, t0: t0, t1: t1, sr: sr
      };
      this._req = req;
      this.ui.prog.textContent = 'Drawing...';
      if (this._workerOk && this._worker) {
        try {
          this._worker.postMessage({ type: 'cols', job: req.job, dataId: req.dataId, fftSize: req.fftSize, start: req.start, step: req.step, count: req.count });
          return;
        } catch (e) { this._workerOk = false; }
      }
      this._computeHere(req);
    }
    _workerMsg(m) {
      if (!this._req || m.job !== this._req.job) return;
      if (m.error) { this._computeHere(this._req); return; }
      if (m.progress != null && !m.out) { this.ui.prog.textContent = 'Drawing ' + Math.round(m.progress * 100) + '%'; return; }
      if (m.out) this._gotCols(this._req, m.out);
    }
    async _computeHere(req) {
      const bins = req.fftSize / 2 + 1;
      const out = new Float32Array(req.count * bins);
      const st = {};
      const mono = this.mono;
      let c = 0;
      while (c < req.count) {
        const t = now();
        let c1 = c;
        while (c1 < req.count && now() - t < 20) {
          const e = Math.min(req.count, c1 + 4);
          CORE.columns(mono, req.fftSize, req.start, req.step, c1, e, out, st);
          c1 = e;
        }
        c = c1;
        this.ui.prog.textContent = 'Drawing ' + Math.round(c / req.count * 100) + '%';
        await pause();
        if (this.job !== req.job || this.mono !== mono) return;
      }
      this._gotCols(req, out);
    }
    _gotCols(req, out) {
      this.cols = { data: out, count: req.count, bins: req.fftSize / 2 + 1, fftSize: req.fftSize, t0: req.t0, t1: req.t1, sr: req.sr };
      this.ui.prog.textContent = '';
      this._image();
      this._draw();
    }

    // Build the colour image from the cached dB columns for the current scale and levels.
    _image() {
      const c = this.cols, p = this.plot;
      if (!c || !p || typeof document === 'undefined') return;
      const W = c.count, H = Math.max(1, Math.round(p.h));
      if (!this._off) this._off = document.createElement('canvas');
      const off = this._off;
      if (off.width !== W) off.width = W;
      if (off.height !== H) off.height = H;
      let og = null;
      try { og = off.getContext('2d'); } catch (e) { og = null; }
      if (!og) return;
      const img = og.createImageData(W, H), px = img.data;
      const top = -this.bright, range = 140 - this.contrast * 1.1, floor = top - range;
      const scale = 255 / range;
      const bins = c.bins, nyq = c.sr / 2, binHz = c.sr / c.fftSize;
      const lo = new Float32Array(H), hi = new Float32Array(H);
      for (let y = 0; y < H; y++) {
        const fa = this._yToF(y / H, nyq), fb = this._yToF((y + 1) / H, nyq);
        lo[y] = Math.min(fa, fb) / binHz; hi[y] = Math.max(fa, fb) / binHz;
      }
      const data = c.data;
      for (let y = 0; y < H; y++) {
        const a = lo[y], b = hi[y];
        const interp = b - a < 1;
        const center = (a + b) / 2;
        const k0 = clamp(Math.floor(center), 0, bins - 1), k1 = Math.min(bins - 1, k0 + 1), fr = center - k0;
        const ka = clamp(Math.floor(a), 0, bins - 1), kb = clamp(Math.ceil(b), 0, bins - 1);
        let o = y * W * 4;
        for (let x = 0; x < W; x++) {
          const base = x * bins;
          let db;
          if (interp) db = data[base + k0] * (1 - fr) + data[base + k1] * fr;
          else {
            db = -1e9;
            for (let k = ka; k <= kb; k++) if (data[base + k] > db) db = data[base + k];
          }
          let i = Math.round((db - floor) * scale);
          i = i < 0 ? 0 : i > 255 ? 255 : i;
          px[o] = LUT[i * 3]; px[o + 1] = LUT[i * 3 + 1]; px[o + 2] = LUT[i * 3 + 2]; px[o + 3] = 255;
          o += 4;
        }
      }
      og.putImageData(img, 0, 0);
      this._imgCols = c;
    }

    /* ---------- geometry ---------- */
    _resize() {
      const wrap = this.ui.wrap, cv = this.ui.canvas;
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const cw = Math.max(1, wrap.clientWidth || 0), ch = Math.max(1, wrap.clientHeight || 0);
      const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
      if (cv.width !== W) cv.width = W;
      if (cv.height !== H) cv.height = H;
      this.dpr = dpr;
      this.cssW = cw; this.cssH = ch;
      const oldH = this.plot ? this.plot.h : 0;
      this.plot = { x: ML * dpr, y: MT * dpr, w: Math.max(0, W - ML * dpr), h: Math.max(0, H - MT * dpr) };
      if (this.cols && Math.round(this.plot.h) !== Math.round(oldH)) this._image();
    }
    _nyq() { return this.work ? this.work.sampleRate / 2 : 24000; }
    _fmin(nyq) { return Math.min(20, nyq / 100); }
    // u: 0 at the top, 1 at the bottom
    _yToF(u, nyq) {
      nyq = nyq || this._nyq();
      if (!this.log) return (1 - u) * nyq;
      const fmin = this._fmin(nyq);
      return fmin * Math.pow(nyq / fmin, 1 - u);
    }
    _fToU(f, nyq) {
      nyq = nyq || this._nyq();
      if (!this.log) return 1 - f / nyq;
      const fmin = this._fmin(nyq);
      if (f <= fmin) return 1;
      return 1 - Math.log(f / fmin) / Math.log(nyq / fmin);
    }
    _tToX(t) { const p = this.plot; return p.x + (t - this.view.t0) / (this.view.t1 - this.view.t0) * p.w; }
    _xToT(x) { const p = this.plot; return this.view.t0 + (x - p.x) / Math.max(1, p.w) * (this.view.t1 - this.view.t0); }
    _evPos(e) {
      const r = this.ui.canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * this.dpr, y: (e.clientY - r.top) * this.dpr };
    }
    _dur() { return this.work ? this.work.length / this.work.sampleRate : 0; }

    /* ---------- drawing ---------- */
    _draw() {
      const g = this.g, cv = this.ui.canvas;
      if (!g) return;
      const W = cv.width, H = cv.height, p = this.plot, dpr = this.dpr || 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = COL.bg;
      g.fillRect(0, 0, W, H);
      if (!this.work || !p) return;
      g.fillStyle = '#050510';
      g.fillRect(p.x, p.y, p.w, p.h);
      if (this._off && this._imgCols) {
        const c = this._imgCols;
        const dx = this._tToX(c.t0), dw = this._tToX(c.t1) - dx;
        g.save();
        g.beginPath(); g.rect(p.x, p.y, p.w, p.h); g.clip();
        g.imageSmoothingEnabled = false;
        g.drawImage(this._off, 0, 0, this._off.width, this._off.height, dx, p.y, dw, p.h);
        g.restore();
      }
      this._rulers(g, W, H, p, dpr);
      // selection
      if (this.sel) {
        const s = this.sel, nyq = this._nyq();
        const x0 = this._tToX(s.t0), x1 = this._tToX(s.t1);
        const y0 = p.y + this._fToU(s.f1, nyq) * p.h, y1 = p.y + this._fToU(s.f0, nyq) * p.h;
        g.save();
        g.beginPath(); g.rect(p.x, p.y, p.w, p.h); g.clip();
        g.fillStyle = 'rgba(255,91,82,0.13)';
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.strokeStyle = COL.accent;
        g.lineWidth = Math.max(1, dpr);
        g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
        g.restore();
        g.fillStyle = 'rgba(255,91,82,0.55)';
        g.fillRect(x0, p.y - 3 * dpr, Math.max(1, x1 - x0), 3 * dpr);
      }
      // preview cursor
      if (this.preview && this.preview.pos != null) {
        const x = this._tToX(this.preview.pos);
        if (x >= p.x && x <= p.x + p.w) {
          g.fillStyle = COL.ok;
          g.fillRect(Math.round(x), 0, Math.max(1, Math.round(dpr)), H);
        }
      }
    }
    _rulers(g, W, H, p, dpr) {
      g.fillStyle = COL.panel;
      g.fillRect(0, 0, W, p.y);
      g.fillRect(0, 0, p.x, H);
      g.fillStyle = COL.line;
      g.fillRect(p.x, p.y - dpr, W - p.x, dpr);
      g.fillRect(p.x - dpr, p.y, dpr, H - p.y);
      g.font = Math.round(10 * dpr) + 'px system-ui,-apple-system,Segoe UI,sans-serif';
      g.textBaseline = 'middle';
      g.fillStyle = COL.text;
      // time ruler
      const span = this.view.t1 - this.view.t0;
      const pxPerSec = p.w / Math.max(1e-9, span) / dpr;
      const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
      let step = steps[steps.length - 1];
      for (const s of steps) if (s * pxPerSec >= 70) { step = s; break; }
      const first = Math.ceil(this.view.t0 / step) * step;
      g.textAlign = 'left';
      for (let t = first; t <= this.view.t1 + 1e-9; t += step) {
        const x = Math.round(this._tToX(t));
        g.fillStyle = COL.line;
        g.fillRect(x, p.y - 6 * dpr, dpr, 6 * dpr);
        g.fillStyle = COL.text;
        g.fillText(fmtTime(t, step), x + 3 * dpr, p.y * 0.45);
      }
      // Hz ruler
      const nyq = this._nyq();
      let marks = [];
      if (this.log) {
        const all = [20, 30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 15000, 20000, 30000, 40000];
        marks = all.filter(f => f >= this._fmin(nyq) && f <= nyq);
      } else {
        const hzSteps = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000];
        let hs = hzSteps[hzSteps.length - 1];
        for (const s of hzSteps) if (s / nyq * (p.h / dpr) >= 28) { hs = s; break; }
        for (let f = hs; f < nyq; f += hs) marks.push(f);
      }
      g.textAlign = 'right';
      let lastY = -1e9;
      for (const f of marks) {
        const y = Math.round(p.y + this._fToU(f, nyq) * p.h);
        if (y < p.y + 6 * dpr || y > H - 2 * dpr) continue;
        if (Math.abs(y - lastY) < 14 * dpr) continue;
        lastY = y;
        g.fillStyle = COL.line;
        g.fillRect(p.x - 5 * dpr, y, 5 * dpr, dpr);
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(p.x, y, p.w, dpr);
        g.fillStyle = COL.text;
        g.fillText(fmtHz(f), p.x - 7 * dpr, y);
      }
      g.textAlign = 'left';
      g.fillStyle = COL.text;
      g.fillText('Hz', 4 * dpr, p.y * 0.45);
    }

    /* ---------- mouse ---------- */
    _down(e) {
      if (!this.work || e.button !== 0) return;
      e.preventDefault();
      try { this.root.focus({ preventScroll: true }); } catch (er) { /* ignore */ }
      const pos = this._evPos(e), p = this.plot, nyq = this._nyq(), dur = this._dur();
      const mode = pos.y < p.y ? 'time' : pos.x < p.x ? 'freq' : 'rect';
      const t = clamp(this._xToT(pos.x), 0, dur);
      const f = clamp(this._yToF((pos.y - p.y) / p.h, nyq), 0, nyq);
      this._drag = { mode: mode, x: pos.x, y: pos.y, t: t, f: f, moved: false };
      const move = ev => {
        const q = this._evPos(ev), d = this._drag;
        if (!d) return;
        if (Math.abs(q.x - d.x) > 3 * this.dpr || Math.abs(q.y - d.y) > 3 * this.dpr) d.moved = true;
        if (!d.moved) return;
        const t2 = clamp(this._xToT(q.x), 0, dur);
        const f2 = clamp(this._yToF(clamp((q.y - p.y) / p.h, 0, 1), nyq), 0, nyq);
        if (d.mode === 'time') this.sel = { t0: Math.min(d.t, t2), t1: Math.max(d.t, t2), f0: 0, f1: nyq };
        else if (d.mode === 'freq') this.sel = { t0: 0, t1: dur, f0: Math.min(d.f, f2), f1: Math.max(d.f, f2) };
        else this.sel = { t0: Math.min(d.t, t2), t1: Math.max(d.t, t2), f0: Math.min(d.f, f2), f1: Math.max(d.f, f2) };
        this._draw();
        this._selInfo();
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        const d = this._drag;
        this._drag = null;
        if (d && !d.moved) { this.sel = null; this._draw(); }
        if (this.sel && this.sel.t1 - this.sel.t0 < 1e-4) { this.sel = null; this._draw(); }
        this._updateButtons();
        this._selInfo();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
    _selInfo() {
      const s = this.sel;
      if (!s) { this._say('Drag on the picture to select a time and frequency area. Drag on the top ruler to select time only.'); return; }
      this._say('Selected ' + fmtClock(s.t0) + ' to ' + fmtClock(s.t1) + ' (' + (s.t1 - s.t0).toFixed(3) + ' s), ' +
        Math.round(s.f0) + ' to ' + Math.round(s.f1) + ' Hz.');
    }
    _hover(e) {
      if (!this.work || !this.cols) return;
      const pos = this._evPos(e), p = this.plot;
      if (pos.x < p.x || pos.y < p.y) { this.ui.read.textContent = ''; return; }
      const t = this._xToT(pos.x), nyq = this._nyq();
      const f = this._yToF((pos.y - p.y) / p.h, nyq);
      const c = this.cols;
      const ci = Math.floor((t - c.t0) / (c.t1 - c.t0) * c.count);
      let txt = fmtClock(Math.max(0, t)) + '  ' + Math.round(f) + ' Hz';
      if (ci >= 0 && ci < c.count) {
        const k = clamp(Math.round(f / (c.sr / c.fftSize)), 0, c.bins - 1);
        txt += '  ' + c.data[ci * c.bins + k].toFixed(1) + ' dB';
      }
      this.ui.read.textContent = txt;
    }
    _wheel(e) {
      if (!this.work) return;
      e.preventDefault();
      const pos = this._evPos(e);
      const dx = e.deltaX || 0, dy = e.deltaY || 0;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 200 : 1;
      if (e.shiftKey || Math.abs(dx) > Math.abs(dy)) {
        const d = (Math.abs(dx) > Math.abs(dy) ? dx : dy) * unit;
        const span = this.view.t1 - this.view.t0;
        this._setView(this.view.t0 + d / Math.max(1, this.plot.w / this.dpr) * span, span);
      } else {
        const factor = Math.exp(dy * unit * 0.0015);
        this._zoom(factor, this._xToT(pos.x));
      }
    }
    _zoom(factor, at) {
      if (!this.work) return;
      const dur = this._dur();
      const span = this.view.t1 - this.view.t0;
      const minSpan = Math.min(dur, Math.max(0.02, 64 / this.work.sampleRate * 32));
      const ns = clamp(span * factor, minSpan, dur);
      const c = at == null ? (this.view.t0 + this.view.t1) / 2 : at;
      const r = span > 0 ? (c - this.view.t0) / span : 0.5;
      this._setView(c - r * ns, ns);
    }
    _fit() { this._setView(0, this._dur()); }
    _setView(t0, span) {
      const dur = this._dur();
      span = clamp(span, 1e-4, dur);
      t0 = clamp(t0, 0, Math.max(0, dur - span));
      if (Math.abs(t0 - this.view.t0) < 1e-12 && Math.abs(t0 + span - this.view.t1) < 1e-12) return;
      this.view = { t0: t0, t1: t0 + span };
      this._draw();
      this._schedule(120);
    }

    /* ---------- tools ---------- */
    async _run(label, fn) {
      if (this.busy || !this.work) return;
      this._stopPreview();
      this.busy = true;
      this._updateButtons();
      this._say(label + '...');
      const startWork = this.work;
      try {
        const res = await fn(f => { this.ui.prog.textContent = label + ' ' + Math.round(f * 100) + '%'; });
        this.ui.prog.textContent = '';
        if (res && this.work === startWork) this._setWork(res.buffer, res.message);
      } catch (e) {
        this.ui.prog.textContent = '';
        this._say('That did not work: ' + (e && e.message ? e.message : String(e)), 'err');
        if (this.engine && this.engine.emit) { try { this.engine.emit('error', 'Spectral: ' + (e && e.message ? e.message : e)); } catch (er) { /* ignore */ } }
      } finally {
        this.busy = false;
        this._updateButtons();
      }
    }
    // Process only the selected time (with short crossfades), or the whole clip when nothing is selected.
    async _inRange(fn, onProgress) {
      const buf = this.work, s = this.sel, sr = buf.sampleRate;
      if (!s) return fn(buf, onProgress);
      const s0 = clamp(Math.floor(s.t0 * sr), 0, buf.length), s1 = clamp(Math.ceil(s.t1 * sr), 0, buf.length);
      if (s1 - s0 < 2) throw new Error('The selection is too short.');
      const pad = Math.round(sr * 0.5);
      const p0 = Math.max(0, s0 - pad), p1 = Math.min(buf.length, s1 + pad);
      const seg = await fn(sliceBuffer(buf, p0, p1), onProgress);
      const cf = Math.max(1, Math.min(Math.round(sr * 0.01), Math.floor((s1 - s0) / 2)));
      const outs = [];
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const o = buf.getChannelData(c), r = seg.getChannelData(Math.min(c, seg.numberOfChannels - 1));
        const y = new Float32Array(o);
        for (let i = s0; i < s1; i++) {
          let w = 1;
          if (i - s0 < cf) w = 0.5 - 0.5 * Math.cos(Math.PI * (i - s0 + 0.5) / cf);
          else if (s1 - 1 - i < cf) w = 0.5 - 0.5 * Math.cos(Math.PI * (s1 - 1 - i + 0.5) / cf);
          y[i] = o[i] * (1 - w) + r[i - p0] * w;
        }
        outs.push(y);
      }
      const out = fromChannels(outs, sr);
      if (seg.clicksFixed != null) { try { out.clicksFixed = seg.clicksFixed; } catch (e) { /* ignore */ } }
      return out;
    }
    _toolReduce() {
      const s = this.sel;
      if (!s) { this._say('Drag a box on the picture first.'); return; }
      const db = clamp(num(this.ui.redDb.value, -20), -100, 0);
      this._run('Reducing the selection', async prog => ({
        buffer: await attenuateRegion(this.work, { t0: s.t0, t1: s.t1, f0: s.f0, f1: s.f1, db: db, fftSize: Math.max(2048, this.fftSize), onProgress: prog }),
        message: 'The selected area was lowered by ' + Math.abs(db) + ' dB.'
      }));
    }
    _toolLearn() {
      const s = this.sel;
      if (!s || s.t1 - s.t0 < 0.05) { this._say('Drag over a part that has only noise (at least a short moment), then press Learn noise.'); return; }
      try {
        this.profile = noiseProfile(this.work, s.t0, s.t1, { fftSize: 2048 });
        this._say('Noise learned from ' + (s.t1 - s.t0).toFixed(2) + ' s. Now press Reduce noise. Clear the selection first to clean the whole clip.', 'ok');
      } catch (e) {
        this._say('Could not learn the noise: ' + e.message, 'err');
      }
      this._updateButtons();
    }
    _toolDenoise() {
      const amount = clamp(num(this.ui.nrAmt.value, 24), 0, 60);
      const sensitivity = clamp(num(this.ui.nrSens.value, 5), 0, 10);
      const smoothing = clamp(num(this.ui.nrSmooth.value, 5), 0, 10);
      const prof = this.profile;
      const note = prof ? '' : ' No noise was learned, so it used the quietest parts as the noise.';
      this._run('Reducing noise', async prog => ({
        buffer: await this._inRange((b, pr) => denoise(b, prof, { amount: amount, sensitivity: sensitivity, smoothing: smoothing, onProgress: pr }), prog),
        message: 'Noise was lowered by up to ' + amount + ' dB.' + note
      }));
    }
    _toolHum() {
      const freq = Number(this.ui.humF.value) === 60 ? 60 : 50;
      const harmonics = clamp(Math.round(num(this.ui.humH.value, 4)), 1, 8);
      this._run('Removing hum', async prog => ({
        buffer: await this._inRange((b, pr) => dehum(b, { freq: freq, harmonics: harmonics, q: 30, onProgress: pr }), prog),
        message: 'Hum at ' + freq + ' Hz and ' + (harmonics - 1) + ' harmonics was removed.'
      }));
    }
    _toolClicks() {
      const sensitivity = clamp(Math.round(num(this.ui.clkSens.value, 5)), 1, 10);
      this._run('Removing clicks', async prog => {
        const b = await this._inRange((x, pr) => declick(x, { sensitivity: sensitivity, onProgress: pr }), prog);
        const n = b.clicksFixed;
        if (n === 0) { this._say('No clicks were found. Try a higher sensitivity.'); return null; }
        return { buffer: b, message: (n != null ? n + ' click' + (n === 1 ? ' was' : 's were') : 'Clicks were') + ' repaired.' };
      });
    }

    /* ---------- preview ---------- */
    _togglePreview() {
      if (this.preview) { this._stopPreview(); return; }
      if (!this.work || !this.engine || typeof this.engine.ensure !== 'function') return;
      let ctx;
      try { ctx = this.engine.ensure(); } catch (e) { ctx = null; }
      if (!ctx) { this._say('Sound could not start in this browser.', 'err'); return; }
      try { if (this.engine.playing && typeof this.engine.pause === 'function') this.engine.pause(); } catch (e) { /* ignore */ }
      const src = this.ui.before.checked ? this.orig : this.work;
      let buf = src;
      const native = typeof AudioBuffer === 'function' && src instanceof AudioBuffer;
      if (!native) {
        buf = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
        for (let c = 0; c < src.numberOfChannels; c++) setChannel(buf, c, src.getChannelData(c));
      }
      const dur = src.length / src.sampleRate;
      const t0 = this.sel ? clamp(this.sel.t0, 0, dur) : 0;
      const t1 = this.sel ? clamp(this.sel.t1, t0, dur) : dur;
      if (t1 - t0 < 0.005) return;
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.connect(ctx.destination);
      const startAt = ctx.currentTime + 0.02;
      node.start(startAt, t0, t1 - t0);
      const pv = { node: node, ctx: ctx, startAt: startAt, t0: t0, t1: t1, pos: t0 };
      node.onended = () => { if (this.preview === pv) this._stopPreview(); };
      pv.timer = setInterval(() => {
        pv.pos = clamp(t0 + (ctx.currentTime - startAt), t0, t1);
        this._draw();
      }, 50);
      this.preview = pv;
      this._updateButtons();
      this._say('Playing ' + (this.ui.before.checked ? 'the sound before your changes' : 'the result') + (this.sel ? ' for the selected time.' : '.'));
    }
    _stopPreview() {
      const pv = this.preview;
      if (!pv) return;
      this.preview = null;
      clearInterval(pv.timer);
      try { pv.node.onended = null; pv.node.stop(); } catch (e) { /* already stopped */ }
      try { pv.node.disconnect(); } catch (e) { /* ignore */ }
      this._updateButtons();
      this._draw();
    }

    /* ---------- apply ---------- */
    _apply() {
      if (!this.work || this.work === this.orig || !this.engine) { this._say('Nothing to apply yet.'); return; }
      const f = this._find();
      if (!f) { this._say('The clip was not found.', 'err'); return; }
      this._stopPreview();
      const clip = f.clip;
      let buf = this.work;
      try {
        const native = typeof AudioBuffer === 'function' && buf instanceof AudioBuffer;
        if (!native && this.engine.ctx && this.engine.ctx.createBuffer) {
          const nb = this.engine.ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
          for (let c = 0; c < buf.numberOfChannels; c++) setChannel(nb, c, buf.getChannelData(c));
          buf = nb;
        }
        this._applying = true;
        const name = String(this.srcName || clip.name || 'Audio').replace(/ \(repaired\)$/, '') + ' (repaired)';
        const newId = this.engine.addSource(buf, name);
        const length = clip.length;
        const doIt = () => this.engine.updateClip(this.clipId, { srcId: newId, offset: 0, length: length });
        if (typeof this.engine.batch === 'function') this.engine.batch('Spectral repair', doIt);
        else doIt();
        this._applying = false;
        const f2 = this._find();
        if (f2 && this._sigOf(f2.clip) !== this._sig) this._load(false);
        this._say('Applied to the clip. Use Undo (Ctrl+Z) to go back.', 'ok');
      } catch (e) {
        this._applying = false;
        this._say('Could not apply: ' + (e && e.message ? e.message : e), 'err');
      }
    }
  }

  AM.Spectral = {
    FFT: FFT,
    stft: stft,
    stftComplex: stftComplex,
    istft: istft,
    noiseProfile: noiseProfile,
    denoise: denoise,
    dehum: dehum,
    declick: declick,
    attenuateRegion: attenuateRegion,
    loudness: loudness,
    loudnessAsync: loudnessAsync,
    matchLoudness: matchLoudness,
    createBuffer: createBuffer,
    View: View
  };
})();
