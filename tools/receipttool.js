/* receipttool.js : the 25 receipt designs (17 everyday, 8 festive). Plain HTML and CSS from
   tools/css/docgen.css, with small inline SVG drawings for decoration. */
(function () {
'use strict';
const DG = window.DocGen;
if (!DG) return;
const NS = 'http://www.w3.org/2000/svg';
const f1 = (n) => Math.round(n * 10) / 10;
const svg = (w, h, body, cls) => '<svg class="' + (cls || 'fx') + '" xmlns="' + NS + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + body + '</svg>';
const rad = (a) => a * Math.PI / 180;

/* ------------------------------------------------------------------ small drawings */
function flake(cx, cy, r, c) {
  let s = '<g stroke="' + c + '" stroke-width="' + f1(Math.max(1, r / 7)) + '" stroke-linecap="round" fill="none">';
  for (let a = 0; a < 180; a += 60) {
    const dx = Math.cos(rad(a)) * r, dy = Math.sin(rad(a)) * r;
    s += '<line x1="' + f1(cx - dx) + '" y1="' + f1(cy - dy) + '" x2="' + f1(cx + dx) + '" y2="' + f1(cy + dy) + '"/>';
  }
  for (let a = 0; a < 360; a += 60) {
    const bx = cx + Math.cos(rad(a)) * r * 0.6, by = cy + Math.sin(rad(a)) * r * 0.6;
    [-40, 40].forEach((o) => { s += '<line x1="' + f1(bx) + '" y1="' + f1(by) + '" x2="' + f1(bx + Math.cos(rad(a + o)) * r * 0.32) + '" y2="' + f1(by + Math.sin(rad(a + o)) * r * 0.32) + '"/>'; });
  }
  return s + '</g>';
}
function star(cx, cy, r, c, k) {
  const p = [];
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * (k || 0.45) : r, a = rad(-90 + i * 36); p.push(f1(cx + Math.cos(a) * rr) + ',' + f1(cy + Math.sin(a) * rr)); }
  return '<polygon points="' + p.join(' ') + '" fill="' + c + '"/>';
}
const heart = (cx, cy, s, c) => '<path transform="translate(' + cx + ' ' + cy + ') scale(' + s + ')" d="M0,0.9 C-1.3,0 -0.7,-1 0,-0.35 C0.7,-1 1.3,0 0,0.9 Z" fill="' + c + '"/>';
function egg(cx, cy, r, c, c2) {
  const w = r * 0.78; let z = '';
  for (let i = 0; i <= 6; i++) z += (i ? ' ' : '') + f1(cx - w + i * w / 3) + ',' + f1(cy + (i % 2 ? -r * 0.12 : r * 0.12));
  return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + f1(w) + '" ry="' + r + '" fill="' + c + '"/><polyline points="' + z + '" fill="none" stroke="' + c2 + '" stroke-width="' + f1(r / 6) + '"/>' +
    '<circle cx="' + f1(cx - w * 0.35) + '" cy="' + f1(cy - r * 0.5) + '" r="' + f1(r / 9) + '" fill="' + c2 + '"/><circle cx="' + f1(cx + w * 0.3) + '" cy="' + f1(cy + r * 0.55) + '" r="' + f1(r / 9) + '" fill="' + c2 + '"/>';
}
const crescent = (cx, cy, r, c, bg) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + c + '"/><circle cx="' + f1(cx + r * 0.38) + '" cy="' + f1(cy - r * 0.18) + '" r="' + f1(r * 0.82) + '" fill="' + bg + '"/>';
function lantern(cx, top, h, c, glow) {
  const w = h * 0.42;
  return '<line x1="' + cx + '" y1="0" x2="' + cx + '" y2="' + top + '" stroke="' + c + '" stroke-width="1.2"/>' +
    '<polygon points="' + f1(cx - w * 0.3) + ',' + top + ' ' + f1(cx + w * 0.3) + ',' + top + ' ' + f1(cx + w / 2) + ',' + f1(top + h * 0.2) + ' ' + f1(cx - w / 2) + ',' + f1(top + h * 0.2) + '" fill="' + c + '"/>' +
    '<rect x="' + f1(cx - w / 2) + '" y="' + f1(top + h * 0.2) + '" width="' + f1(w) + '" height="' + f1(h * 0.6) + '" rx="3" fill="' + glow + '" stroke="' + c + '" stroke-width="2"/>' +
    '<line x1="' + cx + '" y1="' + f1(top + h * 0.2) + '" x2="' + cx + '" y2="' + f1(top + h * 0.8) + '" stroke="' + c + '" stroke-width="1.4"/>' +
    '<polygon points="' + f1(cx - w / 2) + ',' + f1(top + h * 0.8) + ' ' + f1(cx + w / 2) + ',' + f1(top + h * 0.8) + ' ' + cx + ',' + f1(top + h) + '" fill="' + c + '"/>';
}
const leaf = (cx, cy, s, rot, c) => '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + rot + ') scale(' + s + ')"><path d="M0,-1 C0.65,-0.5 0.65,0.5 0,1 C-0.65,0.5 -0.65,-0.5 0,-1 Z" fill="' + c + '"/><line x1="0" y1="-0.85" x2="0" y2="1.15" stroke="rgba(0,0,0,0.25)" stroke-width="0.06"/></g>';
function burst(cx, cy, r, c) {
  let s = '<g stroke="' + c + '" stroke-width="2" stroke-linecap="round">';
  for (let a = 0; a < 360; a += 30) s += '<line x1="' + f1(cx + Math.cos(rad(a)) * r * 0.35) + '" y1="' + f1(cy + Math.sin(rad(a)) * r * 0.35) + '" x2="' + f1(cx + Math.cos(rad(a)) * r) + '" y2="' + f1(cy + Math.sin(rad(a)) * r) + '"/>';
  s += '</g>';
  for (let a = 15; a < 360; a += 30) s += '<circle cx="' + f1(cx + Math.cos(rad(a)) * r * 0.8) + '" cy="' + f1(cy + Math.sin(rad(a)) * r * 0.8) + '" r="1.8" fill="' + c + '"/>';
  return s;
}
const holly = (cx, cy, s) => leaf(cx - 9 * s, cy, 11 * s, -60, '#15803d') + leaf(cx + 9 * s, cy, 11 * s, 60, '#166534') +
  '<circle cx="' + cx + '" cy="' + f1(cy - 3 * s) + '" r="' + f1(3.6 * s) + '" fill="#dc2626"/><circle cx="' + f1(cx - 5 * s) + '" cy="' + f1(cy + 2 * s) + '" r="' + f1(3.6 * s) + '" fill="#b91c1c"/><circle cx="' + f1(cx + 5 * s) + '" cy="' + f1(cy + 2 * s) + '" r="' + f1(3.6 * s) + '" fill="#ef4444"/>';
