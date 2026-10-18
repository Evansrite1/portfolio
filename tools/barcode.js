/* barcode.js : the barcode generator. Runs entirely in the browser (JsBarcode draws the bars).
   Formats: Code 128, EAN-13, EAN-8, UPC-A, UPC-E, Code 39, ITF-14, ITF, MSI, Codabar, Pharmacode. */
(function () {
  'use strict';
  var root = document.getElementById('bc-tool');
  if (!root || typeof JsBarcode === 'undefined') return;
  var $ = function (id) { return document.getElementById(id); };

  var FORMATS = {
    CODE128: { label: 'Code 128', hint: 'Any letters, numbers and symbols. The best all-round choice for inventory, shipping and internal labels.', ex: 'ABC-12345' },
    EAN13: { label: 'EAN-13', hint: 'Enter 12 digits and the check digit is added for you, or enter all 13. Used on retail products worldwide.', ex: '590123412345' },
    EAN8: { label: 'EAN-8', hint: 'Enter 7 digits and the check digit is added, or enter all 8. For small packages.', ex: '9638507' },
    UPC: { label: 'UPC-A', hint: 'Enter 11 digits and the check digit is added, or enter all 12. Used on retail products in the US and Canada.', ex: '12345678901' },
    UPCE: { label: 'UPC-E', hint: 'A shortened UPC for small packages. Enter 6 to 8 digits.', ex: '123456' },
    CODE39: { label: 'Code 39', hint: 'Capital letters, numbers and - . $ / + % and space. Common in industry and government.', ex: 'CODE39' },
    ITF14: { label: 'ITF-14', hint: 'Enter 13 digits and the check digit is added, or enter all 14. Used on shipping cartons.', ex: '1540014128876' },
    ITF: { label: 'ITF (Interleaved 2 of 5)', hint: 'Digits only, in an even number.', ex: '12345670' },
    MSI: { label: 'MSI', hint: 'Digits only. Used for inventory and shelf labels.', ex: '1234567' },
    codabar: { label: 'Codabar', hint: 'Digits and - $ : / . +. Used by libraries and blood banks.', ex: '1234567' },
    pharmacode: { label: 'Pharmacode', hint: 'A whole number from 3 to 131070. Used in pharmaceutical packaging.', ex: '1234' }
  };

  var sel = $('bc-format');
  Object.keys(FORMATS).forEach(function (k) {
    var o = document.createElement('option'); o.value = k; o.textContent = FORMATS[k].label; sel.appendChild(o);
  });
  var def = root.getAttribute('data-default') || 'CODE128';
  sel.value = def;

  var svg = $('bc-svg'), box = $('bc-preview'), msg = $('bc-msg'), cur = { ok: false };
  function setHint() {
    var f = FORMATS[sel.value];
    $('bc-hint').textContent = f.hint;
    $('bc-value').placeholder = 'Example: ' + f.ex;
  }

  function render() {
    var val = $('bc-value').value;
    msg.textContent = '';
    cur.ok = false;
    if (!val.trim()) { box.classList.add('empty'); svg.innerHTML = ''; svg.removeAttribute('width'); svg.removeAttribute('height'); $('bc-empty').hidden = false; toggle(false); return; }
    $('bc-empty').hidden = true; box.classList.remove('empty');
    try {
      var bad = null;
      JsBarcode(svg, val.trim(), {
        format: sel.value,
        width: parseFloat($('bc-width').value) || 2,
        height: parseInt($('bc-height').value, 10) || 100,
        displayValue: $('bc-text').checked,
        fontSize: parseInt($('bc-font').value, 10) || 18,
        margin: parseInt($('bc-margin').value, 10) || 0,
        background: $('bc-transparent').checked ? 'rgba(255,255,255,0)' : $('bc-bg').value,
        lineColor: $('bc-fg').value,
        valid: function (ok) { if (!ok) bad = true; }
      });
      if (bad) throw new Error('invalid');
      cur.ok = true; toggle(true);
    } catch (e) {
      svg.innerHTML = ''; toggle(false); $('bc-empty').hidden = false; $('bc-empty').textContent = 'This value does not fit the chosen format';
      msg.textContent = 'This value is not valid for ' + FORMATS[sel.value].label + '. ' + FORMATS[sel.value].hint;
    }
  }
  function toggle(on) { root.querySelectorAll('[data-needs-code]').forEach(function (b) { b.disabled = !on; }); }

  function svgString() {
    var clone = svg.cloneNode(true);
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(clone);
  }
  function save(blob, name) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function flash(btn, text) {
    var old = btn.getAttribute('data-label') || btn.textContent; btn.setAttribute('data-label', old);
    btn.textContent = text; setTimeout(function () { btn.textContent = old; }, 1600);
  }
  function toPNG(cb) {
    if (!cur.ok) return;
    var w = parseFloat(svg.getAttribute('width')) || 300, h = parseFloat(svg.getAttribute('height')) || 150, k = 4;
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      var ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(cb, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString());
  }
  $('bc-png').addEventListener('click', function () { toPNG(function (b) { save(b, 'barcode.png'); }); });
  $('bc-svgdl').addEventListener('click', function () { if (cur.ok) save(new Blob([svgString()], { type: 'image/svg+xml' }), 'barcode.svg'); });
  $('bc-copy').addEventListener('click', function () {
    var btn = this;
    if (!navigator.clipboard || !window.ClipboardItem) { flash(btn, 'Not supported here'); return; }
    toPNG(function (b) { navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () { flash(btn, 'Copied'); }, function () { flash(btn, 'Blocked by browser'); }); });
  });
  $('bc-print').addEventListener('click', function () {
    if (!cur.ok) return;
    $('print-sheet').innerHTML = svgString(); window.print();
  });

  var t = null;
  function schedule() { clearTimeout(t); t = setTimeout(render, 90); }
  root.querySelectorAll('input, select').forEach(function (el) { el.addEventListener('input', schedule); el.addEventListener('change', schedule); });
  sel.addEventListener('change', function () { setHint(); $('bc-value').value = ''; render(); });
  $('bc-example').addEventListener('click', function () { $('bc-value').value = FORMATS[sel.value].ex; render(); });

  setHint();
  $('bc-value').value = FORMATS[sel.value].ex;
  render();
})();
