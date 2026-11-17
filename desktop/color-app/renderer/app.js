'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  let S = { history: [], autoCopy: true }, cur = null;

  function toast(t) { const e = $('toast'); e.textContent = t; e.classList.remove('hide'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.add('hide'), 1600); }
  function copy(t) { window.cp.copy(t).then(() => toast('Copied ' + t)); }

  function showColor(hex) {
    const rgb = Color.fromHex(hex);
    if (!rgb) return;
    cur = hex;
    const f = Color.formats(rgb[0], rgb[1], rgb[2]);
    $('sw').style.background = f.hex;
    $('hexbig').textContent = f.hex;
    $('name').textContent = f.rgb;
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
    S.history.forEach((c) => {
      const d = document.createElement('div'); d.className = 'h' + (c.hex === cur ? ' on' : ''); d.style.background = c.hex; d.title = c.hex; d.tabIndex = 0;
      d.onclick = () => showColor(c.hex);
      d.onkeydown = (e) => { if (e.key === 'Enter') showColor(c.hex); };
      const x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.textContent = 'x'; x.setAttribute('aria-label', 'Remove ' + c.hex);
      x.onclick = (e) => { e.stopPropagation(); window.cp.remove(c.hex); };
      d.appendChild(x); h.appendChild(d);
    });
    $('empty').classList.toggle('hide', S.history.length > 0);
    $('clear').classList.toggle('hide', S.history.length === 0);
    $('auto').checked = !!S.autoCopy;
  }

  $('pick').onclick = () => window.cp.pick();
  $('clear').onclick = () => { if (confirm('Remove every saved color?')) window.cp.clear(); };
  $('auto').onchange = () => window.cp.autoCopy($('auto').checked);
  window.cp.onState((s) => { S = s; draw(); });
  window.cp.onPicked((hex) => { showColor(hex); toast(S.autoCopy ? 'Copied ' + hex : 'Picked ' + hex); });
  window.cp.onNotice((t) => { const n = $('notice'); n.textContent = t; n.classList.remove('hide'); });
  window.cp.state().then((s) => { S = s; $('key').textContent = s.shortcut; if (s.history[0]) showColor(s.history[0].hex); else draw(); });
})();
