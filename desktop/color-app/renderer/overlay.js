'use strict';
(function () {
  const c = document.getElementById('c'), ctx = c.getContext('2d');
  const loupe = document.getElementById('loupe'), lc = document.getElementById('lc'), lx = lc.getContext('2d');
  const tag = document.getElementById('tag');
  lx.imageSmoothingEnabled = false;
  let img = null, W = 0, H = 0, px = 0, py = 0;   // px, py are picture pixels
  const CELLS = 11, CELL = Math.floor(150 / CELLS);

  window.cp.onShot((s) => {
    W = s.width; H = s.height;
    const bytes = new Uint8ClampedArray(s.bitmap.buffer ? s.bitmap.buffer.slice(s.bitmap.byteOffset, s.bitmap.byteOffset + s.bitmap.byteLength) : s.bitmap);
    if (s.bgra) for (let i = 0; i < bytes.length; i += 4) { const b = bytes[i]; bytes[i] = bytes[i + 2]; bytes[i + 2] = b; bytes[i + 3] = 255; }
    img = new ImageData(bytes, W, H);
    c.width = W; c.height = H;
    ctx.putImageData(img, 0, 0);
  });

  function rgbAt(x, y) {
    x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y));
    const i = (y * W + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  }

  function show() {
    if (!img) return;
    const rgb = rgbAt(px, py), hex = Color.toHex(rgb[0], rgb[1], rgb[2]);
    lx.clearRect(0, 0, 150, 150);
    const half = (CELLS - 1) / 2, off = Math.floor((150 - CELLS * CELL) / 2);
    for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
      const x = px + dx, y = py + dy;
      lx.fillStyle = (x < 0 || y < 0 || x >= W || y >= H) ? '#000' : 'rgb(' + rgbAt(x, y).join(',') + ')';
      lx.fillRect(off + (dx + half) * CELL, off + (dy + half) * CELL, CELL, CELL);
    }
    lx.strokeStyle = '#fff'; lx.lineWidth = 2; lx.strokeRect(off + half * CELL, off + half * CELL, CELL, CELL);
    lx.strokeStyle = '#000'; lx.lineWidth = 1; lx.strokeRect(off + half * CELL - 1, off + half * CELL - 1, CELL + 2, CELL + 2);
    const sx = px * innerWidth / W, sy = py * innerHeight / H;
    let lxp = sx + 24, lyp = sy + 24;
    if (lxp + 160 > innerWidth) lxp = sx - 174;
    if (lyp + 200 > innerHeight) lyp = sy - 200;
    loupe.style.display = 'block'; loupe.style.left = lxp + 'px'; loupe.style.top = lyp + 'px';
    tag.textContent = hex; tag.style.display = 'block'; tag.style.left = lxp + 'px'; tag.style.top = (lyp + 158) + 'px';
    tag.style.background = hex; tag.style.color = Color.luminance(rgb[0], rgb[1], rgb[2]) > 0.45 ? '#000' : '#fff';
    document.getElementById('msg').style.display = 'none';
  }

  window.addEventListener('mousemove', (e) => { px = Math.round(e.clientX * W / innerWidth); py = Math.round(e.clientY * H / innerHeight); show(); });
  window.addEventListener('mousedown', (e) => {
    if (!img || e.button !== 0) return;
    const rgb = rgbAt(px, py);
    window.cp.picked({ r: rgb[0], g: rgb[1], b: rgb[2] });
  });
  window.addEventListener('contextmenu', (e) => { e.preventDefault(); window.cp.cancel(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return window.cp.cancel();
    const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (m) { e.preventDefault(); px = Math.max(0, Math.min(W - 1, px + m[0] * (e.shiftKey ? 10 : 1))); py = Math.max(0, Math.min(H - 1, py + m[1] * (e.shiftKey ? 10 : 1))); show(); }
    if (e.key === 'Enter') { const rgb = rgbAt(px, py); window.cp.picked({ r: rgb[0], g: rgb[1], b: rgb[2] }); }
  });
})();
