/* Color picker and tools. Runs in the browser. Nothing is uploaded. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var root = $('cp-tool');
  if (!root) return;

  /* ---------- named colors (CSS) ---------- */
  var NAMES_SRC = 'aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,bisque:ffe4c4,black:000000,blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00,chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,darkblue:00008b,darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkkhaki:bdb76b,darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,darksalmon:e9967a,darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,darkturquoise:00ced1,darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dodgerblue:1e90ff,firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,ghostwhite:f8f8ff,gold:ffd700,goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,honeydew:f0fff0,hotpink:ff69b4,indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,lawngreen:7cfc00,lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90,lightpink:ffb6c1,lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa,lightslategray:778899,lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32,linen:faf0e6,maroon:800000,mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371,mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc,mediumvioletred:c71585,midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead,navy:000080,oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6,palegoldenrod:eee8aa,palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9,peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f,royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d,silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,slategray:708090,snow:fffafa,springgreen:00ff7f,steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,yellowgreen:9acd32';

  /* ---------- color math ---------- */
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function hex2(n) { var s = Math.round(clamp(n, 0, 255)).toString(16); return s.length < 2 ? '0' + s : s; }
  function rgbToHex(c) { return '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]); }
  function hexToRgb(h) {
    h = String(h).replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    var n = parseInt(h, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function rgbToHsv(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx ? d / mx : 0, mx];
  }
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function rgbToHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2, h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function rgbToCmyk(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, k = 1 - Math.max(r, g, b);
    if (k >= 1) return [0, 0, 0, 1];
    return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
  }
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function luminance(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b), hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  function toLab(c) {
    var r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
    var x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    var f = function (t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  }
  var NAMES = NAMES_SRC.split(',').map(function (p) {
    var a = p.split(':'), rgb = hexToRgb(a[1]);
    return { name: a[0], hex: '#' + a[1], rgb: rgb, lab: toLab(rgb) };
  });
  function nearestName(c) {
    var l = toLab(c), best = null, bd = 1e9;
    for (var i = 0; i < NAMES.length; i++) {
      var n = NAMES[i].lab, d = (l[0] - n[0]) * (l[0] - n[0]) + (l[1] - n[1]) * (l[1] - n[1]) + (l[2] - n[2]) * (l[2] - n[2]);
      if (d < bd) { bd = d; best = NAMES[i]; }
    }
    return { name: best.name, hex: best.hex, exact: bd < 0.5 };
  }

  /* ---------- state ---------- */
  var hsv = [3, 0.68, 1];   // hue keeps its value for greys
  var rgb = [255, 91, 82];
  var saved = [];
  var SAVE_KEY = 'lt-color-picker-saved';

  function setFromRgb(c, keepHue) {
    rgb = [Math.round(clamp(c[0], 0, 255)), Math.round(clamp(c[1], 0, 255)), Math.round(clamp(c[2], 0, 255))];
    var h = rgbToHsv(rgb);
    if (keepHue && (h[1] === 0 || h[2] === 0)) h[0] = hsv[0];
    hsv = h;
    update(true);
  }
  function setFromHsv(h, s, v) {
    hsv = [h, s, v];
    rgb = hsvToRgb(h, s, v).map(Math.round);
    update(false);
  }
  function parseColor(str) {
    str = String(str || '').trim();
    if (!str) return null;
    var h = hexToRgb(str);
    if (h) return h;
    var cv = parseColor.cv || (parseColor.cv = document.createElement('canvas').getContext('2d'));
    cv.fillStyle = '#010203';
    cv.fillStyle = str;
    var a = cv.fillStyle;
    if (a === '#010203' && str.replace(/\s/g, '').toLowerCase() !== '#010203' && str.toLowerCase() !== 'rgb(1,2,3)' && str.toLowerCase() !== 'rgb(1, 2, 3)') {
      cv.fillStyle = '#040506'; cv.fillStyle = str;
      if (cv.fillStyle === '#040506') return null;
      a = cv.fillStyle;
    }
    if (a.charAt(0) === '#') return hexToRgb(a);
    var m = a.match(/[\d.]+/g);
    return m && m.length >= 3 ? [Math.round(+m[0]), Math.round(+m[1]), Math.round(+m[2])] : null;
  }

  /* ---------- clipboard and messages ---------- */
  var msgTimer = 0;
  function say(msg, bad) {
    var el = $('cp-status');
    el.textContent = msg;
    el.className = 'help' + (bad ? ' err' : '');
    clearTimeout(msgTimer);
    if (!bad) msgTimer = setTimeout(function () { el.textContent = ''; }, 3000);
  }
  function copyText(text, what) {
    var done = function () { say('Copied ' + (what || text) + '.'); };
    var fail = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) done(); else say('Could not copy automatically. Select the value and copy it by hand.', true);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail); else fail();
  }

  /* ---------- picker UI ---------- */
  var sv = $('cp-sv'), svx = sv.getContext('2d'), svDrawnHue = -1;
  function drawSv() {
    var w = sv.width, h = sv.height;
    var hue = Math.round(hsv[0]);
    if (hue === svDrawnHue) return;
    svDrawnHue = hue;
    svx.fillStyle = 'hsl(' + hue + ',100%,50%)';
    svx.fillRect(0, 0, w, h);
    var g1 = svx.createLinearGradient(0, 0, w, 0);
    g1.addColorStop(0, 'rgba(255,255,255,1)'); g1.addColorStop(1, 'rgba(255,255,255,0)');
    svx.fillStyle = g1; svx.fillRect(0, 0, w, h);
    var g2 = svx.createLinearGradient(0, 0, 0, h);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
    svx.fillStyle = g2; svx.fillRect(0, 0, w, h);
  }
  function moveFromPointer(e) {
    var r = sv.getBoundingClientRect();
    var s = clamp((e.clientX - r.left) / r.width, 0, 1), v = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
    setFromHsv(hsv[0], s, v);
  }
  sv.addEventListener('pointerdown', function (e) {
    sv.setPointerCapture(e.pointerId); sv.focus();
    sv.dataset.drag = '1'; moveFromPointer(e); e.preventDefault();
  });
  sv.addEventListener('pointermove', function (e) { if (sv.dataset.drag) moveFromPointer(e); });
  ['pointerup', 'pointercancel'].forEach(function (ev) { sv.addEventListener(ev, function () { delete sv.dataset.drag; }); });
  sv.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 0.1 : 0.01, s = hsv[1], v = hsv[2];
    if (e.key === 'ArrowLeft') s -= step; else if (e.key === 'ArrowRight') s += step;
    else if (e.key === 'ArrowUp') v += step; else if (e.key === 'ArrowDown') v -= step; else return;
    e.preventDefault();
    setFromHsv(hsv[0], clamp(s, 0, 1), clamp(v, 0, 1));
  });
  $('cp-hue').addEventListener('input', function () { setFromHsv(parseFloat(this.value), hsv[1], hsv[2]); });
  $('cp-native').addEventListener('input', function () { setFromRgb(hexToRgb(this.value), true); });
  $('cp-hex').addEventListener('change', function () {
    var c = parseColor(this.value);
    if (!c) { say('That is not a color. Try a hex code like #ff5b52, rgb(255, 91, 82) or a name like tomato.', true); this.value = rgbToHex(rgb); return; }
    setFromRgb(c, true);
  });
  $('cp-hex').addEventListener('keydown', function (e) { if (e.key === 'Enter') this.blur(); });

  if ('EyeDropper' in window) {
    $('cp-eye').hidden = false;
    $('cp-eye').addEventListener('click', function () {
      new window.EyeDropper().open().then(function (r) { var c = hexToRgb(r.sRGBHex); if (c) setFromRgb(c, false); }, function () { /* user cancelled */ });
    });
  }

  /* ---------- values ---------- */
  var VALS = ['hex', 'rgb', 'hsl', 'hsv', 'cmyk'];
  function valueStrings() {
    var hs = rgbToHsl(rgb), hv = rgbToHsv(rgb), ck = rgbToCmyk(rgb);
    var p = function (x) { return Math.round(x * 100); };
    return {
      hex: rgbToHex(rgb),
      rgb: 'rgb(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ')',
      hsl: 'hsl(' + Math.round(hs[0]) + ', ' + p(hs[1]) + '%, ' + p(hs[2]) + '%)',
      hsv: 'hsv(' + Math.round(hv[0]) + ', ' + p(hv[1]) + '%, ' + p(hv[2]) + '%)',
      cmyk: 'cmyk(' + p(ck[0]) + '%, ' + p(ck[1]) + '%, ' + p(ck[2]) + '%, ' + p(ck[3]) + '%)'
    };
  }
  VALS.forEach(function (k) {
    $('cp-copy-' + k).addEventListener('click', function () { copyText($('cp-v-' + k).textContent, k.toUpperCase()); });
  });

  function update(fromExternal) {
    var hex = rgbToHex(rgb), v = valueStrings();
    VALS.forEach(function (k) { $('cp-v-' + k).textContent = v[k]; });
    $('cp-swatch').style.background = hex;
    $('cp-hex').value = hex;
    $('cp-native').value = hex;
    $('cp-hue').value = Math.round(hsv[0]);
    drawSv();
    var cur = $('cp-cursor');
    cur.style.left = (hsv[1] * 100) + '%';
    cur.style.top = ((1 - hsv[2]) * 100) + '%';
    sv.setAttribute('aria-valuenow', Math.round(hsv[1] * 100));
    sv.setAttribute('aria-valuetext', 'Saturation ' + Math.round(hsv[1] * 100) + ' percent, brightness ' + Math.round(hsv[2] * 100) + ' percent');
    var nm = nearestName(rgb);
    $('cp-name').textContent = nm.exact ? nm.name : 'Closest name: ' + nm.name + ' (' + nm.hex + ')';
    $('cp-ink').style.color = contrast(rgb, [255, 255, 255]) >= contrast(rgb, [0, 0, 0]) ? '#ffffff' : '#000000';
    renderSwatches();
    $('cp-save').disabled = saved.indexOf(hex) >= 0;
    void fromExternal;
  }

  /* ---------- shades, tints, harmonies ---------- */
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function swatchBtn(c, label) {
    var hex = rgbToHex(c), b = document.createElement('button');
    b.type = 'button'; b.className = 'cp-sw';
    b.style.background = hex;
    b.style.color = contrast(c, [255, 255, 255]) >= contrast(c, [0, 0, 0]) ? '#fff' : '#000';
    b.setAttribute('aria-label', (label ? label + ' ' : '') + hex + ', use this color');
    b.title = 'Use ' + hex;
    var s = document.createElement('span'); s.textContent = hex; b.appendChild(s);
    b.addEventListener('click', function () { setFromRgb(c, true); });
    return b;
  }
  function fill(id, arr, label) {
    var el = $(id); el.innerHTML = '';
    arr.forEach(function (c) { el.appendChild(swatchBtn(c, label)); });
  }
  function renderSwatches() {
    var steps = [0.9, 0.75, 0.6, 0.45, 0.3, 0.15], white = [255, 255, 255], black = [0, 0, 0];
    fill('cp-tints', steps.map(function (t) { return mix(rgb, white, t); }), 'Tint');
    fill('cp-shades', steps.map(function (t) { return mix(rgb, black, t); }), 'Shade');
    var hs = rgbToHsl(rgb);
    var rot = function (d) { return hslToRgb(hs[0] + d, hs[1], hs[2]); };
    fill('cp-h-comp', [rgb, rot(180)], 'Complementary');
    fill('cp-h-ana', [rot(-30), rgb, rot(30)], 'Analogous');
    fill('cp-h-tri', [rgb, rot(120), rot(240)], 'Triadic');
    fill('cp-h-split', [rgb, rot(150), rot(210)], 'Split complementary');
  }

  /* ---------- saved colors ---------- */
  function loadSaved() {
    try { var a = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); if (Array.isArray(a)) saved = a.filter(function (h) { return /^#[0-9a-f]{6}$/.test(h); }).slice(0, 60); } catch (e) { saved = []; }
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch (e) { say('Your saved colors could not be stored in this browser, so they will be lost when you leave the page.', true); } }
  function renderSaved() {
    var el = $('cp-saved'); el.innerHTML = '';
    saved.forEach(function (hex, i) {
      var wrap = document.createElement('div'); wrap.className = 'cp-sv-item';
      var b = swatchBtn(hexToRgb(hex), 'Saved');
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'cp-x'; x.textContent = 'x'; x.setAttribute('aria-label', 'Remove ' + hex + ' from saved colors');
      x.addEventListener('click', function () { saved.splice(i, 1); persist(); renderSaved(); $('cp-save').disabled = saved.indexOf(rgbToHex(rgb)) >= 0; });
      wrap.appendChild(b); wrap.appendChild(x); el.appendChild(wrap);
    });
    $('cp-saved-empty').hidden = saved.length > 0;
    $('cp-copy-css').disabled = $('cp-copy-list').disabled = $('cp-clear-saved').disabled = !saved.length;
  }
  function saveColor(hex) {
    if (saved.indexOf(hex) >= 0) return;
    saved.unshift(hex); saved = saved.slice(0, 60);
    persist(); renderSaved();
  }
  $('cp-save').addEventListener('click', function () { saveColor(rgbToHex(rgb)); $('cp-save').disabled = true; say('Saved ' + rgbToHex(rgb) + '.'); });
  $('cp-clear-saved').addEventListener('click', function () { saved = []; persist(); renderSaved(); $('cp-save').disabled = false; });
  $('cp-copy-list').addEventListener('click', function () { copyText(saved.join('\n'), 'the list'); });
  $('cp-copy-css').addEventListener('click', function () {
    var used = {}, lines = saved.slice().reverse().map(function (hex) {
      var base = nearestName(hexToRgb(hex)).name, n = base, i = 2;
      while (used[n]) n = base + '-' + (i++);
      used[n] = 1;
      return '  --' + n + ': ' + hex + ';';
    });
    copyText(':root {\n' + lines.join('\n') + '\n}', 'CSS variables');
  });

  /* ---------- image: pick a pixel, extract a palette ---------- */
  var img = { bmp: null, ctx: null };
  var cv = $('cp-img');
  function loadImage(file) {
    if (!file) return;
    createImageBitmap(file).then(function (b) {
      if (img.bmp && img.bmp.close) img.bmp.close();
      img.bmp = b;
      var sc = Math.min(1, 1000 / Math.max(b.width, b.height));
      cv.width = Math.max(1, Math.round(b.width * sc)); cv.height = Math.max(1, Math.round(b.height * sc));
      img.ctx = cv.getContext('2d', { willReadFrequently: true });
      img.ctx.clearRect(0, 0, cv.width, cv.height);
      img.ctx.drawImage(b, 0, 0, cv.width, cv.height);
      $('cp-img-box').hidden = false;
      $('cp-img-help').textContent = 'Click or tap the picture to pick the color of a pixel.';
      extractPalette();
    }, function () { say('That file could not be read as an image. Try a PNG, JPG or WebP.', true); });
  }
  $('cp-img-pick').addEventListener('click', function () { $('cp-img-file').click(); });
  $('cp-img-file').addEventListener('change', function (e) { loadImage(e.target.files[0]); e.target.value = ''; });
  var drop = $('cp-drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { loadImage(e.dataTransfer && e.dataTransfer.files[0]); });
  document.addEventListener('paste', function (e) {
    var fs = e.clipboardData && e.clipboardData.files;
    if (fs && fs.length && /^image\//.test(fs[0].type)) loadImage(fs[0]);
  });
  cv.addEventListener('click', function (e) {
    if (!img.ctx) return;
    var r = cv.getBoundingClientRect();
    var x = clamp(Math.floor((e.clientX - r.left) / r.width * cv.width), 0, cv.width - 1), y = clamp(Math.floor((e.clientY - r.top) / r.height * cv.height), 0, cv.height - 1);
    var d = img.ctx.getImageData(x, y, 1, 1).data;
    if (d[3] < 8) { say('That pixel is transparent. Click a visible part of the picture.', true); return; }
    setFromRgb([d[0], d[1], d[2]], false);
  });

  function medianCut(px, n) {
    var boxes = [px];
    while (boxes.length < n) {
      var bi = -1, br = -1, ax = 0;
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i]; if (b.length < 2) continue;
        var mn = [255, 255, 255], mx = [0, 0, 0];
        for (var j = 0; j < b.length; j++) for (var k = 0; k < 3; k++) { if (b[j][k] < mn[k]) mn[k] = b[j][k]; if (b[j][k] > mx[k]) mx[k] = b[j][k]; }
        for (var k2 = 0; k2 < 3; k2++) { var rg = mx[k2] - mn[k2]; if (rg > br) { br = rg; bi = i; ax = k2; } }
      }
      if (bi < 0 || br <= 0) break;
      var box = boxes[bi].slice().sort(function (p, q) { return p[ax] - q[ax]; });
      var mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.map(function (b) {
      var s = [0, 0, 0];
      b.forEach(function (p) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; });
      return { rgb: [Math.round(s[0] / b.length), Math.round(s[1] / b.length), Math.round(s[2] / b.length)], n: b.length };
    }).sort(function (a, b) { return b.n - a.n; }).reduce(function (acc, p) {
      // merge boxes whose colors are nearly the same, so the palette has no duplicates
      for (var i = 0; i < acc.length; i++) {
        var a = acc[i].rgb, dr = a[0] - p.rgb[0], dg = a[1] - p.rgb[1], db = a[2] - p.rgb[2];
        if (dr * dr + dg * dg + db * db < 30 * 30) { acc[i].n += p.n; return acc; }
      }
      acc.push(p); return acc;
    }, []);
  }
  var palette = [];
  function extractPalette() {
    if (!img.ctx) return;
    var n = parseInt($('cp-pal-n').value, 10);
    var w = cv.width, h = cv.height, sc = Math.min(1, 160 / Math.max(w, h));
    var sw = Math.max(1, Math.round(w * sc)), sh = Math.max(1, Math.round(h * sc));
    var t = document.createElement('canvas'); t.width = sw; t.height = sh;
    var tx = t.getContext('2d', { willReadFrequently: true });
    tx.drawImage(cv, 0, 0, sw, sh);
    var d = tx.getImageData(0, 0, sw, sh).data, px = [];
    for (var i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) px.push([d[i], d[i + 1], d[i + 2]]);
    t.width = t.height = 0;
    if (!px.length) { say('The picture has no visible pixels.', true); return; }
    palette = medianCut(px, n);
    var el = $('cp-palette'); el.innerHTML = '';
    palette.forEach(function (p) { el.appendChild(swatchBtn(p.rgb, 'Palette color')); });
    $('cp-pal-save').hidden = false;
  }
  $('cp-pal-n').addEventListener('change', extractPalette);
  $('cp-pal-save').addEventListener('click', function () {
    palette.forEach(function (p) { var h = rgbToHex(p.rgb); if (saved.indexOf(h) < 0) saved.push(h); });
    saved = saved.slice(0, 60); persist(); renderSaved(); say('Palette saved to your colors.');
  });

  /* ---------- contrast checker ---------- */
  var cc = { fg: [0, 0, 0], bg: [255, 255, 255] };
  function pill(id, pass) {
    var el = $(id); el.textContent = pass ? 'Pass' : 'Fail';
    el.className = 'cp-pill ' + (pass ? 'pass' : 'fail');
  }
  function renderContrast() {
    var r = contrast(cc.fg, cc.bg), shown = Math.floor(r * 100) / 100;
    $('cp-ratio').textContent = (shown % 1 === 0 ? shown.toFixed(0) : shown.toFixed(2)) + ':1';
    pill('cp-aa', r >= 4.5); pill('cp-aaa', r >= 7); pill('cp-aal', r >= 3); pill('cp-aaal', r >= 4.5); pill('cp-ui', r >= 3);
    var s = $('cp-sample');
    s.style.color = rgbToHex(cc.fg); s.style.background = rgbToHex(cc.bg);
    $('cp-fg-hex').value = rgbToHex(cc.fg); $('cp-bg-hex').value = rgbToHex(cc.bg);
    $('cp-fg-c').value = rgbToHex(cc.fg); $('cp-bg-c').value = rgbToHex(cc.bg);
  }
  function bindCc(key, hexId, colId) {
    $(hexId).addEventListener('change', function () {
      var c = parseColor(this.value);
      if (!c) { say('That is not a color. Try a hex code like #1a1a1a.', true); this.value = rgbToHex(cc[key]); return; }
      cc[key] = c; renderContrast();
    });
    $(colId).addEventListener('input', function () { cc[key] = hexToRgb(this.value); renderContrast(); });
  }
  bindCc('fg', 'cp-fg-hex', 'cp-fg-c'); bindCc('bg', 'cp-bg-hex', 'cp-bg-c');
  $('cp-use-fg').addEventListener('click', function () { cc.fg = rgb.slice(); renderContrast(); });
  $('cp-use-bg').addEventListener('click', function () { cc.bg = rgb.slice(); renderContrast(); });
  $('cp-swap').addEventListener('click', function () { var t = cc.fg; cc.fg = cc.bg; cc.bg = t; renderContrast(); });

  /* ---------- start ---------- */
  loadSaved(); renderSaved(); renderContrast();
  update(false);
  sv.setAttribute('tabindex', '0');
})();
