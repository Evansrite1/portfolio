/* Slide design engine v2. Draws 1080 x 1350 Instagram slides from a small spec.
   Four cover layouts (Mon, Wed, Thu, Sat), three inner layouts, a CTA layout.
   Same palette everywhere, different design per post type. */
(function () {
  const C = {or:'#ff4a12', ye:'#ffd21f', bk:'#0e0e0e', bl:'#2c56ff', cr:'#f3eee4', lm:'#c8f31d', wh:'#ffffff', pk:'#ff8fb8'};
  const INK = '#111';
  const S = 'stroke="#111" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"';
  let uid = 0;
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const svg = (inner, w, h, vb, st) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (vb || '0 0 400 400') + '" width="' + w + '" height="' + (h || w) + '" style="display:block;overflow:visible;' + (st || '') + '">' + inner + '</svg>';
  const star = (cx, cy, r, fill) => { let p = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p += (cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1) + ' '; } return '<polygon points="' + p + '" fill="' + fill + '" ' + S + '/>'; };

  /* ---------- illustrations (400 x 400) ---------- */
  const ART = {
    tag: () => '<path d="M40 190 L190 40 H350 V200 L200 350 Z" fill="#ffd21f" ' + S + '/><circle cx="300" cy="92" r="20" fill="#fff" ' + S + '/><text x="150" y="250" font-family="Anton" font-size="150" fill="#111" transform="rotate(-45 200 200)" text-anchor="middle">$</text>',
    coins: () => [0, 1, 2].map(i => '<ellipse cx="200" cy="' + (300 - i * 55) + '" rx="120" ry="40" fill="#ffd21f" ' + S + '/><rect x="80" y="' + (300 - i * 55) + '" width="240" height="30" fill="#ffd21f" stroke="none"/><path d="M80 ' + (300 - i * 55) + ' V' + (330 - i * 55) + ' M320 ' + (300 - i * 55) + ' V' + (330 - i * 55) + '" ' + S + '/><ellipse cx="200" cy="' + (330 - i * 55) + '" rx="120" ry="40" fill="#ffd21f" ' + S + ' opacity="0"/>').join('') + '<ellipse cx="200" cy="135" rx="120" ry="40" fill="#ffd21f" ' + S + '/><text x="200" y="152" font-family="Anton" font-size="52" text-anchor="middle" fill="#111">$</text>',
    calendar: () => '<rect x="50" y="70" width="300" height="280" rx="26" fill="#fff" ' + S + '/><path d="M50 150 V96 Q50 70 76 70 H324 Q350 70 350 96 V150 Z" fill="#ff4a12" ' + S + '/><path d="M120 40 V95 M280 40 V95" ' + S + ' stroke-width="14"/>' + [0, 1, 2, 3].map(r => [0, 1, 2].map(c => '<circle cx="' + (120 + c * 80) + '" cy="' + (200 + r * 38) + '" r="9" fill="#111"/>').join('')).join('') + '<circle cx="200" cy="238" r="26" fill="none" stroke="#ff4a12" stroke-width="9"/>',
    camera: () => '<rect x="40" y="120" width="320" height="220" rx="36" fill="#f3eee4" ' + S + '/><path d="M130 120 L150 80 H250 L270 120" fill="#f3eee4" ' + S + '/><circle cx="200" cy="230" r="82" fill="#2c56ff" ' + S + '/><circle cx="200" cy="230" r="46" fill="#111"/><circle cx="182" cy="212" r="12" fill="#fff"/><rect x="300" y="146" width="36" height="22" rx="6" fill="#ffd21f" ' + S + ' stroke-width="5"/>',
    stars: () => [0, 1, 2, 3, 4].map(i => star(52 + i * 74, 200 + (i % 2 ? 6 : -6), 40, '#ffd21f')).join('') + '<text x="200" y="320" font-family="Anton" font-size="76" text-anchor="middle" fill="#111">5.0</text>',
    pin: () => '<path d="M200 365 C120 265 80 215 80 155 A120 120 0 0 1 320 155 C320 215 280 265 200 365 Z" fill="#ff4a12" ' + S + '/><circle cx="200" cy="155" r="48" fill="#fff" ' + S + '/><ellipse cx="200" cy="378" rx="70" ry="12" fill="#111" opacity=".25"/>',
    phone: () => '<rect x="110" y="20" width="180" height="360" rx="38" fill="#1b1b1b" ' + S + '/><rect x="124" y="48" width="152" height="304" rx="14" fill="#f3eee4"/><rect x="134" y="62" width="132" height="84" rx="8" fill="#ff4a12"/><rect x="134" y="160" width="100" height="10" rx="5" fill="#111"/><rect x="134" y="180" width="132" height="8" rx="4" fill="#999"/><rect x="134" y="198" width="110" height="8" rx="4" fill="#999"/><rect x="134" y="226" width="60" height="50" rx="8" fill="#2c56ff"/><rect x="206" y="226" width="60" height="50" rx="8" fill="#ffd21f"/><rect x="134" y="300" width="132" height="34" rx="17" fill="#111"/><rect x="152" y="313" width="96" height="8" rx="4" fill="#ffd21f"/>',
    laptop: () => '<rect x="50" y="60" width="300" height="205" rx="16" fill="#1b1b1b" ' + S + '/><rect x="64" y="74" width="272" height="177" rx="6" fill="#f3eee4"/><rect x="64" y="74" width="272" height="20" fill="#111"/><rect x="76" y="108" width="120" height="14" rx="7" fill="#111"/><rect x="76" y="130" width="140" height="8" rx="4" fill="#999"/><rect x="76" y="146" width="100" height="8" rx="4" fill="#999"/><rect x="76" y="168" width="64" height="24" rx="12" fill="#ff4a12"/><rect x="226" y="106" width="96" height="86" rx="8" fill="#2c56ff"/><rect x="76" y="204" width="76" height="36" rx="6" fill="#ffd21f"/><rect x="164" y="204" width="76" height="36" rx="6" fill="#c8f31d"/><rect x="252" y="204" width="70" height="36" rx="6" fill="#ff8fb8"/><path d="M20 268 H380 L350 312 H50 Z" fill="#d9d9d9" ' + S + '/>',
    search: () => '<circle cx="170" cy="170" r="105" fill="#fff" ' + S + '/><path d="M246 246 L345 345" ' + S + ' stroke-width="30"/><path d="M130 175 H210 M170 135 V215" stroke="#ff4a12" stroke-width="16" stroke-linecap="round"/>' + star(320, 70, 28, '#ffd21f'),
    chat: () => '<path d="M40 70 Q40 50 60 50 H250 Q270 50 270 70 V150 Q270 170 250 170 H120 L70 215 L80 170 H60 Q40 170 40 150 Z" fill="#ffd21f" ' + S + '/><path d="M130 210 Q130 190 150 190 H340 Q360 190 360 210 V290 Q360 310 340 310 H320 L330 355 L280 310 H150 Q130 310 130 290 Z" fill="#fff" ' + S + '/><path d="M80 90 H230 M80 125 H180 M170 232 H320 M170 266 H260" ' + S + ' stroke-width="9"/>',
    clock: () => '<circle cx="200" cy="215" r="140" fill="#fff" ' + S + '/><path d="M200 215 V130 M200 215 L260 250" ' + S + ' stroke-width="14"/><circle cx="200" cy="215" r="12" fill="#111"/><path d="M100 70 Q130 30 170 50 M300 70 Q270 30 230 50" ' + S + '/><circle cx="110" cy="70" r="30" fill="#ff4a12" ' + S + '/><circle cx="290" cy="70" r="30" fill="#ff4a12" ' + S + '/>',
    gift: () => '<rect x="70" y="170" width="260" height="190" rx="14" fill="#ff4a12" ' + S + '/><rect x="50" y="125" width="300" height="60" rx="14" fill="#ffd21f" ' + S + '/><rect x="176" y="125" width="48" height="235" fill="#2c56ff" ' + S + '/><path d="M200 125 C150 60 90 70 120 105 C140 125 190 125 200 125 C210 125 260 125 280 105 C310 70 250 60 200 125 Z" fill="#c8f31d" ' + S + '/>',
    heart: () => '<path d="M200 350 C60 250 40 160 90 110 C130 70 185 90 200 135 C215 90 270 70 310 110 C360 160 340 250 200 350 Z" fill="#ff4a12" ' + S + '/><path d="M110 140 Q125 115 150 120" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round"/>',
    check: () => '<circle cx="200" cy="200" r="150" fill="#c8f31d" ' + S + '/><path d="M120 205 L180 265 L285 140" fill="none" ' + S + ' stroke-width="30"/>',
    stall: () => '<path d="M40 140 L70 50 H330 L360 140 Z" fill="#fff" ' + S + '/>' + [0, 1, 2, 3, 4].map(i => '<path d="M' + (70 + i * 52) + ' 50 L' + (40 + i * 64) + ' 140 H' + (104 + i * 64) + ' L' + (122 + i * 52) + ' 50 Z" fill="' + (i % 2 ? '#ffd21f' : '#ff4a12') + '" stroke="none"/>').join('') + '<path d="M40 140 L70 50 H330 L360 140 Z" fill="none" ' + S + '/>' + [0, 1, 2, 3, 4].map(i => '<circle cx="' + (52 + i * 74) + '" cy="150" r="22" fill="' + (i % 2 ? '#ffd21f' : '#ff4a12') + '" ' + S + ' stroke-width="6"/>').join('') + '<path d="M70 150 V340 M330 150 V340" ' + S + ' stroke-width="12"/><rect x="50" y="250" width="300" height="100" rx="8" fill="#8a5a2b" ' + S + '/><circle cx="110" cy="232" r="26" fill="#ff8fb8" ' + S + ' stroke-width="6"/><circle cx="165" cy="238" r="22" fill="#c8f31d" ' + S + ' stroke-width="6"/><circle cx="220" cy="230" r="28" fill="#ffd21f" ' + S + ' stroke-width="6"/><rect x="262" y="210" width="62" height="40" rx="6" fill="#fff" ' + S + ' stroke-width="6"/><text x="293" y="240" font-family="Anton" font-size="26" text-anchor="middle" fill="#111">$5</text>',
    person: () => '<circle cx="200" cy="90" r="50" fill="#f3eee4" ' + S + '/><path d="M200 140 V270 M200 175 L125 235 M200 175 L285 130 M200 270 L140 360 M200 270 L265 360" fill="none" ' + S + ' stroke-width="16"/><circle cx="170" cy="82" r="6" fill="#111"/><circle cx="224" cy="82" r="6" fill="#111"/><path d="M175 108 Q200 125 226 108" fill="none" ' + S + ' stroke-width="6"/><rect x="270" y="95" width="50" height="80" rx="10" fill="#2c56ff" ' + S + '/>',
    shrug: () => '<circle cx="200" cy="100" r="52" fill="#f3eee4" ' + S + '/><path d="M200 152 V280 M200 190 L120 160 L100 110 M200 190 L280 160 L300 110 M200 280 L145 365 M200 280 L255 365" fill="none" ' + S + ' stroke-width="16"/><circle cx="178" cy="92" r="6" fill="#111"/><circle cx="224" cy="92" r="6" fill="#111"/><path d="M178 125 H224" fill="none" ' + S + ' stroke-width="6"/><text x="200" y="40" font-family="Anton" font-size="50" text-anchor="middle" fill="#111">?</text>'
  };
  const ART_KEYS = ['laptop', 'phone', 'chat', 'check', 'stall', 'calendar', 'heart'];
  const MAP = [
    [/price|cost|\$|pay|deposit|budget|cash|rate/i, 'tag'], [/calendar|date|book|schedule|hours|open|week|season|plan|slot/i, 'calendar'],
    [/photo|camera|image|visual|shoot|light/i, 'camera'], [/review|proof|trust|star|testimon|reput/i, 'stars'],
    [/map|local|google|listing|near|area|address|where|street/i, 'pin'], [/search|find|found|keyword|seo|word/i, 'search'],
    [/message|dm|reply|chat|question|answer|talk|ask|greet/i, 'chat'], [/gift|voucher|offer|promo|holiday|christmas|valentine|mother|festiv|eid|ramadan/i, 'gift'],
    [/market|stall|shop|sign|trader|front|queue|barber/i, 'stall'], [/minute|second|fast|quick|clock|time|hour|late/i, 'clock'],
    [/website|page|site|link|bio|profile|screen|button|mobile|phone/i, 'phone']
  ];
  function pickArt(text, i) { for (const [re, k] of MAP) if (re.test(text || '')) return k; return ART_KEYS[(i || 0) % ART_KEYS.length]; }
  const art = (k, w, extra) => '<div style="width:' + w + 'px;height:' + w + 'px;' + (extra || '') + '">' + svg(ART[k] ? ART[k]() : ART.check(), w, w) + '</div>';

  /* ---------- 3D clay floaters ---------- */
  function clay(kind, color, size, x, y, rot) {
    const id = 'g' + (++uid), dark = shade(color, -0.28), light = shade(color, 0.35);
    let inner = '';
    if (kind === 'sphere') inner = '<defs><radialGradient id="' + id + '" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="' + light + '"/><stop offset=".55" stop-color="' + color + '"/><stop offset="1" stop-color="' + dark + '"/></radialGradient></defs><circle cx="100" cy="100" r="88" fill="url(#' + id + ')"/><ellipse cx="70" cy="62" rx="26" ry="14" fill="#fff" opacity=".45" transform="rotate(-30 70 62)"/>';
    else if (kind === 'cube') inner = '<polygon points="100,12 182,56 100,100 18,56" fill="' + light + '"/><polygon points="18,56 100,100 100,190 18,146" fill="' + color + '"/><polygon points="182,56 100,100 100,190 182,146" fill="' + dark + '"/><polygon points="100,12 182,56 100,100 18,56" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>';
    else if (kind === 'ring') inner = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + light + '"/><stop offset="1" stop-color="' + dark + '"/></linearGradient></defs><circle cx="100" cy="100" r="68" fill="none" stroke="url(#' + id + ')" stroke-width="42"/><circle cx="82" cy="60" r="10" fill="#fff" opacity=".5"/>';
    else if (kind === 'pill') inner = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + light + '"/><stop offset=".6" stop-color="' + color + '"/><stop offset="1" stop-color="' + dark + '"/></linearGradient></defs><rect x="10" y="60" width="180" height="80" rx="40" fill="url(#' + id + ')"/><rect x="34" y="72" width="70" height="12" rx="6" fill="#fff" opacity=".45"/>';
    else if (kind === 'star') inner = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + light + '"/><stop offset="1" stop-color="' + dark + '"/></linearGradient></defs>' + (function () { let p = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 42 : 92; p += (100 + r * Math.cos(a)).toFixed(1) + ',' + (100 + r * Math.sin(a)).toFixed(1) + ' '; } return '<polygon points="' + p + '" fill="url(#' + id + ')" stroke-linejoin="round" stroke="' + light + '" stroke-width="10"/>'; })();
    return '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + size + 'px;height:' + size + 'px;transform:rotate(' + (rot || 0) + 'deg);filter:drop-shadow(0 18px 18px rgba(0,0,0,.28))">' + svg(inner, size, size, '0 0 200 200') + '</div>';
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- decor ---------- */
  function burst(color, size, x, y, rot, n) {
    n = n || 16; let p = '';
    for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n, r = i % 2 ? 78 : 100; p += (100 + r * Math.cos(a)).toFixed(1) + ',' + (100 + r * Math.sin(a)).toFixed(1) + ' '; }
    return '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + size + 'px;height:' + size + 'px;transform:rotate(' + (rot || 0) + 'deg)">' + svg('<polygon points="' + p + '" fill="' + color + '"/>', size, size, '0 0 200 200') + '</div>';
  }
  function rays(color, cx, cy, op, n) {
    n = n || 18; let p = '';
    for (let i = 0; i < n; i++) { const a1 = i * 2 * Math.PI / n, a2 = a1 + Math.PI / n; p += '<polygon points="' + cx + ',' + cy + ' ' + (cx + 2200 * Math.cos(a1)).toFixed(0) + ',' + (cy + 2200 * Math.sin(a1)).toFixed(0) + ' ' + (cx + 2200 * Math.cos(a2)).toFixed(0) + ',' + (cy + 2200 * Math.sin(a2)).toFixed(0) + '" fill="' + color + '" opacity="' + op + '"/>'; }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350" style="position:absolute;left:0;top:0">' + p + '</svg>';
  }
  const dots = (alpha, size) => '<div style="position:absolute;inset:0;background-image:radial-gradient(rgba(0,0,0,' + (alpha || .16) + ') 3px,transparent 3.5px);background-size:' + (size || 28) + 'px ' + (size || 28) + 'px"></div>';
  function ankara(w, h, c1, c2, c3, x, y) {
    const id = 'ak' + (++uid);
    return '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;overflow:hidden">' + svg('<defs><pattern id="' + id + '" width="120" height="120" patternUnits="userSpaceOnUse"><rect width="120" height="120" fill="' + c1 + '"/><polygon points="60,6 114,60 60,114 6,60" fill="' + c2 + '"/><polygon points="60,28 92,60 60,92 28,60" fill="' + c3 + '"/><circle cx="60" cy="60" r="12" fill="' + c1 + '"/><path d="M0 0 L22 0 L0 22 Z M120 0 L98 0 L120 22 Z M0 120 L22 120 L0 98 Z M120 120 L98 120 L120 98 Z" fill="' + c3 + '"/></pattern></defs><rect width="' + w + '" height="' + h + '" fill="url(#' + id + ')"/>', w, h, '0 0 ' + w + ' ' + h) + '</div>';
  }
  const squig = (x, y, w, color) => '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px">' + svg('<path d="M10 70 C60 -10 110 150 160 60 S240 20 270 40" fill="none" stroke="' + color + '" stroke-width="12" stroke-linecap="round"/><path d="M240 5 L282 42 L236 72" fill="none" stroke="' + color + '" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>', w, w * 0.4, '0 0 300 120') + '</div>';
  const sticker = (text, x, y, rot, bg, fg) => '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;transform:rotate(' + (rot || 0) + 'deg);background:' + bg + ';color:' + fg + ';border:6px solid #111;border-radius:999px;padding:12px 30px;font-family:Anton,Impact,sans-serif;font-size:36px;letter-spacing:.08em;text-transform:uppercase;box-shadow:8px 8px 0 #111">' + esc(text) + '</div>';
  const tape = (x, y, rot) => '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:150px;height:46px;background:rgba(255,236,150,.85);transform:rotate(' + rot + 'deg);box-shadow:0 2px 6px rgba(0,0,0,.2)"></div>';
  function photo(src, w, h, x, y, rot, pos) {
    return '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;transform:rotate(' + rot + 'deg);background:#fff;padding:16px 16px 52px;box-shadow:0 26px 50px rgba(0,0,0,.35)"><div style="width:100%;height:100%;background:url(' + src + ') ' + (pos || 'center 15%') + '/cover"></div></div>' + tape(x + w / 2 - 75, y - 18, rot * 0.6);
  }
  const mark = (t, h, bg) => {
    if (!h) return esc(t);
    const i = t.toLowerCase().indexOf(h.toLowerCase()); if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + '<mark style="background:' + bg + '">' + esc(t.slice(i, i + h.length)) + '</mark>' + esc(t.slice(i + h.length));
  };
  const fsz = (n, cap) => Math.min(cap || 200, n <= 14 ? 200 : n <= 24 ? 160 : n <= 40 ? 128 : n <= 64 ? 104 : n <= 100 ? 86 : 70);
  const ssz = n => n <= 60 ? 66 : n <= 120 ? 56 : 46;
  const ab = (s) => 'position:absolute;' + s;

  /* mini page mock for devices on Thursday covers */
  function deviceLaptop(shot, x, y, w, rot) {
    const sw = w - 40, sh = Math.round(sw * 0.62);
    const screen = shot && shot.img && !/PLACEHOLDER/.test(shot.img)
      ? '<div style="width:' + sw + 'px;height:' + sh + 'px;overflow:hidden;border-radius:6px;background:#222"><img src="' + shot.img + '" style="display:block;width:' + sw + 'px;margin-top:-' + Math.round((shot.y || 0) * sw / (shot.iw || 1440)) + 'px" alt=""></div>'
      : '<div style="width:' + sw + 'px;height:' + sh + 'px;border-radius:6px;background:#f3eee4;display:flex;align-items:center;justify-content:center">' + svg(ART.laptop(), sh * 0.8, sh * 0.8) + '</div>';
    return '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;transform:rotate(' + (rot || 0) + 'deg);filter:drop-shadow(0 40px 40px rgba(0,0,0,.4))"><div style="background:#1b1b1b;border-radius:22px 22px 8px 8px;padding:20px 20px 24px;border:6px solid #111">' + screen + '</div><div style="height:26px;background:linear-gradient(#e6e6e6,#b9b9b9);border-radius:0 0 40px 40px;width:' + (w + 60) + 'px;margin-left:-30px;border:6px solid #111;border-top:0"></div></div>';
  }
  function devicePhone(shot, x, y, w, rot) {
    const sh = Math.round(w * 1.9);
    const inner = shot && shot.img && !/PLACEHOLDER/.test(shot.img)
      ? '<div style="width:' + (w - 24) + 'px;height:' + sh + 'px;border-radius:26px;overflow:hidden;background:#222"><img src="' + shot.img + '" style="display:block;width:' + Math.round((w - 24) * 3.4) + 'px;margin-left:-' + Math.round((w - 24) * 1.2) + 'px" alt=""></div>'
      : '<div style="width:' + (w - 24) + 'px;height:' + sh + 'px;border-radius:26px;background:#f3eee4;display:flex;align-items:center;justify-content:center">' + svg(ART.phone(), w - 24, w - 24) + '</div>';
    return '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;transform:rotate(' + (rot || 0) + 'deg);background:#111;border-radius:44px;padding:12px;border:6px solid #111;filter:drop-shadow(0 30px 30px rgba(0,0,0,.45))">' + inner + '</div>';
  }

  /* ---------- theme per post type ---------- */
  const THEME = {
    Monday:    {main: C.or, alt: C.bk, fg: '#fff', altfg: '#fff', hl: C.ye, label: 'Monday value'},
    Wednesday: {main: C.bk, alt: C.or, fg: '#fff', altfg: '#fff', hl: C.ye, label: 'Market Wednesday'},
    Thursday:  {main: C.bl, alt: C.bk, fg: '#fff', altfg: '#fff', hl: C.ye, label: 'Built for'},
    Saturday:  {main: C.ye, alt: C.bk, fg: '#111', altfg: '#fff', hl: C.lm, label: 'Saturday myth'}
  };
  const foot = (i, n, fg) => '<div style="' + ab('left:84px;right:84px;bottom:56px;display:flex;justify-content:space-between;font-weight:900;font-size:24px;letter-spacing:.05em;color:' + fg) + '"><span>EVANS ADEMILUA &middot; LARGE TECHNOLOGIES</span><span>' + (i + 1) + ' / ' + n + '</span></div>';
  const ANTON = 'font-family:Anton,Impact,sans-serif;text-transform:uppercase;line-height:1.1;';
  const SERIF = "font-family:'Instrument Serif',Georgia,serif;font-style:italic;line-height:1.08;";

  /* ---------- covers ---------- */
  function cover(sp, post, n) {
    const slot = post.slot, T = THEME[slot];
    let t = sp.t || post.title || '';
    if (slot === 'Saturday') t = t.replace(/^Myth:\s*/i, '');
    const sub = sp.s || '';
    const hl = sp.hl || '';
    let h = '';
    if (slot === 'Monday') {
      h += rays(C.ye, 880, 1150, .2) + dots(.14);
      h += burst(C.ye, 760, 400, 640, 8, 14) + photo('assets/evans.jpg', 430, 560, 560, 650, 4);
      h += clay('sphere', C.bl, 190, 840, 150, 0) + clay('cube', C.bk, 150, 70, 1010, -8) + clay('star', C.lm, 120, 60, 830, 12);
      h += sticker('Monday value', 84, 84, -3, C.ye, '#111');
      h += '<div style="' + ab('left:84px;top:210px;width:800px;color:#fff;' + ANTON + 'font-size:' + fsz(t.length, 150) + 'px') + '">' + mark(t, hl, C.ye).replace(/<mark/g, '<mark style="color:#111;padding:0 14px;margin:0 -14px"') + '</div>';
      if (sub) h += '<div style="' + ab('left:84px;top:' + (t.length > 40 ? 700 : 560) + 'px;width:460px;color:#fff;' + SERIF + 'font-size:' + (sub.length > 80 ? 46 : 58) + 'px') + '">' + esc(sub) + '</div>';
      h += squig(84, 1130, 250, '#111') + '<div style="' + ab('left:350px;top:1160px;font-weight:900;font-size:30px;letter-spacing:.12em;color:#111') + '">SWIPE</div>';
      h += foot(0, n, '#111');
    } else if (slot === 'Wednesday') {
      h += ankara(1080, 150, C.bk, C.or, C.ye, 0, 0) + ankara(1080, 190, C.bk, C.or, C.ye, 0, 1160) + dots(.1);
      h += '<div style="' + ab('left:240px;top:520px;width:600px;height:600px;border-radius:50%;background:' + C.ye) + '"></div>' + rays(C.or, 540, 820, .28, 22);
      h += '<div style="' + ab('left:130px;top:610px;width:820px') + '">' + svg(ART.stall(), 820, 820) + '</div>';
      h += clay('sphere', C.or, 150, 880, 330, 0) + clay('ring', C.lm, 130, 60, 360, 0) + clay('star', C.ye, 110, 900, 1010, 14);
      h += sticker('Market Wednesday', 84, 180, -3, C.or, '#fff');
      h += '<div style="' + ab('left:84px;right:84px;top:300px;color:#fff;' + ANTON + 'font-size:' + fsz(t.length, 130) + 'px') + '">' + mark(t, hl, C.ye).replace(/<mark/g, '<mark style="color:#111;padding:0 14px;margin:0 -14px"') + '</div>';
      h += '<div style="' + ab('left:84px;right:84px;bottom:68px;display:flex;justify-content:space-between;font-weight:900;font-size:24px;letter-spacing:.05em;color:#111;background:' + C.ye + ';padding:12px 20px;border-radius:12px') + '"><span>EVANS ADEMILUA &middot; LARGE TECHNOLOGIES</span><span>1 / ' + n + '</span></div>';
    } else if (slot === 'Thursday') {
      const shots = (post.slides || []).filter(s => s.k === 'shot');
      const shot = shots[0] ? {img: shots[0].img, y: shots[0].y, iw: shots[0].iw} : null;
      const shot2 = shots[1] ? {img: shots[1].img, y: shots[1].y, iw: shots[1].iw} : shot;
      h += rays(C.lm, 540, 1000, .16, 20) + dots(.12);
      h += burst(C.ye, 520, 620, 80, 10, 14);
      h += '<div style="' + ab('left:84px;top:84px;background:#fff;color:#111;border:6px solid #111;border-radius:16px;padding:14px 26px;box-shadow:8px 8px 0 #111;font-weight:900;font-size:38px') + '">' + esc(post.handle ? 'Built for ' + post.handle : 'Built for you') + '</div>';
      h += '<div style="' + ab('left:84px;right:84px;top:230px;color:#fff;' + ANTON + 'font-size:' + fsz(t.length, 120) + 'px') + '">' + mark(t, hl, C.ye).replace(/<mark/g, '<mark style="color:#111;padding:0 14px;margin:0 -14px"') + '</div>';
      h += deviceLaptop(shot, 70, 700, 760, -4) + devicePhone(shot2 || shot, 720, 760, 270, 7);
      h += sticker('Draft. Not live.', 560, 610, 5, C.lm, '#111') + clay('cube', C.or, 140, 880, 560, 12) + clay('sphere', C.ye, 120, 40, 1040, 0);
      h += foot(0, n, '#fff');
    } else { /* Saturday */
      h += dots(.12);
      h += '<div style="' + ab('left:-40px;top:70px;width:1200px;text-align:center;' + ANTON + 'font-size:470px;line-height:1;color:#fff;-webkit-text-stroke:14px #111;transform:rotate(-6deg);letter-spacing:.02em') + '">MYTH</div>';
      h += '<div style="' + ab('left:70px;top:130px;width:940px;height:420px;transform:rotate(-6deg)') + '">' + svg('<path d="M20 20 L920 400 M900 20 L40 400" stroke="' + C.or + '" stroke-width="40" stroke-linecap="round" opacity=".95"/>', 940, 420, '0 0 940 420') + '</div>';
      h += '<div style="' + ab('left:84px;right:84px;top:560px;background:#fff;border:8px solid #111;border-radius:36px;padding:34px 40px;box-shadow:14px 14px 0 #111;color:#111;' + SERIF + 'font-size:' + (t.length > 60 ? 62 : 80) + 'px') + '">&ldquo;' + esc(t) + '&rdquo;</div>';
      h += '<div style="' + ab('left:150px;top:' + (560 + (t.length > 60 ? 330 : 280)) + 'px;width:60px;height:60px;background:#fff;border:8px solid #111;border-top:0;border-right:0;transform:rotate(-30deg) skew(-20deg)') + '"></div>';
      h += '<div style="' + ab('left:660px;top:900px') + '">' + svg(ART.shrug(), 380, 380) + '</div>';
      h += '<div style="' + ab('left:84px;top:930px;width:520px;color:#111;font-weight:900;font-size:50px;line-height:1.15') + '">True or false? Swipe for the honest answer.</div>';
      h += sticker('Saturday myth buster', 84, 1130, -3, '#111', '#fff') + clay('star', C.or, 130, 880, 560 + 330, 0) + clay('sphere', C.bl, 120, 940, 60, 0);
      h += foot(0, n, '#111');
    }
    return h;
  }

  /* ---------- inner slides ---------- */
  function inner(sp, i, n, post) {
    const T = THEME[post.slot], alt = i % 2 === 0;
    const bg = alt ? T.alt : T.main, fg = alt ? T.altfg : T.fg, onYellow = bg === C.ye;
    const accent = bg === C.or ? '#111' : (bg === C.ye ? C.or : (bg === C.bk ? C.ye : C.ye));
    const head = sp.t || '', body = sp.s || '';
    const k = sp.art || pickArt(head + ' ' + body + ' ' + (post.title || ''), i);
    const v = i % 3;
    let h = '<div style="' + ab('inset:0;background:' + bg) + '"></div>' + dots(onYellow ? .1 : .14);
    const hlbg = onYellow ? '#fff' : (bg === C.bk || bg === C.bl ? C.ye : C.ye);
    const hs = fsz(head.length, 118);
    if (sp.k === 'shot') {
      const kk = 912 / (sp.iw || 1440), ch = Math.round(sp.h * kk);
      h += burst(accent, 420, 640, 20, 6, 14);
      h += '<div style="' + ab('left:84px;right:84px;top:130px;color:' + fg + ';' + ANTON + 'font-size:' + fsz(head.length, 104) + 'px') + '">' + mark(head, sp.hl, hlbg).replace(/<mark/g, '<mark style="color:#111;padding:0 14px;margin:0 -14px"') + '</div>';
      const inn = /PLACEHOLDER/.test(sp.img || '') ? '<div style="height:' + ch + 'px;display:flex;align-items:center;justify-content:center;color:#ddd;font-weight:900;font-size:36px;background:#444">Add a screenshot of the draft here</div>' : '<div style="height:' + ch + 'px;overflow:hidden;border-radius:8px;background:#444"><img src="' + sp.img + '" style="display:block;width:100%;margin-top:-' + Math.round(sp.y * kk) + 'px" alt=""></div>';
      h += '<div style="' + ab('left:84px;top:420px;width:912px;background:#1b1b1b;border-radius:22px;padding:46px 12px 12px;box-shadow:0 40px 80px rgba(0,0,0,.45);border:6px solid #111') + '"><div style="' + ab('left:20px;top:17px;width:14px;height:14px;border-radius:50%;background:#ff5f57;box-shadow:24px 0 #febc2e,48px 0 #28c840') + '"></div>' + inn + '</div>';
      if (sp.s) h += '<div style="' + ab('left:84px;right:84px;top:' + (420 + ch + 90) + 'px;color:#fff;background:#111;border-radius:22px;padding:18px 28px;' + SERIF + 'font-size:48px') + '">' + esc(sp.s) + '</div>';
      h += clay('sphere', C.or, 130, 900, 40, 0) + clay('cube', C.lm, 120, 20, 1080, -10);
    } else if (sp.k === 'list') {
      h += burst(accent, 300, 770, 20, 8, 12) + clay('sphere', C.or, 110, 930, 260, 0);
      h += '<div style="' + ab('left:84px;width:760px;top:120px;color:' + fg + ';' + ANTON + 'font-size:' + fsz(head.length, 100) + 'px') + '">' + esc(head) + '</div>';
      const its = sp.items || [], nI = its.length || 1, top0 = head.length > 38 ? 520 : head.length > 22 ? 440 : 360, step = Math.min(200, Math.floor((1170 - top0) / nI)), rh = step - 22;
      its.forEach((it, j) => {
        h += '<div style="' + ab('left:84px;right:84px;top:' + (top0 + j * step) + 'px;height:' + rh + 'px;display:flex;gap:26px;align-items:center;background:' + (onYellow ? '#fff' : 'rgba(255,255,255,.12)') + ';border:6px solid #111;border-radius:26px;padding:0 28px;color:' + (onYellow ? '#111' : fg) + ';box-shadow:8px 8px 0 #111') + '"><span style="' + ANTON + 'font-size:' + Math.min(84, rh - 20) + 'px;color:' + (onYellow ? C.or : accent) + '">' + (j + 1) + '</span><span style="' + ANTON + 'font-size:' + (it.length > 40 ? 42 : Math.min(54, rh - 40)) + 'px;line-height:1.1">' + esc(it) + '</span></div>';
      });
      if (sp.s) h += '<div style="' + ab('left:84px;right:84px;top:1180px;color:' + fg + ';' + SERIF + 'font-size:46px') + '">' + esc(sp.s) + '</div>';
    } else if (sp.k === 'cta') {
      return cta(sp, i, n, post);
    } else { /* point or big */
      const num = sp.num ? sp.num : '';
      if (v === 1) { /* art top */
        h += burst(accent, 820, 130, 40, 0, 18) + '<div style="' + ab('left:250px;top:150px') + '">' + svg(ART[k](), 580, 580) + '</div>';
        h += clay('sphere', C.or === bg ? C.bl : C.or, 150, 80, 120, 0) + clay('star', C.lm, 120, 880, 640, 14);
        if (num) h += '<div style="' + ab('left:84px;top:84px;' + ANTON + 'font-size:130px;color:' + accent + ';-webkit-text-stroke:0') + '">' + esc(num) + '</div>';
        h += '<div style="' + ab('left:84px;right:84px;top:760px;color:' + fg + ';' + ANTON + 'font-size:' + Math.min(hs, 104) + 'px') + '">' + mark(head, sp.hl, hlbg).replace(/<mark/g, '<mark style="color:#111;padding:0 14px;margin:0 -14px"') + '</div>';
        if (body) h += '<div style="' + ab('left:84px;right:84px;top:' + (760 + (head.length > 22 ? 270 : 150)) + 'px;color:' + fg + ';' + SERIF + 'font-size:' + ssz(body.length) + 'px') + '">' + esc(body) + '</div>';
      } else if (v === 2) { /* giant number, art bottom right */
        if (num) h += '<div style="' + ab('left:420px;top:20px;' + ANTON + 'font-size:620px;line-height:1;color:transparent;-webkit-text-stroke:5px ' + accent + ';opacity:.22') + '">' + esc(num.replace(/^0/, '')) + '</div>';
        h += '<div style="' + ab('left:84px;right:84px;top:220px;color:' + fg + ';' + ANTON + 'font-size:' + Math.min(hs, 112) + 'px') + '">' + mark(head, sp.hl, hlbg).replace(/<mark/g, '<mark style="color:#111;padding:0 14px;margin:0 -14px"') + '</div>';
        if (body) h += '<div style="' + ab('left:84px;width:620px;top:' + (220 + (head.length > 22 ? 330 : 210)) + 'px;color:' + fg + ';' + SERIF + 'font-size:' + ssz(body.length) + 'px') + '">' + esc(body) + '</div>';
        h += burst(accent, 560, 520, 760, 12, 14) + '<div style="' + ab('left:600px;top:810px') + '">' + svg(ART[k](), 430, 430, '0 0 400 400', 'transform:rotate(6deg)') + '</div>' + clay('cube', C.lm, 140, 60, 1030, -6) + clay('ring', C.or === bg ? C.ye : C.or, 120, 880, 560, 0);
      } else { /* art right, text left, ankara strip */
        h += ankara(1080, 46, bg, accent, fg === '#fff' ? '#fff' : '#111', 0, 1304) + dots(0);
        h += '<div style="' + ab('left:84px;top:84px;' + ANTON + 'font-size:120px;color:' + accent) + '">' + esc(num || '') + '</div>';
        h += '<div style="' + ab('left:84px;width:560px;top:' + (num ? 260 : 150) + 'px;color:' + fg + ';' + ANTON + 'font-size:' + Math.min(hs, 96) + 'px') + '">' + mark(head, sp.hl, hlbg).replace(/<mark/g, '<mark style="color:#111;padding:0 14px;margin:0 -14px"') + '</div>';
        if (body) h += '<div style="' + ab('left:84px;width:560px;top:' + (num ? 260 : 150) + 'px;margin-top:' + (Math.ceil(head.length / 12) * 100 + 40) + 'px;color:' + fg + ';' + SERIF + 'font-size:' + Math.min(ssz(body.length), 54) + 'px') + '">' + esc(body) + '</div>';
        h += burst(accent, 520, 580, 140, 0, 16) + '<div style="' + ab('left:610px;top:210px') + '">' + svg(ART[k](), 420, 420) + '</div>' + clay('sphere', C.or === bg ? C.bl : C.or, 190, 700, 700, 0) + clay('star', C.lm, 120, 840, 1020, 10);
      }
    }
    h += foot(i, n, fg);
    return h;
  }

  function cta(sp, i, n, post) {
    const T = THEME[post.slot], bg = T.main, fg = T.fg, onY = bg === C.ye;
    let h = '<div style="' + ab('inset:0;background:' + bg) + '"></div>' + rays(onY ? C.or : C.ye, 540, 820, .18, 20) + dots(.12);
    const t = sp.t || '';
    h += '<div style="' + ab('left:84px;right:84px;top:110px;color:' + fg + ';' + ANTON + 'font-size:' + fsz(t.length, 100) + 'px') + '">' + esc(t) + '</div>';
    h += burst(onY ? '#111' : C.ye, 700, 190, 330, 0, 16);
    h += '<div style="' + ab('left:160px;width:760px;top:' + (sp.word.length > 7 ? 610 : sp.word.length > 5 ? 585 : 555) + 'px;text-align:center;' + ANTON + 'font-size:' + (sp.word.length > 7 ? 150 : sp.word.length > 5 ? 190 : 250) + 'px;line-height:1;color:' + (onY ? C.ye : '#111')) + '">' + esc(sp.word) + '</div>';
    h += '<div style="' + ab('left:84px;right:84px;top:1060px;text-align:center;color:' + fg + ';' + SERIF + 'font-size:60px') + '">' + esc(sp.s || 'Send me the word and I will reply.') + '</div>';
    h += '<div style="' + ab('left:84px;top:1170px;width:140px;height:140px;border-radius:50%;border:8px solid #111;background:url(assets/evans-head.jpg) center/cover;box-shadow:8px 8px 0 #111') + '"></div>';
    h += '<div style="' + ab('right:84px;top:1196px;background:#111;color:#fff;border-radius:999px;padding:12px 30px;font-weight:900;font-size:34px') + '">@theevanslarge1</div>';
    h += clay('sphere', C.or === bg ? C.bl : C.or, 140, 900, 80, 0) + clay('cube', C.lm, 120, 40, 460, -8);
    return h;
  }

  function render(sp, i, n, post) {
    const el = document.createElement('div');
    el.className = 'slide v2';
    el.style.cssText = 'width:1080px;height:1350px;position:relative;overflow:hidden;font-family:Figtree,sans-serif;display:block;padding:0;gap:0';
    if (i === 0) {
      const T = THEME[post.slot];
      el.innerHTML = '<div style="' + ab('inset:0;background:' + T.main) + '"></div>' + cover(sp, post, n);
    } else if (sp.k === 'cta') el.innerHTML = cta(sp, i, n, post);
    else el.innerHTML = inner(sp, i, n, post);
    return el;
  }
  window.SLIDES = {render, THEME};
})();
