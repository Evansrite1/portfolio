'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  let history = [], cur = null;

  function toast(t) { const e = $('toast'); e.textContent = t; e.classList.remove('hide'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.add('hide'), 1500); }
  function copy(t) { navigator.clipboard.writeText(t).then(() => toast('Copied ' + t), () => toast('Could not copy')); }
  function save() { try { chrome.storage.local.set({ history }); } catch (e) { /* ignore */ } }

  function showColor(hex) {
    const rgb = Color.fromHex(hex); if (!rgb) return;
    cur = hex;
    const f = Color.formats(rgb[0], rgb[1], rgb[2]);
    $('sw').style.background = f.hex; $('hexbig').textContent = f.hex;
    const rows = $('rows'); rows.innerHTML = '';
    [['HEX', f.hex], ['RGB', f.rgb], ['HSL', f.hsl], ['HSV', f.hsv], ['CMYK', f.cmyk]].forEach(([k, v]) => {
      const r = document.createElement('div'); r.className = 'row';
      const b = document.createElement('b'); b.textContent = k;
      const c = document.createElement('code'); c.textContent = v;
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Copy'; btn.onclick = () => copy(v);
      r.append(b, c, btn); rows.appendChild(r);
    });
    const ct = $('ct'); ct.innerHTML = '';
    [['White text', [255, 255, 255]], ['Black text', [0, 0, 0]]].forEach(([n, fg]) => {
      const ratio = Color.contrast(rgb, fg), d = document.createElement('div');
      d.style.background = f.hex; d.style.color = 'rgb(' + fg.join(',') + ')';
      d.textContent = n + ' ' + ratio.toFixed(1) + ':1 ' + (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'large text only' : 'fails');
      ct.appendChild(d);
    });
    draw();
  }

  function draw() {
    const h = $('hist'); h.innerHTML = '';
    history.forEach((hex) => {
      const d = document.createElement('div'); d.className = 'h' + (hex === cur ? ' on' : ''); d.style.background = hex; d.title = hex;
      d.onclick = () => showColor(hex); h.appendChild(d);
    });
    $('empty').classList.toggle('hide', history.length > 0);
    $('clear').classList.toggle('hide', history.length === 0);
  }

  $('pick').onclick = async () => {
    if (!('EyeDropper' in window)) {
      const n = $('notice'); n.textContent = 'This browser does not have the eyedropper. Use Chrome or Edge version 95 or newer.'; n.classList.remove('hide'); return;
    }
    $('pick').disabled = true;
    try {
      const res = await new EyeDropper().open();
      const hex = res.sRGBHex.toUpperCase();
      history = [hex].concat(history.filter((x) => x !== hex)).slice(0, 60);
      save(); showColor(hex); copy(hex);
    } catch (e) { /* the person pressed Esc */ }
    $('pick').disabled = false;
  };
  $('clear').onclick = () => { history = []; save(); draw(); };
  try { chrome.storage.local.get('history', (r) => { history = (r && r.history) || []; if (history[0]) showColor(history[0]); else draw(); }); } catch (e) { draw(); }
})();
