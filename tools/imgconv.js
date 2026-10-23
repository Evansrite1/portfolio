/* Image converter and compressor. Everything runs in the browser. Nothing is uploaded. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var root = $('ic-tool');
  if (!root) return;

  var items = [];          // {id, file, name, state, out, outName, outType, url, error, w, h, ow, oh}
  var nextId = 1;
  var runToken = 0;
  var running = false;
  var heicPromise = null;
  var canAvif = false, canWebp = true;
  var debounce = null;

  var MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

  function fmtSize(b) {
    if (b >= 1048576) return (b / 1048576).toFixed(b >= 10485760 ? 1 : 2) + ' MB';
    if (b >= 1024) return Math.round(b / 1024) + ' KB';
    return b + ' B';
  }
  function status(msg, bad) {
    var el = $('ic-status');
    el.textContent = msg || '';
    el.className = 'help' + (bad ? ' err' : '');
  }
  function yieldUi() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function toBlob(canvas, type, q) {
    return new Promise(function (res) { canvas.toBlob(res, type, q); });
  }

  /* ---------- feature tests ---------- */
  function testEncoders() {
    var c = document.createElement('canvas');
    c.width = c.height = 8;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#c33'; ctx.fillRect(0, 0, 8, 8);
    return Promise.all([toBlob(c, 'image/avif', 0.5), toBlob(c, 'image/webp', 0.5)]).then(function (r) {
      canAvif = !!(r[0] && r[0].type === 'image/avif');
      canWebp = !!(r[1] && r[1].type === 'image/webp');
      var sel = $('ic-fmt');
      if (canAvif) {
        var o = document.createElement('option'); o.value = 'image/avif'; o.textContent = 'AVIF (smallest, newer apps)';
        sel.appendChild(o);
      }
      if (!canWebp) {
        for (var i = sel.options.length - 1; i >= 0; i--) if (sel.options[i].value === 'image/webp') sel.remove(i);
      }
      c.width = c.height = 0;
    });
  }

  /* ---------- file type detection ---------- */
  function readHead(file) {
    return file.slice(0, 32).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function ascii(u8, a, b) { var s = ''; for (var i = a; i < b && i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; }
  function isHeicName(f) { return /\.(heic|heif|hif)$/i.test(f.name) || /heic|heif/i.test(f.type); }
  function isSvg(f) { return /\.svg$/i.test(f.name) || f.type === 'image/svg+xml'; }
  function headIsHeic(u8) {
    if (ascii(u8, 4, 8) !== 'ftyp') return false;
    var brand = ascii(u8, 8, 12);
    return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].indexOf(brand) >= 0;
  }
  function headIsAvif(u8) {
    if (ascii(u8, 4, 8) !== 'ftyp') return false;
    var b = ascii(u8, 8, 12);
    return b === 'avif' || b === 'avis';
  }

  function loadHeicLib() {
    if (window.HeicTo) return Promise.resolve();
    if (heicPromise) return heicPromise;
    heicPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '/tools/vendor/heic-to/heic-to.js';
      s.onload = function () { window.HeicTo ? resolve() : reject(new Error('HEIC library did not start')); };
      s.onerror = function () { heicPromise = null; reject(new Error('The HEIC converter could not be loaded. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return heicPromise;
  }

  /* ---------- decoding ---------- */
  function loadImg(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('decode')); };
      im.src = url;
    });
  }
  // Returns {src, w, h, svg, close()}
  function decode(file) {
    return readHead(file).then(function (head) {
      if (isHeicName(file) || headIsHeic(head) && !headIsAvif(head)) {
        status('Loading the HEIC converter (once)...');
        return loadHeicLib().then(function () {
          return window.HeicTo({ blob: file, type: 'bitmap' }).catch(function () {
            throw new Error('This HEIC file could not be read. It may be damaged or use an unsupported format.');
          });
        }).then(function (bmp) {
          return { src: bmp, w: bmp.width, h: bmp.height, svg: false, close: function () { bmp.close && bmp.close(); } };
        });
      }
      if (isSvg(file)) {
        var url = URL.createObjectURL(file);
        return loadImg(url).then(function (im) {
          var w = im.naturalWidth || 1024, h = im.naturalHeight || 1024;
          return { src: im, w: w, h: h, svg: true, close: function () { URL.revokeObjectURL(url); } };
        }, function (e) { URL.revokeObjectURL(url); throw e; });
      }
      return createImageBitmap(file).then(function (bmp) {
        return { src: bmp, w: bmp.width, h: bmp.height, svg: false, close: function () { bmp.close && bmp.close(); } };
      }, function () {
        // fall back to an img element (some browsers decode GIF or BMP this way)
        var url2 = URL.createObjectURL(file);
        return loadImg(url2).then(function (im) {
          return { src: im, w: im.naturalWidth, h: im.naturalHeight, svg: false, close: function () { URL.revokeObjectURL(url2); } };
        }, function () { URL.revokeObjectURL(url2); throw new Error('This file could not be read as an image.'); });
      });
    });
  }

  /* ---------- settings ---------- */
  function settings() {
    var maxW = parseInt($('ic-maxw').value, 10), maxH = parseInt($('ic-maxh').value, 10);
    return {
      fmt: $('ic-fmt').value,
      q: parseInt($('ic-q').value, 10) / 100,
      maxW: maxW > 0 ? maxW : 0,
      maxH: maxH > 0 ? maxH : 0,
      bg: $('ic-bg').value
    };
  }
  function targetType(file, head, s) {
    if (s.fmt !== 'same') return s.fmt;
    var t = file.type;
    if (t === 'image/png') return 'image/png';
    if (t === 'image/webp' && canWebp) return 'image/webp';
    if (t === 'image/avif' && canAvif) return 'image/avif';
    if (t === 'image/jpeg') return 'image/jpeg';
    if (/\.png$/i.test(file.name) || isSvg(file)) return 'image/png';
    return 'image/jpeg';
  }

  function baseName(n) { return n.replace(/\.[^.]+$/, '') || 'image'; }

  /* ---------- convert one ---------- */
  function convertOne(it, s) {
    var dec;
    return decode(it.file).then(function (d) {
      dec = d;
      var w = d.w, h = d.h;
      if (!w || !h) throw new Error('The image has no size.');
      it.ow = w; it.oh = h;
      var scale = 1;
      if (d.svg && !s.maxW && !s.maxH && Math.max(w, h) < 1000) scale = 1000 / Math.max(w, h);
      if (s.maxW) scale = Math.min(scale, s.maxW / w);
      if (s.maxH) scale = Math.min(scale, s.maxH / h);
      if (!d.svg && scale > 1) scale = 1;
      var tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
      var c = document.createElement('canvas');
      c.width = tw; c.height = th;
      var ctx = c.getContext('2d');
      var type = targetType(it.file, null, s);
      if (type === 'image/jpeg') { ctx.fillStyle = s.bg; ctx.fillRect(0, 0, tw, th); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(d.src, 0, 0, tw, th);
      return toBlob(c, type, s.q).then(function (blob) {
        c.width = c.height = 0;
        if (!blob) throw new Error('The browser could not create this file. Try a smaller size.');
        if (blob.type !== type) throw new Error('This browser cannot save ' + (MIME_EXT[type] || type).toUpperCase() + ' files. Choose another format.');
        it.out = blob; it.outType = type; it.w = tw; it.h = th;
      });
    }).then(function () { if (dec) dec.close(); }, function (e) { if (dec) dec.close(); throw e; });
  }

  function uniqueNames() {
    var used = {};
    items.forEach(function (it) {
      if (!it.out) { it.outName = ''; return; }
      var ext = MIME_EXT[it.outType], base = baseName(it.name), n = base + '.' + ext, i = 2;
      while (used[n.toLowerCase()]) n = base + '-' + (i++) + '.' + ext;
      used[n.toLowerCase()] = 1;
      it.outName = n;
    });
  }

  function runAll() {
    if (!items.length) { render(); return; }
    var token = ++runToken;
    var s = settings();
    running = true;
    items.forEach(function (it) {
      if (it.url) { URL.revokeObjectURL(it.url); it.url = null; }
      it.out = null; it.error = ''; it.state = 'wait';
    });
    render();
    var chain = Promise.resolve();
    var done = 0;
    items.forEach(function (it) {
      chain = chain.then(function () {
        if (token !== runToken) return;
        it.state = 'busy';
        updateRow(it);
        status('Converting ' + (done + 1) + ' of ' + items.length + '...');
        return yieldUi().then(function () { return convertOne(it, s); }).then(function () {
          it.state = 'done';
          it.url = URL.createObjectURL(it.out);
        }, function (e) {
          it.state = 'error';
          it.error = (e && e.message) || 'Could not convert this file.';
        }).then(function () {
          done++;
          if (token === runToken) { uniqueNames(); updateRow(it); updateTotals(); }
          return yieldUi();
        });
      });
    });
    chain.then(function () {
      if (token !== runToken) return;
      running = false;
      uniqueNames();
      render();
      var bad = items.filter(function (i) { return i.state === 'error'; }).length;
      status(bad ? bad + ' file' + (bad > 1 ? 's' : '') + ' could not be converted. See the messages in the list.' : 'Done. ' + items.length + ' file' + (items.length > 1 ? 's' : '') + ' ready.', !!bad);
    });
  }

  function schedule() {
    if (!items.length) return;
    clearTimeout(debounce);
    debounce = setTimeout(runAll, 250);
  }

  /* ---------- rendering ---------- */
  function rowHtml(it) {
    var meta;
    if (it.state === 'done') {
      var diff = Math.round((1 - it.out.size / it.file.size) * 100);
      var cls = diff >= 0 ? 'ic-good' : 'ic-bad';
      meta = fmtSize(it.file.size) + ' to ' + fmtSize(it.out.size) + ' <span class="' + cls + '">' + (diff >= 0 ? '-' + diff + '%' : '+' + (-diff) + '%') + '</span>' +
        ' <span class="ic-dim">' + it.w + ' x ' + it.h + '</span>';
    } else if (it.state === 'error') meta = '<span class="ic-bad"></span>';
    else if (it.state === 'busy') meta = 'Converting...';
    else meta = 'Waiting... ' + fmtSize(it.file.size);
    return meta;
  }
  function makeRow(it) {
    var li = document.createElement('li');
    li.className = 'ic-row';
    li.id = 'ic-row-' + it.id;
    li.innerHTML = '<img class="ic-th" alt="" width="48" height="48"><div class="ic-info"><b class="ic-name"></b><small class="ic-meta"></small></div>' +
      '<div class="ic-act"><button type="button" class="btn ic-dl">Download</button><button type="button" class="btn ic-rm" aria-label="Remove this file">Remove</button></div>';
    li.querySelector('.ic-dl').addEventListener('click', function () { downloadOne(it); });
    li.querySelector('.ic-rm').addEventListener('click', function () { removeItem(it); });
    return li;
  }
  function updateRow(it) {
    var li = $('ic-row-' + it.id);
    if (!li) return;
    var name = li.querySelector('.ic-name'), meta = li.querySelector('.ic-meta'), th = li.querySelector('.ic-th'), dl = li.querySelector('.ic-dl');
    name.textContent = it.state === 'done' ? it.outName : it.name;
    if (it.state === 'error') { meta.textContent = it.error; meta.className = 'ic-meta ic-bad'; }
    else { meta.innerHTML = rowHtml(it); meta.className = 'ic-meta'; }
    if (it.url) { if (th.getAttribute('src') !== it.url) th.src = it.url; th.hidden = false; } else { th.removeAttribute('src'); th.hidden = true; }
    dl.disabled = it.state !== 'done';
  }
  function render() {
    var list = $('ic-list');
    list.innerHTML = '';
    items.forEach(function (it) { list.appendChild(makeRow(it)); updateRow(it); });
    $('ic-results').hidden = !items.length;
    $('ic-empty').hidden = !!items.length;
    updateTotals();
  }
  function updateTotals() {
    var done = items.filter(function (i) { return i.state === 'done'; });
    var before = 0, after = 0;
    done.forEach(function (i) { before += i.file.size; after += i.out.size; });
    var all = !running && items.length && done.length === items.length;
    $('ic-total').innerHTML = done.length
      ? '<b>' + fmtSize(before) + '</b> to <b>' + fmtSize(after) + '</b> ' + (after <= before ? '<span class="ic-good">Saved ' + fmtSize(before - after) + ' (' + Math.round((1 - after / before) * 100) + '%)</span>' : '<span class="ic-bad">Larger by ' + fmtSize(after - before) + '</span>')
      : '';
    $('ic-zip').disabled = !done.length || running;
    $('ic-zip').textContent = 'Download all as ZIP' + (done.length > 1 ? ' (' + done.length + ')' : '');
    $('ic-clear').disabled = !items.length;
    void all;
  }

  /* ---------- downloads ---------- */
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function downloadOne(it) { if (it.out) saveBlob(it.out, it.outName); }
  function downloadZip() {
    if (!window.fflate) { status('The ZIP tool did not load. Download the files one by one instead.', true); return; }
    var done = items.filter(function (i) { return i.state === 'done'; });
    if (!done.length) return;
    status('Building the ZIP...');
    var files = {};
    Promise.all(done.map(function (it) {
      return it.out.arrayBuffer().then(function (b) { files[it.outName] = new Uint8Array(b); });
    })).then(function () {
      return yieldUi();
    }).then(function () {
      var zipped = window.fflate.zipSync(files, { level: 0 });
      saveBlob(new Blob([zipped], { type: 'application/zip' }), 'converted-images.zip');
      status('ZIP downloaded with ' + done.length + ' file' + (done.length > 1 ? 's' : '') + '.');
    }).catch(function () { status('Could not build the ZIP. Try fewer files.', true); });
  }

  /* ---------- adding files ---------- */
  function addFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    var skipped = 0;
    files.forEach(function (f) {
      var ok = /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif|hif)$/i.test(f.name);
      if (!ok) { skipped++; return; }
      items.push({ id: nextId++, file: f, name: f.name || 'pasted-image.png', state: 'wait', out: null, error: '' });
    });
    if (skipped) status(skipped + ' file' + (skipped > 1 ? 's were' : ' was') + ' skipped because it is not an image.', true);
    if (files.length > skipped) runAll();
  }
  function removeItem(it) {
    if (it.url) URL.revokeObjectURL(it.url);
    items = items.filter(function (i) { return i !== it; });
    uniqueNames();
    render();
    if (!items.length) status('');
  }
  function clearAll() {
    runToken++;
    running = false;
    items.forEach(function (it) { if (it.url) URL.revokeObjectURL(it.url); });
    items = [];
    render();
    status('');
  }

  /* ---------- wire up ---------- */
  function syncControls() {
    var f = $('ic-fmt').value;
    var lossless = f === 'image/png';
    $('ic-q').disabled = lossless;
    $('ic-qv').textContent = lossless ? 'not used for PNG' : $('ic-q').value + '%';
    $('ic-bg-note').hidden = !(f === 'image/jpeg' || f === 'same');
  }
  $('ic-pick').addEventListener('click', function () { $('ic-file').click(); });
  $('ic-file').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  var drop = $('ic-drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer && e.dataTransfer.files); });
  document.addEventListener('paste', function (e) {
    var fs = e.clipboardData && e.clipboardData.files;
    if (fs && fs.length) addFiles(fs);
  });
  ['ic-fmt', 'ic-q', 'ic-maxw', 'ic-maxh', 'ic-bg'].forEach(function (id) {
    $(id).addEventListener('input', function () { syncControls(); schedule(); });
    $(id).addEventListener('change', function () { syncControls(); schedule(); });
  });
  $('ic-zip').addEventListener('click', downloadZip);
  $('ic-clear').addEventListener('click', clearAll);
  window.addEventListener('pagehide', function () { items.forEach(function (it) { if (it.url) URL.revokeObjectURL(it.url); }); });

  syncControls();
  testEncoders().catch(function () {});
})();