function hazard(w, h) {
  let s = '<rect width="' + w + '" height="' + h + '" fill="#facc15"/>';
  for (let x = -h; x < w + h; x += 2 * h) s += '<polygon points="' + x + ',' + h + ' ' + (x + h) + ',0 ' + (x + 2 * h) + ',0 ' + (x + h) + ',' + h + '" fill="#111111"/>';
  return svg(w, h, s, 'fx strip');
}
function dots(w, h, c, step) {
  let s = '';
  for (let x = step / 2; x < w; x += step) for (let y = step / 2; y < h; y += step) s += '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="1.3" fill="' + c + '"/>';
  return s;
}

/* icons, drawn with currentColor */
const ICON = {
  fork: svg(34, 34, '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M10 4v10a4 4 0 0 0 4 4v12M18 4v10a4 4 0 0 1-4 4M14 4v9"/><path d="M25 30V4c-3 2-4 6-4 11 0 3 1 4 4 4"/></g>', 'ico'),
  cross: svg(34, 34, '<path d="M12 3h10v9h9v10h-9v9H12v-9H3V12h9z" fill="currentColor"/>', 'ico'),
  cup: svg(34, 34, '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 13h19v8a7 7 0 0 1-7 7h-5a7 7 0 0 1-7-7z"/><path d="M24 15h3a4 4 0 0 1 0 8h-3M11 4c-1 2 1 3 0 5M16 4c-1 2 1 3 0 5"/></g>', 'ico'),
  pump: svg(34, 34, '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="5" y="4" width="15" height="26" rx="2"/><path d="M8 9h9v6H8zM20 12h4l4 4v10a2 2 0 0 1-4 0v-6h-4"/></g>', 'ico'),
  scissors: svg(34, 34, '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="9" cy="25" r="4.5"/><circle cx="25" cy="25" r="4.5"/><path d="M12 22L27 4M22 22L7 4"/></g>', 'ico'),
  bolt: svg(34, 34, '<path d="M19 3L7 19h9l-2 12 13-17h-9z" fill="currentColor"/>', 'ico'),
  bag: svg(34, 34, '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M6 11h22l-2 19H8z"/><path d="M12 14V9a5 5 0 0 1 10 0v5"/></g>', 'ico'),
};
const stamp = svg(130, 130, '<g transform="rotate(-14 65 65)" fill="none" stroke="#15803d" stroke-width="4"><circle cx="65" cy="65" r="56"/><circle cx="65" cy="65" r="47" stroke-width="1.5"/>' +
  '<text x="65" y="76" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="32" fill="#15803d" stroke="none">PAID</text></g>', 'stamp');

