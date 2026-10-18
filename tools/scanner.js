/* scanner.js : read QR codes (and, where the browser supports it, barcodes) from an image or the camera.
   Everything stays in the browser. Nothing is uploaded.                                              */
(function () {
  'use strict';
  var root = document.getElementById('scan-tool');
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var hasDetector = 'BarcodeDetector' in window;
  var detector = null;
  if (hasDetector) { try { detector = new BarcodeDetector(); } catch (e) { detector = null; } }

  var out = $('scan-result'), msg = $('scan-msg');

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function show(text, kind) {
    var isUrl = /^https?:\/\/\S+$/i.test(text);
    out.hidden = false;
    $('scan-text').textContent = text;
    $('scan-kind').textContent = kind || 'Code';
    var open = $('scan-open');
    open.hidden = !isUrl;
    if (isUrl) { open.href = text; }
    $('scan-warn').hidden = !isUrl;
    msg.textContent = '';
  }

  /* decode a canvas with the native detector first, then jsQR */
  function decodeCanvas(canvas) {
    var ctx = canvas.getContext('2d');
    var run = function () {
      var d = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var res = typeof jsQR !== 'undefined' ? jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' }) : null;
      return res ? { text: res.data, kind: 'QR code' } : null;
    };
    if (detector) {
      return detector.detect(canvas).then(function (list) {
        if (list && list.length) return { text: list[0].rawValue, kind: String(list[0].format || 'code').replace(/_/g, ' ').toLowerCase() };
        return run();
      }, function () { return run(); });
    }
    return Promise.resolve(run());
  }

  /* ---------- image upload ---------- */
  function fromFile(file) {
    if (!file || !/^image\//.test(file.type)) { msg.textContent = 'Choose an image file (PNG, JPG, WebP or a screenshot).'; return; }
    msg.textContent = 'Reading the image...';
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      $('scan-preview').src = c.toDataURL('image/jpeg', 0.8); $('scan-preview-box').hidden = false;
      decodeCanvas(c).then(function (r) {
        if (r) show(r.text, r.kind);
        else { out.hidden = true; msg.textContent = 'No code found. Try a sharper image, crop closer to the code, or make sure the whole code is in the picture.'; }
      });
    };
    img.onerror = function () { msg.textContent = 'That file could not be read as an image.'; };
    img.src = url;
  }
  $('scan-file').addEventListener('change', function () { fromFile(this.files[0]); this.value = ''; });
  var drop = $('scan-drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files[0]) fromFile(e.dataTransfer.files[0]); });
  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.files) || [];
    if (items.length) fromFile(items[0]);
  });

  /* ---------- camera ---------- */
  var stream = null, raf = null, video = $('scan-video'), work = document.createElement('canvas'), busy = false;
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    video.srcObject = null; $('scan-cam-box').hidden = true;
    $('scan-start').hidden = false; $('scan-stop').hidden = true;
  }
  function loop() {
    if (!stream) return;
    if (video.readyState >= 2 && !busy) {
      busy = true;
      var w = video.videoWidth, h = video.videoHeight, s = Math.min(1, 900 / Math.max(w, h));
      work.width = Math.round(w * s); work.height = Math.round(h * s);
      work.getContext('2d').drawImage(video, 0, 0, work.width, work.height);
      decodeCanvas(work).then(function (r) { busy = false; if (r) { show(r.text, r.kind); stop(); } else raf = requestAnimationFrame(function () { setTimeout(loop, 120); }); });
      return;
    }
    raf = requestAnimationFrame(loop);
  }
  $('scan-start').addEventListener('click', function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'Camera access is not available in this browser. Upload an image instead.'; return; }
    msg.textContent = 'Starting the camera...';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (s) {
      stream = s; video.srcObject = s; video.setAttribute('playsinline', 'true'); video.play();
      $('scan-cam-box').hidden = false; $('scan-start').hidden = true; $('scan-stop').hidden = false; out.hidden = true; msg.textContent = 'Point the camera at a code.';
      raf = requestAnimationFrame(loop);
    }, function () { msg.textContent = 'Camera permission was blocked. Allow the camera in your browser settings, or upload an image instead.'; });
  });
  $('scan-stop').addEventListener('click', function () { stop(); msg.textContent = ''; });
  window.addEventListener('pagehide', stop);

  /* ---------- result actions ---------- */
  $('scan-copy').addEventListener('click', function () {
    var btn = this, t = $('scan-text').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); }, function () { btn.textContent = 'Copy failed'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); });
  });
})();
