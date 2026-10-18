/* bgremove.js : background removal that runs in the browser. Nothing is uploaded.
   Two methods, chosen automatically:
   1. Color key: for logos and graphics on a plain background. Instant, exact, no download.
   2. AI cutout: for photos. Uses the open U2-Net (small) model through ONNX Runtime Web.
      The engine (about 15 MB) is only downloaded the first time a photo needs it.
   Public API: window.BGRemove                                                                   */
(function () {
  'use strict';
  var BASE = '/tools/vendor/';
  var ortLoad = null, session = null;

  /* ------------------------------------------------------------ loading */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureModel(onStatus) {
    if (session) return Promise.resolve(session);
    if (!ortLoad) {
      if (onStatus) onStatus('Loading the AI cutout engine (about 15 MB, only once)...');
      ortLoad = loadScript(BASE + 'ort/ort.min.js').then(function () {
        window.ort.env.wasm.wasmPaths = BASE + 'ort/';
        window.ort.env.wasm.numThreads = 1;
        window.ort.env.wasm.proxy = false;
        return window.ort.InferenceSession.create(BASE + 'models/u2netp.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      }).then(function (s) { session = s; return s; }, function (e) { ortLoad = null; throw e; });
    }
    return ortLoad;
  }

  /* ------------------------------------------------------------ canvas helpers */
  function newCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function fileToCanvas(file, maxDim) {
    maxDim = maxDim || 1600;
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
        var w = Math.max(1, Math.round((img.naturalWidth || img.width) * s)), h = Math.max(1, Math.round((img.naturalHeight || img.height) * s));
        var c = newCanvas(w, h); c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url); res(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('That file could not be read as an image.')); };
      img.src = url;
    });
  }

  function hasAlpha(canvas) {
    var d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, n = d.length / 4, t = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] < 250) t++;
    return t / n > 0.02;
  }

  /* ------------------------------------------------------------ analysis: is the background one flat color? */
  function analyze(canvas) {
    var w = canvas.width, h = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    var ring = Math.max(1, Math.min(3, Math.round(Math.min(w, h) / 200)));
    var bins = {}, total = 0;
    function add(x, y) {
      var i = (y * w + x) * 4;
      if (d[i + 3] < 128) return;
      var k = (d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4);
      var b = bins[k] || (bins[k] = { n: 0, r: 0, g: 0, b: 0 });
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; total++;
    }
    for (var x = 0; x < w; x++) for (var r = 0; r < ring; r++) { add(x, r); add(x, h - 1 - r); }
    for (var y = ring; y < h - ring; y++) for (var q = 0; q < ring; q++) { add(q, y); add(w - 1 - q, y); }
    var best = null;
    Object.keys(bins).forEach(function (k) { if (!best || bins[k].n > best.n) best = bins[k]; });
    if (!best || !total) return { flat: false, bg: [255, 255, 255], frac: 0 };
    var bg = [best.r / best.n, best.g / best.n, best.b / best.n];
    // share of border pixels close to that color
    var near = 0, tol = 34;
    function chk(x, y) {
      var i = (y * w + x) * 4;
      if (d[i + 3] < 128) return;
      var dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
      if (Math.sqrt(dr * dr + dg * dg + db * db) <= tol) near++;
    }
    for (var x2 = 0; x2 < w; x2++) { chk(x2, 0); chk(x2, h - 1); }
    for (var y2 = 1; y2 < h - 1; y2++) { chk(0, y2); chk(w - 1, y2); }
    var frac = near / (2 * w + 2 * h - 4);
    return { flat: frac >= 0.9, bg: bg, frac: frac };
  }

  /* ------------------------------------------------------------ method 1: color key with flood fill from the edges */
  function colorKey(canvas, bg, tol) {
    var w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d');
    var img = ctx.getImageData(0, 0, w, h), d = img.data, N = w * h;
    var isBg = new Uint8Array(N), queue = new Int32Array(N), qh = 0, qt = 0;
    function dist(i) {
      var o = i * 4; if (d[o + 3] < 8) return 0;
      var dr = d[o] - bg[0], dg = d[o + 1] - bg[1], db = d[o + 2] - bg[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }
    function seed(i) { if (!isBg[i] && dist(i) <= tol) { isBg[i] = 1; queue[qt++] = i; } }
    for (var x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (var y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (qh < qt) {
      var i = queue[qh++], px = i % w, py = (i / w) | 0;
      if (px > 0) seed(i - 1); if (px < w - 1) seed(i + 1); if (py > 0) seed(i - w); if (py < h - 1) seed(i + w);
    }
    var out = ctx.createImageData(w, h), o = out.data, t2 = tol * 1.9;
    for (var p = 0; p < N; p++) {
      var q = p * 4;
      if (isBg[p]) { o[q] = o[q + 1] = o[q + 2] = 0; o[q + 3] = 0; continue; }
      // soft edge: pixels touching the background fade in, so anti-aliased edges stay smooth
      var touch = false, px2 = p % w, py2 = (p / w) | 0;
      if ((px2 > 0 && isBg[p - 1]) || (px2 < w - 1 && isBg[p + 1]) || (py2 > 0 && isBg[p - w]) || (py2 < h - 1 && isBg[p + w])) touch = true;
      var a = 1, r = d[q], g = d[q + 1], b = d[q + 2];
      if (touch) {
        var dd = dist(p); a = Math.max(0, Math.min(1, (dd - tol * 0.7) / (t2 - tol * 0.7)));
        if (a > 0.02) { // remove the background tint from edge pixels
          r = Math.max(0, Math.min(255, (r - (1 - a) * bg[0]) / a)); g = Math.max(0, Math.min(255, (g - (1 - a) * bg[1]) / a)); b = Math.max(0, Math.min(255, (b - (1 - a) * bg[2]) / a));
        }
      }
      o[q] = r; o[q + 1] = g; o[q + 2] = b; o[q + 3] = Math.round(a * d[q + 3]);
    }
    var res = newCanvas(w, h); res.getContext('2d').putImageData(out, 0, 0);
    return res;
  }

  /* ------------------------------------------------------------ method 2: AI cutout */
  var SIZE = 320, MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
  function aiMask(canvas, onStatus) {
    return ensureModel(onStatus).then(function (s) {
      if (onStatus) onStatus('Finding the subject...');
      var small = newCanvas(SIZE, SIZE), sctx = small.getContext('2d');
      sctx.drawImage(canvas, 0, 0, SIZE, SIZE);
      var px = sctx.getImageData(0, 0, SIZE, SIZE).data, plane = SIZE * SIZE, f = new Float32Array(3 * plane), mx = 1e-6, i;
      for (i = 0; i < px.length; i += 4) mx = Math.max(mx, px[i], px[i + 1], px[i + 2]);
      for (i = 0; i < plane; i++) {
        f[i] = (px[i * 4] / mx - MEAN[0]) / STD[0];
        f[plane + i] = (px[i * 4 + 1] / mx - MEAN[1]) / STD[1];
        f[2 * plane + i] = (px[i * 4 + 2] / mx - MEAN[2]) / STD[2];
      }
      var feeds = {}; feeds[s.inputNames[0]] = new window.ort.Tensor('float32', f, [1, 3, SIZE, SIZE]);
      return new Promise(function (r) { setTimeout(r, 30); }).then(function () { return s.run(feeds); }).then(function (res) {
        var out = res[s.outputNames[0]].data, lo = Infinity, hi = -Infinity, k;
        for (k = 0; k < out.length; k++) { if (out[k] < lo) lo = out[k]; if (out[k] > hi) hi = out[k]; }
        var span = Math.max(1e-6, hi - lo), g = newCanvas(SIZE, SIZE), gctx = g.getContext('2d'), id = gctx.createImageData(SIZE, SIZE);
        for (k = 0; k < out.length; k++) { var v = Math.round((out[k] - lo) / span * 255); id.data[k * 4] = id.data[k * 4 + 1] = id.data[k * 4 + 2] = v; id.data[k * 4 + 3] = 255; }
        gctx.putImageData(id, 0, 0);
        // scale the mask up to the image size (smooth), then read it back as 0..1
        var big = newCanvas(canvas.width, canvas.height), bctx = big.getContext('2d'); bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = 'high';
        bctx.drawImage(g, 0, 0, canvas.width, canvas.height);
        var bd = bctx.getImageData(0, 0, canvas.width, canvas.height).data, m = new Float32Array(canvas.width * canvas.height);
        for (k = 0; k < m.length; k++) m[k] = bd[k * 4] / 255;
        return m;
      });
    });
  }

  function boxBlur(a, w, h, r) {
    if (r < 1) return a;
    var tmp = new Float32Array(a.length), out = new Float32Array(a.length), x, y, k, sum, cnt;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { sum = 0; cnt = 0; for (k = -r; k <= r; k++) { var xx = x + k; if (xx >= 0 && xx < w) { sum += a[y * w + xx]; cnt++; } } tmp[y * w + x] = sum / cnt; }
    for (x = 0; x < w; x++) for (y = 0; y < h; y++) { sum = 0; cnt = 0; for (k = -r; k <= r; k++) { var yy = y + k; if (yy >= 0 && yy < h) { sum += tmp[yy * w + x]; cnt++; } } out[y * w + x] = sum / cnt; }
    return out;
  }

  /* apply a 0..1 mask to the picture. threshold: where the edge sits (0.2 to 0.8). soften: edge blur in pixels. */
  function maskToCanvas(canvas, mask, opts) {
    opts = opts || {};
    var th = opts.threshold == null ? 0.5 : opts.threshold, soft = opts.soften == null ? 1 : opts.soften;
    var w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d'), img = ctx.getImageData(0, 0, w, h), d = img.data;
    var a = new Float32Array(mask.length), lo = th - 0.16, span = 0.32;
    for (var i = 0; i < a.length; i++) a[i] = Math.max(0, Math.min(1, (mask[i] - lo) / span));
    if (soft > 0) a = boxBlur(a, w, h, Math.round(soft));
    for (var j = 0; j < a.length; j++) d[j * 4 + 3] = Math.round(a[j] * d[j * 4 + 3]);
    var res = newCanvas(w, h); res.getContext('2d').putImageData(img, 0, 0);
    return res;
  }

  /* ------------------------------------------------------------ trimming */
  function trim(canvas, padFrac) {
    var w = canvas.width, h = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return canvas;
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1, pad = Math.round(Math.max(bw, bh) * (padFrac || 0));
    var c = newCanvas(bw + 2 * pad, bh + 2 * pad); c.getContext('2d').drawImage(canvas, x0, y0, bw, bh, pad, pad, bw, bh);
    return c;
  }
  function fitMax(canvas, maxPx) {
    var s = Math.min(1, maxPx / Math.max(canvas.width, canvas.height)); if (s >= 1) return canvas;
    var c = newCanvas(Math.max(1, Math.round(canvas.width * s)), Math.max(1, Math.round(canvas.height * s)));
    var ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(canvas, 0, 0, c.width, c.height); return c;
  }

  /* ------------------------------------------------------------ one call: pick the best method */
  function removeAuto(canvas, opts) {
    opts = opts || {};
    var onStatus = opts.onStatus || function () {};
    var mode = opts.mode || 'auto';
    if (mode === 'auto' && hasAlpha(canvas)) return Promise.resolve({ canvas: canvas, method: 'already transparent' });
    var info = analyze(canvas);
    var useColor = mode === 'color' || (mode === 'auto' && info.flat);
    if (useColor) {
      onStatus('Removing the background color...');
      return Promise.resolve({ canvas: colorKey(canvas, info.bg, opts.tolerance || 38), method: 'color', info: info });
    }
    return aiMask(canvas, onStatus).then(function (m) {
      return { canvas: maskToCanvas(canvas, m, { threshold: opts.threshold, soften: opts.soften }), method: 'ai', mask: m, info: info };
    });
  }

  window.BGRemove = {
    fileToCanvas: fileToCanvas, hasAlpha: hasAlpha, analyze: analyze, colorKey: colorKey, aiMask: aiMask,
    maskToCanvas: maskToCanvas, trim: trim, fitMax: fitMax, removeAuto: removeAuto
  };
})();