/* ------------------------------------------------------------------ layouts */
// a till roll, 80 mm wide
function roll(d, H, o) {
  o = o || {};
  const hr = '<div class="hr"></div>';
  return (o.top || '') + '<div class="c head">' + (o.icon || '') + H.logo() + '<div class="bn">' + H.bizName() + '</div>' + H.line('biz.addr', 'Address', 'ba', { ml: 1 }) + H.line('biz.phone', 'Phone', 'bp') + H.line('biz.email', 'Email', 'be') + '</div>' +
    hr + '<div class="c ttl">' + H.title(o.title || 'Receipt') + '</div>' + (o.sub ? '<div class="c sub">' + o.sub + '</div>' : '') + H.meta() + H.cust('Customer') + hr + H.list() + hr + H.totals() + hr +
    H.notes() + H.thanks('c') + (o.bottom || '') + '';
}
// a page receipt, A5 wide
function card(d, H, o) {
  o = o || {};
  const band = o.band ? '<div class="band">' + (o.bandSvg || '') + '<div class="greet">' + o.band + '</div>' + (o.bandSub ? '<div class="gsub">' + o.bandSub + '</div>' : '') + '</div>' : '';
  const head = o.center
    ? '<div class="ctr">' + (o.icon || '') + H.mark() + '<div class="bn">' + H.bizName() + '</div>' + H.biz({ noName: 1 }) + '</div><div class="ttl c">' + H.title(o.title || 'Receipt') + '</div>' + H.meta('mid')
    : '<div class="hd"><div class="hl">' + (o.icon || '') + H.mark() + H.biz() + '</div><div class="hr"><div class="ttl">' + H.title(o.title || 'Receipt') + '</div>' + H.meta() + '</div></div>';
  return (o.top || '') + band + '<div class="pad">' + head + H.cust('Received from') + H.items() + '<div class="ft">' + (o.mid || '<div></div>') + H.totals() + '</div>' +
    H.notes() + H.thanks() + (o.bottom || '') + '</div>' + (o.end || '');
}

