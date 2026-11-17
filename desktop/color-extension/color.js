/* Color maths shared by the app window, the picking overlay and the tests. Plain functions, no dependencies. */
(function (root) {
  'use strict';
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const h2 = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0').toUpperCase();

  function toHex(r, g, b) { return '#' + h2(r) + h2(g) + h2(b); }

  function fromHex(s) {
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(s).trim());
    if (!m) return null;
    let x = m[1];
    if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
  }

  function toHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    const l = (mx + mn) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  }

  function toHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d !== 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [Math.round(h), Math.round(mx === 0 ? 0 : (d / mx) * 100), Math.round(mx * 100)];
  }

  function toCmyk(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return [0, 0, 0, 100];
    return [Math.round(((1 - r - k) / (1 - k)) * 100), Math.round(((1 - g - k) / (1 - k)) * 100), Math.round(((1 - b - k) / (1 - k)) * 100), Math.round(k * 100)];
  }

  function luminance(r, g, b) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  function contrast(a, b) {
    const la = luminance(a[0], a[1], a[2]), lb = luminance(b[0], b[1], b[2]);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /* every text format for one color */
  function formats(r, g, b) {
    const hsl = toHsl(r, g, b), hsv = toHsv(r, g, b), cmyk = toCmyk(r, g, b);
    return {
      hex: toHex(r, g, b),
      rgb: 'rgb(' + r + ', ' + g + ', ' + b + ')',
      hsl: 'hsl(' + hsl[0] + ', ' + hsl[1] + '%, ' + hsl[2] + '%)',
      hsv: 'hsv(' + hsv[0] + ', ' + hsv[1] + '%, ' + hsv[2] + '%)',
      cmyk: 'cmyk(' + cmyk[0] + '%, ' + cmyk[1] + '%, ' + cmyk[2] + '%, ' + cmyk[3] + '%)',
    };
  }

  const api = { toHex, fromHex, toHsl, toHsv, toCmyk, luminance, contrast, formats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Color = api;
})(typeof window !== 'undefined' ? window : globalThis);
