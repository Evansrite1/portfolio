/* Song breakdown: sections, chords, lead line, bass and drums over time. Runs in the browser. Nothing is uploaded. */
(function (root) {
  'use strict';
  var K = root.KBKey;
  if (!K || !K.makeFFT) return;

  var SR = 11025, N1 = 8192, H1 = 1024, N2 = 1024, H2 = 256, MAXSEC = 600;
  var BASS_LO = 28, BASS_HI = 55, LEAD_LO = 55, LEAD_HI = 86;
  var TYPES = [
    { sfx: '', pcs: [0, 4, 7], minor: false, pen: 0 },
    { sfx: 'm', pcs: [0, 3, 7], minor: true, pen: 0 },
    { sfx: '7', pcs: [0, 4, 7, 10], minor: false, pen: 0.04 },
    { sfx: 'm7', pcs: [0, 3, 7, 10], minor: true, pen: 0.04 },
    { sfx: 'maj7', pcs: [0, 4, 7, 11], minor: false, pen: 0.05 },
    { sfx: 'dim', pcs: [0, 3, 6], minor: true, pen: 0.06 }
  ];
  var ROMAN = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];

  function mod(n, m) { return ((n % m) + m) % m; }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function pct(arr, p) {
    var a = Array.prototype.slice.call(arr).filter(function (v) { return v > 0; }).sort(function (x, y) { return x - y; });
    return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
  }

  /* Runs body(i) for i in 0..n-1 in short slices so the page stays responsive. */
  function chunked(n, body, prog, cancelled) {
    return new Promise(function (res) {
      var i = 0;
      (function run() {
        var t0 = Date.now();
        while (i < n && Date.now() - t0 < 25) body(i++);
        if (prog) prog(n ? i / n : 1);
        if (cancelled && cancelled()) { res(false); return; }
        if (i < n) setTimeout(run, 0); else res(true);
      })();
    });
  }

  function decimate(buffer) {
    var ch = buffer.numberOfChannels, len = buffer.length, r = buffer.sampleRate / SR, n = Math.floor(len / r), out = new Float32Array(n), c, i, j;
    var data = [];
    for (c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
    var w = Math.max(1, Math.round(r));
    for (i = 0; i < n; i++) {
      var p = Math.floor(i * r), s = 0, cnt = 0;
      for (j = 0; j < w && p + j < len; j++) { for (c = 0; c < ch; c++) s += data[c][p + j]; cnt += ch; }
      out[i] = cnt ? s / cnt : 0;
    }
    return out;
  }
  function toMono(buffer) {
    return new Promise(function (res) {
      var fallback = function () { res(decimate(buffer)); };
      if (typeof OfflineAudioContext === 'undefined') { fallback(); return; }
      try {
        var oc = new OfflineAudioContext(1, Math.max(1, Math.ceil(buffer.length * SR / buffer.sampleRate)), SR), s = oc.createBufferSource();
        s.buffer = buffer; s.connect(oc.destination); s.start();
        oc.startRendering().then(function (b) { res(b.getChannelData(0)); }, fallback);
      } catch (e) { fallback(); }
    });
  }

  /* Pitch track with smoothing over time. sc holds raw scores, nS notes per frame, plus one "no pitch" state. */
  function trackPitch(sc, nF, nS, vois, lambda, uCost, uEmis) {
    var S = nS + 1, dp = new Float32Array(S), nd = new Float32Array(S), bp = new Uint8Array(nF * S), e = new Float32Array(S), i, s, p;
    for (i = 0; i < nF; i++) {
      var mx = 0, sum = 0;
      for (s = 0; s < nS; s++) { var v = sc[i * nS + s]; if (v > mx) mx = v; sum += v; }
      var pk = mx > 0 ? (mx - sum / nS) / mx : 0, g = vois[i] * Math.min(1, pk * 1.25);
      for (s = 0; s < nS; s++) e[s] = mx > 0 ? sc[i * nS + s] / mx * g : 0;
      e[nS] = uEmis;
      if (i === 0) { for (s = 0; s < S; s++) dp[s] = e[s]; continue; }
      for (s = 0; s < S; s++) {
        var best = -1e9, bi = 0;
        for (p = 0; p < S; p++) {
          var cost = p === s ? 0 : (p === nS || s === nS) ? uCost : lambda * Math.min(Math.abs(p - s), 12) + 0.04, val = dp[p] - cost;
          if (val > best) { best = val; bi = p; }
        }
        nd[s] = best + e[s]; bp[i * S + s] = bi;
      }
      for (s = 0; s < S; s++) dp[s] = nd[s];
    }
    var st = 0;
    for (s = 1; s < S; s++) if (dp[s] > dp[st]) st = s;
    var path = new Int16Array(nF);
    for (i = nF - 1; i >= 0; i--) { path[i] = st; if (i > 0) st = bp[i * S + st]; }
    return path;
  }

  function pathToNotes(path, nF, nS, base, minFrames, timeOf) {
    var notes = [], i = 0;
    while (i < nF) {
      var s = path[i];
      if (s === nS) { i++; continue; }
      var j = i;
      while (j + 1 < nF && path[j + 1] === s) j++;
      notes.push({ i0: i, i1: j, midi: base + s });
      i = j + 1;
    }
    var merged = [];
    notes.forEach(function (n) {
      var l = merged[merged.length - 1];
      if (l && l.midi === n.midi && n.i0 - l.i1 <= 2) l.i1 = n.i1; else merged.push(n);
    });
    return merged.filter(function (n) { return n.i1 - n.i0 + 1 >= minFrames; }).map(function (n) {
      return { t0: timeOf(n.i0) - H1 / SR / 2, t1: timeOf(n.i1) + H1 / SR / 2, midi: n.midi };
    });
  }

  function peakPick(arr, fps, minGap, boost, minVal) {
    var n = arr.length, cs = new Float64Array(n + 1), i;
    for (i = 0; i < n; i++) cs[i + 1] = cs[i] + arr[i];
    var w = Math.round(fps * 0.5), top = pct(arr, 0.98), out = [], last = -1e9;
    for (i = 2; i < n - 2; i++) {
      var a = arr[i];
      if (a <= arr[i - 1] || a < arr[i + 1] || a <= arr[i - 2] || a < arr[i + 2]) continue;
      var lo = Math.max(0, i - w), hi = Math.min(n, i + w + 1), mean = (cs[hi] - cs[lo]) / (hi - lo);
      if (a > mean * (boost || 1.6) + 0.1 * top && a >= (minVal || 0) * top) {
        var t = i / fps;
        if (t - last >= minGap) { out.push(t); last = t; }
      }
    }
    return out;
  }

  function chordName(c, flats) { return K.noteName(c.root, flats) + TYPES[c.type].sfx; }
  function chordRoman(c, key) {
    var ty = TYPES[c.type], r = ROMAN[mod(c.root - key.tonic, 12)];
    if (ty.minor) r = r.toLowerCase();
    return r + (c.type === 5 ? '°' : c.type === 2 || c.type === 3 ? '7' : c.type === 4 ? 'maj7' : '');
  }
  function chordPcs(c) { return TYPES[c.type].pcs.map(function (p) { return mod(c.root + p, 12); }); }

  function analyse(buffer, onProg, cancelled) {
    var progW = function (a, b) { return function (p) { if (onProg) onProg(a + (b - a) * p); }; };
    var mono, nF, nF2, hann1, hann2, fft1 = K.makeFFT(N1), fft2 = K.makeFFT(N2), i;
    var bh1 = SR / N1, bh2 = SR / N2;
    var re = new Float64Array(N1), im = new Float64Array(N1), mag = new Float32Array(N1 / 2), mag2 = new Float32Array(N1 / 2);
    var kb = function (f) { return Math.round(f / bh1); };

    return toMono(buffer).then(function (x) {
      mono = x.length > MAXSEC * SR ? x.subarray(0, MAXSEC * SR) : x;
      if (mono.length < N1 * 2) { var pad = new Float32Array(N1 * 2); pad.set(mono); mono = pad; }
      nF = Math.floor((mono.length - N1) / H1) + 1;
      nF2 = Math.floor((mono.length - N2) / H2) + 1;
      hann1 = new Float32Array(N1); for (i = 0; i < N1; i++) hann1[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N1 - 1));
      hann2 = new Float32Array(N2); for (i = 0; i < N2; i++) hann2[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N2 - 1));
      return run();
    });

    function run() {
      var nBS = BASS_HI - BASS_LO + 1, nLS = LEAD_HI - LEAD_LO + 1;
      var chroma = new Float32Array(nF * 12), eB = new Float32Array(nF), eM = new Float32Array(nF), eH = new Float32Array(nF), rmsA = new Float32Array(nF);
      var bassSc = new Float32Array(nF * nBS), leadSc = new Float32Array(nF * nLS);
      var tab = function (lo, hi, nh) {
        var t = [], s, h;
        for (s = lo; s <= hi; s++) {
          var f = 440 * Math.pow(2, (s - 69) / 12), row = [];
          for (h = 1; h <= nh; h++) {
            var ff = f * h;
            if (ff > 5000) break;
            var a = Math.max(1, Math.floor(ff * Math.pow(2, -1 / 24) / bh1)), b = Math.min(N1 / 2 - 2, Math.ceil(ff * Math.pow(2, 1 / 24) / bh1));
            row.push([a, b]);
          }
          t.push(row);
        }
        return t;
      };
      var bTab = tab(BASS_LO, BASS_HI, 4), lTab = tab(LEAD_LO, LEAD_HI, 6);
      var bW = [1, 0.85, 0.7, 0.5], lW = [1, 0.8, 0.64, 0.51, 0.41, 0.33];
      var kB0 = kb(40), kB1 = kb(250), kM1 = kb(2000), kH1 = kb(5000), kC0 = kb(100);
      var tc = 0, ts = 0, tuning = 0, st;

      return chunked(nF, function (f) {
        var off = f * H1, s, k, h, sq = 0;
        for (k = 0; k < N1; k++) { var v = mono[off + k]; sq += v * v; re[k] = v * hann1[k]; im[k] = 0; }
        rmsA[f] = Math.sqrt(sq / N1);
        fft1(re, im);
        var top = 0;
        for (k = 1; k < N1 / 2; k++) { mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]); }
        var b = 0, m = 0, hi = 0;
        for (k = kB0; k <= kB1; k++) b += mag[k] * mag[k];
        for (k = kB1 + 1; k <= kM1; k++) m += mag[k] * mag[k];
        for (k = kM1 + 1; k <= kH1; k++) hi += mag[k] * mag[k];
        eB[f] = b; eM[f] = m; eH[f] = hi;
        for (k = kC0; k <= kM1; k++) if (mag[k] > top) top = mag[k];
        if (top > 0 && rmsA[f] > 0.003) {
          var c = new Float64Array(12), sum = 0, fc = 0, fs = 0;
          for (k = kC0; k <= kM1; k++) {
            var mk = mag[k];
            if (mk < top * 0.03 || mk <= mag[k - 1] || mk < mag[k + 1]) continue;
            var a = Math.log(mag[k - 1] + 1e-12), bb = Math.log(mk + 1e-12), d = Math.log(mag[k + 1] + 1e-12), den = a - 2 * bb + d, dl = den ? 0.5 * (a - d) / den : 0;
            dl = clamp(dl, -0.5, 0.5);
            var midi = 69 + 12 * Math.log((k + dl) * bh1 / 440) / Math.LN2, w = Math.sqrt(mk);
            fc += w * Math.cos(2 * Math.PI * midi); fs += w * Math.sin(2 * Math.PI * midi);
            var x = midi - tuning, r = Math.round(x), dev = x - r, cw = Math.cos(Math.PI * dev);
            c[mod(r, 12)] += w * cw * cw; sum += w * cw * cw;
          }
          if (sum > 0) {
            for (s = 0; s < 12; s++) chroma[f * 12 + s] = c[s] / sum;
            tc = tc * 0.995 + fc; ts = ts * 0.995 + fs; tuning = Math.atan2(ts, tc) / (2 * Math.PI);
          }
        }
        for (s = 0; s < nBS; s++) {
          var row = bTab[s], sc = 0;
          for (h = 0; h < row.length; h++) { var mx = 0; for (k = row[h][0]; k <= row[h][1]; k++) if (mag[k] > mx) mx = mag[k]; sc += bW[h] * mx; }
          bassSc[f * nBS + s] = sc;
        }
        /* the bass note's own overtones are not the melody: blank them out before looking for the lead */
        mag2.set(mag);
        var sb = 0, bmax = 0;
        for (s = 0; s < nBS; s++) if (bassSc[f * nBS + s] > bmax) { bmax = bassSc[f * nBS + s]; sb = s; }
        if (bmax > 0 && rmsA[f] > 0.003) {
          var fb = 440 * Math.pow(2, (BASS_LO + sb - 69) / 12);
          for (h = 2; h <= 10; h++) {
            var fh = fb * h;
            if (fh > 5000) break;
            for (k = Math.max(1, Math.floor(fh * 0.97 / bh1)); k <= Math.ceil(fh * 1.03 / bh1) && k < N1 / 2; k++) mag2[k] = 0;
          }
        }
        for (s = 0; s < nLS; s++) {
          var row2 = lTab[s], sc2 = 0, f1m = 0;
          for (h = 0; h < row2.length; h++) { var mx2 = 0; for (k = row2[h][0]; k <= row2[h][1]; k++) if (mag2[k] > mx2) mx2 = mag2[k]; if (h === 0) f1m = mx2; sc2 += lW[h] * mx2; }
          leadSc[f * nLS + s] = sc2 * Math.sqrt(f1m);
        }
      }, progW(0, 0.6), cancelled).then(function (ok) {
        if (!ok) return null;
        return stage2();
      });

      function stage2() {
        var timeOf = function (f) { return (f * H1 + N1 / 2) / SR; };
        var refB = pct(eB, 0.9) || 1, refM = pct(eM, 0.9) || 1, vB = new Float32Array(nF), vM = new Float32Array(nF);
        for (i = 0; i < nF; i++) {
          vB[i] = rmsA[i] > 0.003 ? clamp(Math.sqrt(eB[i] / refB), 0, 1) : 0;
          vM[i] = rmsA[i] > 0.003 ? clamp(Math.sqrt(eM[i] / refM), 0, 1) : 0;
        }
        var bPath = trackPitch(bassSc, nF, nBS, vB, 0.1, 0.22, 0.3);
        var lPath = trackPitch(leadSc, nF, nLS, vM, 0.14, 0.22, 0.32);
        var bass = pathToNotes(bPath, nF, nBS, BASS_LO, 2, timeOf);
        var lead = pathToNotes(lPath, nF, nLS, LEAD_LO, 3, timeOf);

        /* onsets and drums */
        var low = new Float32Array(nF2), mid = new Float32Array(nF2), high = new Float32Array(nF2), prev = null;
        var r1 = [Math.round(30 / bh2), Math.round(150 / bh2)], r2 = [Math.round(150 / bh2) + 1, Math.round(2000 / bh2)], r3 = [Math.round(3000 / bh2), Math.round(5400 / bh2)];
        var re2 = new Float64Array(N2), im2 = new Float64Array(N2), cur = new Float32Array(N2 / 2);
        return chunked(nF2, function (f) {
          var off = f * H2, k;
          for (k = 0; k < N2; k++) { re2[k] = mono[off + k] * hann2[k]; im2[k] = 0; }
          fft2(re2, im2);
          for (k = 1; k < N2 / 2; k++) cur[k] = Math.log(1 + 60 * Math.sqrt(re2[k] * re2[k] + im2[k] * im2[k]));
          if (prev) {
            var a = 0, b = 0, c = 0;
            for (k = r1[0]; k <= r1[1]; k++) a += Math.max(0, cur[k] - prev[k]);
            for (k = r2[0]; k <= r2[1]; k++) b += Math.max(0, cur[k] - prev[k]);
            for (k = r3[0]; k <= r3[1]; k++) c += Math.max(0, cur[k] - prev[k]);
            low[f] = a / (r1[1] - r1[0] + 1); mid[f] = b / (r2[1] - r2[0] + 1); high[f] = c / (r3[1] - r3[0] + 1);
          }
          if (!prev) prev = new Float32Array(N2 / 2);
          prev.set(cur);
        }, progW(0.6, 0.75), cancelled).then(function (ok) {
          if (!ok) return null;
          return stage3(timeOf, bass, lead, low, mid, high, vB);
        });
      }

      function stage3(timeOf, bass, lead, low, mid, high) {
        var fps = SR / H2, kick = peakPick(low, fps, 0.1, 1.7, 0.3), hat = peakPick(high, fps, 0.07, 1.7, 0.2);
        var pm = pct(mid, 0.98) || 1, ph = pct(high, 0.98) || 1, bro = new Float32Array(nF2);
        for (i = 0; i < nF2; i++) bro[i] = Math.min(mid[i] / pm, high[i] / ph);
        var snare = peakPick(bro, fps, 0.15, 1.8, 0.4);
        hat = hat.filter(function (t) { return !snare.some(function (q) { return Math.abs(q - t) < 0.04; }); });
        /* tempo from the combined onset strength */
        var pl = pct(low, 0.98) || 1, env = new Float32Array(nF2);
        for (i = 0; i < nF2; i++) env[i] = low[i] / pl + mid[i] / pm + high[i] / ph;
        var cs = new Float64Array(nF2 + 1), w = Math.round(fps);
        for (i = 0; i < nF2; i++) cs[i + 1] = cs[i] + env[i];
        var hp = new Float32Array(nF2);
        for (i = 0; i < nF2; i++) { var lo = Math.max(0, i - w), hi = Math.min(nF2, i + w + 1); hp[i] = Math.max(0, env[i] - (cs[hi] - cs[lo]) / (hi - lo)); }
        var ac = function (l) { var s = 0, n = nF2 - l, j; if (n < 10) return 0; for (j = 0; j < n; j++) s += hp[j] * hp[j + l]; return s / n; };
        var lagMin = Math.floor(fps * 60 / 185), lagMax = Math.ceil(fps * 60 / 65), acs = {}, l;
        for (l = Math.floor(lagMin / 2); l <= lagMax * 2; l++) acs[l] = ac(l);
        var bestL = lagMin, bestS = -1;
        for (l = lagMin; l <= lagMax; l++) {
          var bpm = 60 * fps / l, prior = Math.exp(-0.5 * Math.pow(Math.log(bpm / 118) / Math.LN2 / 0.8, 2));
          var sc = (acs[l] + 0.5 * acs[l * 2] + 0.25 * (acs[Math.round(l / 2)] || 0)) * prior;
          if (sc > bestS) { bestS = sc; bestL = l; }
        }
        var a0 = acs[bestL - 1] || 0, a1 = acs[bestL], a2 = acs[bestL + 1] || 0, dn = a0 - 2 * a1 + a2;
        var period = bestL + (dn ? clamp(0.5 * (a0 - a2) / dn, -0.5, 0.5) : 0), bpmF = 60 * fps / period;
        var phase = 0, pbest = -1, ph0;
        for (ph0 = 0; ph0 < period; ph0++) {
          var s = 0, j = 0, pos;
          for (pos = ph0; pos < nF2 - 1; pos += period) { s += hp[Math.round(pos)]; j++; }
          s /= Math.max(1, j);
          if (s > pbest) { pbest = s; phase = ph0; }
        }
        var beats = [], pos2;
        for (pos2 = phase; pos2 < nF2 - 1; pos2 += period) beats.push(pos2 / fps);
        /* which beat of the bar is the first beat: the one with the strongest low hits */
        var down = 0, dBest = -1, o;
        for (o = 0; o < 4; o++) {
          var s2 = 0;
          for (i = o; i < beats.length; i += 4) s2 += low[Math.min(nF2 - 1, Math.round(beats[i] * fps))];
          if (s2 > dBest) { dBest = s2; down = o; }
        }
        return stage4(timeOf, bass, lead, { kick: kick, snare: snare, hat: hat }, beats, down, bpmF);
      }

      function stage4(timeOf, bass, lead, drums, beats, down, bpm) {
        var nb = beats.length - 1;
        if (nb < 4) return { duration: mono.length / SR, bpm: Math.round(bpm), beats: beats, key: null, chords: [], bass: bass, lead: lead, drums: drums, sections: [], energy: null };
        var frameAt = function (t) { return clamp(Math.round((t * SR - N1 / 2) / H1), 0, nF - 1); };
        /* key of the whole song */
        var gc = new Float64Array(12), f, s;
        for (f = 0; f < nF; f++) for (s = 0; s < 12; s++) gc[s] += chroma[f * 12 + s];
        var klist = K.estimate(Array.prototype.slice.call(gc)), key = { tonic: klist[0].tonic, minor: klist[0].minor };
        /* chroma and bass per beat */
        var bc = [], bpc = [], b, c;
        for (b = 0; b < nb; b++) {
          var f0 = Math.ceil((beats[b] * SR - N1 / 2) / H1), f1 = Math.ceil((beats[b + 1] * SR - N1 / 2) / H1);
          f0 = clamp(f0, 0, nF - 1); f1 = clamp(Math.max(f1, f0 + 1), f0 + 1, nF);
          var v = new Float64Array(12), tot = 0;
          for (f = f0; f < f1; f++) for (s = 0; s < 12; s++) { v[s] += chroma[f * 12 + s]; tot += chroma[f * 12 + s]; }
          bc.push(tot > 0 ? v : null);
          var mid = (beats[b] + beats[b + 1]) / 2, bn = -1;
          for (c = 0; c < bass.length; c++) if (bass[c].t0 <= mid && bass[c].t1 >= mid) { bn = mod(bass[c].midi, 12); break; }
          bpc.push(bn);
        }
        /* chord per beat, smoothed */
        var NS = TYPES.length * 12, dp = new Float64Array(NS), nd = new Float64Array(NS), bp = new Int16Array(nb * NS), t, r;
        var tmpl = [];
        for (t = 0; t < TYPES.length; t++) for (r = 0; r < 12; r++) {
          var tv = new Float64Array(12); TYPES[t].pcs.forEach(function (p, ix) { tv[mod(r + p, 12)] = ix === 0 ? 1.2 : 1; });
          var nn = 0; for (s = 0; s < 12; s++) nn += tv[s] * tv[s];
          tmpl.push({ v: tv, n: Math.sqrt(nn), root: r, type: t });
        }
        var chroNorm = function (v) { var n = 0, s2; for (s2 = 0; s2 < 12; s2++) n += v[s2] * v[s2]; return Math.sqrt(n) || 1; };
        for (b = 0; b < nb; b++) {
          var em = new Float64Array(NS), vb = bc[b], cn = vb ? chroNorm(vb) : 1, mx = -1e9, mi = 0, isDown = ((b - down) % 4 + 4) % 4 === 0;
          for (t = 0; t < NS; t++) {
            var tp = tmpl[t], dot = 0;
            if (vb) for (s = 0; s < 12; s++) dot += vb[s] * tp.v[s];
            var e = vb ? dot / (cn * tp.n) : 0;
            if (bpc[b] >= 0) e += bpc[b] === tp.root ? 0.12 : TYPES[tp.type].pcs.indexOf(mod(bpc[b] - tp.root, 12)) >= 0 ? 0.05 : 0;
            em[t] = e - TYPES[tp.type].pen;
          }
          if (b === 0) { for (t = 0; t < NS; t++) dp[t] = em[t]; continue; }
          for (t = 0; t < NS; t++) if (dp[t] > mx) { mx = dp[t]; mi = t; }
          var pen = isDown ? 0.05 : 0.14;
          for (t = 0; t < NS; t++) {
            if (dp[t] >= mx - pen) { nd[t] = dp[t] + em[t]; bp[b * NS + t] = t; } else { nd[t] = mx - pen + em[t]; bp[b * NS + t] = mi; }
          }
          for (t = 0; t < NS; t++) dp[t] = nd[t];
        }
        var cur = 0;
        for (t = 1; t < NS; t++) if (dp[t] > dp[cur]) cur = t;
        var seq = new Int16Array(nb);
        for (b = nb - 1; b >= 0; b--) { seq[b] = cur; if (b > 0) cur = bp[b * NS + cur]; }
        var chords = [];
        for (b = 0; b < nb; b++) {
          if (!bc[b]) continue;
          var tp2 = tmpl[seq[b]], last = chords[chords.length - 1];
          if (last && last.root === tp2.root && last.type === tp2.type && last.beat1 === b) { last.t1 = beats[b + 1]; last.beat1 = b + 1; }
          else chords.push({ t0: beats[b], t1: beats[b + 1], root: tp2.root, type: tp2.type, beat0: b, beat1: b + 1 });
        }
        /* energy overview */
        var step = 2, ne = Math.floor(nF / step), eg = { dt: step * H1 / SR, low: new Float32Array(ne), mid: new Float32Array(ne), high: new Float32Array(ne) };
        var pL = pct(eB, 0.97) || 1, pM = pct(eM, 0.97) || 1, pH = pct(eH, 0.97) || 1;
        for (i = 0; i < ne; i++) {
          var a1 = 0, a2 = 0, a3 = 0, q;
          for (q = 0; q < step; q++) { a1 = Math.max(a1, eB[i * step + q]); a2 = Math.max(a2, eM[i * step + q]); a3 = Math.max(a3, eH[i * step + q]); }
          eg.low[i] = clamp(Math.pow(a1 / pL, 0.35), 0, 1); eg.mid[i] = clamp(Math.pow(a2 / pM, 0.35), 0, 1); eg.high[i] = clamp(Math.pow(a3 / pH, 0.35), 0, 1);
        }
        var sections = findSections(beats, down, chroma, eB, eM, eH, nF, pL, pM, pH);
        return {
          duration: mono.length / SR, bpm: Math.round(bpm), beats: beats, down: down, key: key, keyScore: klist[0].score, keyConf: K.confidence(klist),
          chords: chords, bass: bass, lead: lead, drums: drums, sections: sections, energy: eg
        };
      }

      function findSections(beats, down, chroma, eB, eM, eH, nF, pL, pM, pH) {
        var bars = [], j, f, s;
        for (j = down; j + 4 < beats.length; j += 4) bars.push([beats[j], beats[j + 4]]);
        var nBar = bars.length;
        if (nBar < 8) return [];
        var feat = [];
        bars.forEach(function (bar) {
          var f0 = clamp(Math.ceil((bar[0] * SR - N1 / 2) / H1), 0, nF - 1), f1 = clamp(Math.ceil((bar[1] * SR - N1 / 2) / H1), f0 + 1, nF);
          var v = new Float64Array(16), n = f1 - f0, cs = 0;
          for (f = f0; f < f1; f++) {
            for (s = 0; s < 12; s++) { v[s] += chroma[f * 12 + s] / n; }
            v[12] += Math.pow(eB[f] / pL, 0.35) / n; v[13] += Math.pow(eM[f] / pM, 0.35) / n; v[14] += Math.pow(eH[f] / pH, 0.35) / n;
          }
          for (s = 0; s < 12; s++) cs += v[s];
          for (s = 0; s < 12; s++) v[s] = cs ? v[s] / cs * 3 : 0;
          v[15] = (v[12] + v[13] + v[14]) / 3;
          feat.push(v);
        });
        var mean = new Float64Array(16);
        feat.forEach(function (v) { for (s = 0; s < 16; s++) mean[s] += v[s] / nBar; });
        var cen = feat.map(function (v) { var o = new Float64Array(16), n = 0; for (s = 0; s < 16; s++) { o[s] = v[s] - mean[s]; n += o[s] * o[s]; } n = Math.sqrt(n) || 1; for (s = 0; s < 16; s++) o[s] /= n; return o; });
        var cosv = function (a, b) { var d = 0; for (var q = 0; q < 16; q++) d += a[q] * b[q]; return d; };
        var L = 4, nov = new Float64Array(nBar), a, b2;
        for (j = L; j <= nBar - L; j++) {
          var v = 0;
          for (a = -L; a < L; a++) for (b2 = -L; b2 < L; b2++) v += (a < 0 ? -1 : 1) * (b2 < 0 ? -1 : 1) * cosv(cen[clamp(j + a, 0, nBar - 1)], cen[clamp(j + b2, 0, nBar - 1)]);
          nov[j] = Math.max(0, v);
        }
        var thr = pct(nov, 0.7) * 0.9 + 0.001, cuts = [0], lastCut = 0;
        for (j = 2; j < nBar - 2; j++) {
          if (nov[j] > thr && nov[j] >= nov[j - 1] && nov[j] >= nov[j + 1] && j - lastCut >= 4 && nBar - j >= 4) { cuts.push(j); lastCut = j; }
        }
        cuts.push(nBar);
        var secs = [];
        for (j = 0; j + 1 < cuts.length; j++) {
          var v2 = new Float64Array(16), c0 = cuts[j], c1 = cuts[j + 1], en = 0;
          for (a = c0; a < c1; a++) for (s = 0; s < 16; s++) v2[s] += cen[a][s] / (c1 - c0);
          for (a = c0; a < c1; a++) en += feat[a][15] / (c1 - c0);
          secs.push({ t0: j === 0 ? 0 : bars[c0][0], t1: j + 2 === cuts.length ? mono.length / SR : bars[c1][0], v: v2, energy: en, bars: c1 - c0 });
        }
        var labels = [], letters = [];
        secs.forEach(function (sec) {
          var best = -1, bs = 0.55, q;
          for (q = 0; q < labels.length; q++) { var sc = cosv(sec.v, labels[q]) / ((Math.sqrt(cosv(sec.v, sec.v)) * Math.sqrt(cosv(labels[q], labels[q]))) || 1); if (sc > bs) { bs = sc; best = q; } }
          if (best < 0) { labels.push(sec.v); best = labels.length - 1; }
          sec.label = String.fromCharCode(65 + best % 26);
          sec.group = best;
        });
        var count = {}, eSum = {};
        secs.forEach(function (sec) { count[sec.group] = (count[sec.group] || 0) + 1; eSum[sec.group] = (eSum[sec.group] || 0) + sec.energy; });
        var chorus = -1, cb = -1;
        Object.keys(count).forEach(function (g) { if (count[g] >= 2 && eSum[g] / count[g] > cb) { cb = eSum[g] / count[g]; chorus = +g; } });
        secs.forEach(function (sec) { sec.likelyChorus = sec.group === chorus; delete sec.v; });
        return secs;
      }
    }
  }

  root.KBBreak = { analyse: analyse, chordName: chordName, chordRoman: chordRoman, chordPcs: chordPcs, TYPES: TYPES };
})(typeof window !== 'undefined' ? window : globalThis);