/* ------------------------------------------------------------------ bands for the festive designs */
function band(w, h, bg, draw) { return svg(w, h, '<rect width="' + w + '" height="' + h + '" fill="' + bg + '"/>' + draw); }
const W = 559, BH = 120;
const xmasBand = band(W, BH, '#b91c1c', [[30, 26, 12], [92, 80, 8], [150, 30, 7], [420, 28, 9], [478, 84, 12], [530, 34, 7], [250, 98, 6], [330, 18, 6], [60, 96, 6]].map((p) => flake(p[0], p[1], p[2], 'rgba(255,255,255,0.8)')).join('') + holly(30, 100, 1.1) + holly(528, 16, 1));
const nyBand = band(W, BH, '#0b1d3a', burst(60, 50, 34, '#d4a017') + burst(495, 44, 28, '#f5d76e') + burst(430, 96, 16, '#d4a017') + burst(130, 98, 14, '#f5d76e') +
  [[200, 20, 5], [360, 24, 6], [300, 100, 4], [540, 100, 5], [20, 104, 4], [250, 60, 3]].map((p) => star(p[0], p[1], p[2], '#f5d76e')).join(''));
const easterBand = band(W, BH, '#ede9fe', egg(46, 70, 26, '#f9a8d4', '#ffffff') + egg(98, 84, 20, '#a7f3d0', '#7c3aed') + egg(470, 80, 22, '#fde68a', '#ec4899') + egg(520, 64, 28, '#c4b5fd', '#ffffff') +
  dots(W, BH, 'rgba(124,58,237,0.12)', 22));
const eidBand = band(W, BH, '#065f46', crescent(500, 58, 34, '#e8c15a', '#065f46') + star(468, 44, 9, '#e8c15a') + lantern(60, 18, 70, '#e8c15a', '#fde68a') + lantern(112, 8, 52, '#e8c15a', '#fef3c7') +
  [[200, 22, 4], [300, 98, 4], [380, 20, 3], [160, 96, 3], [540, 106, 3]].map((p) => star(p[0], p[1], p[2], '#e8c15a')).join(''));
const valBand = band(W, BH, '#fce7f3', [[40, 40, 18, '#e11d48'], [90, 90, 12, '#fb7185'], [140, 34, 8, '#f43f5e'], [430, 30, 10, '#fb7185'], [490, 78, 22, '#e11d48'], [540, 30, 9, '#f43f5e'], [250, 104, 7, '#fda4af'], [330, 16, 7, '#fda4af']]
  .map((p) => heart(p[0], p[1], p[2], p[3])).join(''));
const bfBand = band(W, BH, '#0a0a0a', '<polygon points="0,96 559,60 559,120 0,120" fill="#facc15"/><polygon points="0,110 559,82 559,90 0,118" fill="#ef4444"/>' +
  '<g transform="translate(470 22) rotate(18)"><rect x="0" y="0" width="64" height="34" rx="6" fill="#ef4444"/><circle cx="10" cy="17" r="4" fill="#0a0a0a"/></g>');
const ngBand = band(W, BH, '#008751', '<rect x="430" y="26" width="96" height="64" fill="#ffffff"/><rect x="430" y="26" width="32" height="64" fill="#008751"/><rect x="494" y="26" width="32" height="64" fill="#008751"/>' +
  '<rect x="430" y="26" width="96" height="64" fill="none" stroke="#ffffff" stroke-width="3"/>' + [[30, 24, 6], [70, 100, 5], [380, 104, 5], [400, 20, 4]].map((p) => star(p[0], p[1], p[2], 'rgba(255,255,255,0.7)')).join(''));
const harvestBand = band(W, BH, '#c2410c', [[40, 30, 20, 30, '#f59e0b'], [86, 88, 16, -40, '#fde68a'], [130, 26, 12, 70, '#92400e'], [440, 90, 18, -20, '#fbbf24'], [500, 32, 22, 40, '#fde68a'], [536, 96, 14, 100, '#92400e'], [280, 104, 9, 10, '#f59e0b'], [350, 16, 9, -60, '#fbbf24']]
  .map((p) => leaf(p[0], p[1], p[2], p[3], p[4])).join(''));
const ngStripe = svg(W, 10, '<rect width="186" height="10" fill="#008751"/><rect x="186" width="187" height="10" fill="#ffffff"/><rect x="373" width="186" height="10" fill="#008751"/>', 'fx strip');
const candy = (() => { let s = '<rect width="559" height="10" fill="#ffffff"/>'; for (let x = -10; x < 570; x += 20) s += '<polygon points="' + x + ',10 ' + (x + 10) + ',0 ' + (x + 20) + ',0 ' + (x + 10) + ',10" fill="#dc2626"/>'; return svg(W, 10, s, 'fx strip'); })();
const circuit = svg(W, 96, '<g fill="none" stroke="rgba(34,211,238,0.35)" stroke-width="1.5"><path d="M380 0v26h40l14 14h60M440 96V70h50l12-12h57M330 96V60h-30M520 0v18h39"/></g>' +
  '<g fill="#22d3ee"><circle cx="494" cy="40" r="3.5"/><circle cx="300" cy="60" r="3.5"/><circle cx="502" cy="58" r="3.5"/></g>', 'fx circ');
const salonDeco = svg(200, 140, leaf(150, 40, 26, 35, 'rgba(168,85,247,0.25)') + leaf(178, 92, 20, -30, 'rgba(168,85,247,0.18)') + '<circle cx="120" cy="96" r="20" fill="rgba(168,85,247,0.12)"/><circle cx="186" cy="20" r="10" fill="rgba(168,85,247,0.2)"/>', 'fx corner');
const fuelTop = svg(302, 8, '<rect width="151" height="8" fill="#dc2626"/><rect x="151" width="151" height="8" fill="#f59e0b"/>', 'fx strip');

const T = [
  /* everyday: till rolls */
  { id: 'thermal', name: 'Thermal till roll', paper: 'thermal', accent: '#111111', render: (d, H) => roll(d, H) },
  { id: 'tillbold', name: 'Till roll bold', paper: 'thermal', accent: '#111111', render: (d, H) => roll(d, H) },
  { id: 'supermarket', name: 'Supermarket', paper: 'thermal', accent: '#15803d', render: (d, H) => roll(d, H, { icon: '<div class="ic">' + ICON.bag + '</div>', sub: 'Items: ' + H.rows().length, bottom: '<div class="c bc">' + H.barcode(200, 42) + '<div class="sm">' + H.esc(d.no || '') + '</div></div>' }) },
  { id: 'fuel', name: 'Fuel station', paper: 'thermal', accent: '#dc2626', render: (d, H) => roll(d, H, { top: fuelTop, icon: '<div class="ic">' + ICON.pump + '</div>', title: 'Fuel receipt' }) },
  { id: 'pos', name: 'POS slip', paper: 'thermal', accent: '#374151', render: (d, H) => roll(d, H, { sub: 'Customer copy', bottom: '<div class="c ok">Approved</div>' }) },
  /* everyday: pages */
  { id: 'simple', name: 'Simple', paper: 'a5', accent: '#2563eb', render: (d, H) => card(d, H) },
  { id: 'modern', name: 'Modern', paper: 'a5', accent: '#0891b2', render: (d, H) => card(d, H) },
  { id: 'boutique', name: 'Boutique', paper: 'a5', accent: '#9d174d', render: (d, H) => card(d, H, { center: 1 }) },
  { id: 'restaurant', name: 'Restaurant', paper: 'a5', accent: '#14532d', render: (d, H) => card(d, H, { center: 1, icon: '<div class="ic">' + ICON.fork + '</div>' }) },
  { id: 'pharmacy', name: 'Pharmacy', paper: 'a5', accent: '#0d9488', render: (d, H) => card(d, H, { icon: '<div class="ic">' + ICON.cross + '</div>' }) },
  { id: 'salon', name: 'Salon and spa', paper: 'a5', accent: '#7e22ce', render: (d, H) => card(d, H, { top: salonDeco, icon: '<div class="ic">' + ICON.scissors + '</div>' }) },
  { id: 'cafe', name: 'Cafe', paper: 'a5', accent: '#78350f', render: (d, H) => card(d, H, { center: 1, icon: '<div class="ic">' + ICON.cup + '</div>' }) },
  { id: 'corporate', name: 'Corporate', paper: 'a5', accent: '#1e40af', render: (d, H) => card(d, H) },
  { id: 'minimal', name: 'Minimal', paper: 'a5', accent: '#111111', render: (d, H) => card(d, H) },
  { id: 'paid', name: 'Paid stamp', paper: 'a5', accent: '#15803d', render: (d, H) => card(d, H, { mid: '<div class="stp">' + stamp + '</div>' }) },
  { id: 'hardware', name: 'Hardware store', paper: 'a5', accent: '#a16207', render: (d, H) => card(d, H, { top: hazard(W, 14), end: hazard(W, 14) }) },
  { id: 'tech', name: 'Electronics', paper: 'a5', accent: '#0891b2', render: (d, H) => card(d, H, { top: '<div class="dk">' + circuit + '</div>', icon: '<div class="ic">' + ICON.bolt + '</div>' }) },
  /* festive */
  { id: 'christmas', name: 'Christmas', group: 'festive', paper: 'a5', accent: '#166534', render: (d, H) => card(d, H, { band: 'Merry Christmas', bandSub: 'and a happy holiday season', bandSvg: xmasBand, end: candy }) },
  { id: 'newyear', name: 'New Year', group: 'festive', paper: 'a5', accent: '#b8860b', render: (d, H) => card(d, H, { band: 'Happy New Year', bandSub: 'Thank you for a wonderful year', bandSvg: nyBand }) },
  { id: 'easter', name: 'Easter', group: 'festive', paper: 'a5', accent: '#7c3aed', render: (d, H) => card(d, H, { band: 'Happy Easter', bandSub: 'Wishing you joy and peace', bandSvg: easterBand }) },
  { id: 'eid', name: 'Eid', group: 'festive', paper: 'a5', accent: '#065f46', render: (d, H) => card(d, H, { band: 'Eid Mubarak', bandSub: 'Peace and blessings to you and your family', bandSvg: eidBand }) },
  { id: 'valentine', name: 'Valentine', group: 'festive', paper: 'a5', accent: '#e11d48', render: (d, H) => card(d, H, { band: 'Happy Valentine\u2019s Day', bandSub: 'Made with love', bandSvg: valBand }) },
  { id: 'blackfriday', name: 'Black Friday', group: 'festive', paper: 'a5', accent: '#0a0a0a', render: (d, H) => card(d, H, { band: 'BLACK FRIDAY', bandSub: 'Thanks for shopping the sale', bandSvg: bfBand }) },
  { id: 'independence', name: 'Independence Day', group: 'festive', paper: 'a5', accent: '#008751', render: (d, H) => card(d, H, { band: 'Happy Independence Day', bandSub: 'Proudly Nigerian', bandSvg: ngBand, end: ngStripe }) },
  { id: 'harvest', name: 'Thanksgiving and harvest', group: 'festive', paper: 'a5', accent: '#9a3412', render: (d, H) => card(d, H, { band: 'Happy Thanksgiving', bandSub: 'Grateful for you this harvest season', bandSvg: harvestBand }) },
];

const sample = {
  biz: { name: 'Mama Tee Kitchen', addr: '5 Allen Avenue, Ikeja, Lagos', phone: '+234 802 555 0147', email: 'orders@mamatee.ng', logo: '' },
  cust: { name: 'Tunde Bakare', contact: '0803 000 1122' },
  items: [{ desc: 'Jollof rice', qty: '2', price: '2500' }, { desc: 'Grilled chicken', qty: '1', price: '3500' },
    { desc: 'Fried plantain', qty: '2', price: '800' }, { desc: 'Chapman', qty: '2', price: '1500' }],
  no: 'RCT-0107', currency: 'NGN', taxName: 'VAT', taxRate: '7.5', discount: '', paid: '15000', method: 'Cash', title: '',
  notes: '', thanks: 'Thank you for your purchase.',
};

DG.init({ kind: 'receipt', templates: T, sample });
})();
