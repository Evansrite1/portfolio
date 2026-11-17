/* invoicetool.js : the 18 invoice designs. Each one is plain HTML, styled in tools/css/docgen.css.
   H holds the shared pieces (business, customer, items table, totals) from docgen.js. */
(function () {
'use strict';
const DG = window.DocGen;
if (!DG) return;

const due = (d, H, label) => '<div class="due"><div class="lbl">' + (label || 'Amount due') + '</div><div class="amt">' + H.esc(H.dueAmount()) + '</div>' +
  (d.due ? '<div class="sm">Due by ' + H.esc(H.fdate(d.due)) + '</div>' : '') + '</div>';
const foot = (H) => '<div class="ft">' + H.notes() + H.totals() + '</div>' + H.thanks();

const blobs = '<svg class="deco" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 200" width="260" height="200" fill="currentColor">' +
  '<circle cx="200" cy="40" r="110" opacity="0.18"/><circle cx="235" cy="10" r="70" opacity="0.35"/><circle cx="120" cy="-20" r="45" opacity="0.12"/></svg>';

const T = [
  { id: 'classic', name: 'Classic', paper: 'a4', accent: '#1e3a8a',
    render: (d, H) => '<div class="pad"><div class="hd"><div class="hl">' + H.mark() + H.biz() + '</div><div class="hr"><div class="ttl">' + H.title('Invoice') + '</div>' + H.meta() + '</div></div>' +
      '<div class="row">' + H.cust('Bill to') + due(d, H) + '</div>' + H.items() + foot(H) + '</div>' },

  { id: 'modern', name: 'Modern bold header', paper: 'a4', accent: '#4f46e5',
    render: (d, H) => '<div class="band"><div class="bl">' + H.logo() + '<div class="ttl">' + H.title('Invoice') + '</div><div class="bn">' + H.bizName() + '</div></div><div class="br">' + H.meta() + '</div></div>' +
      '<div class="pad"><div class="row3"><div><div class="lbl">From</div>' + H.biz({ noName: 1 }) + '</div>' + H.cust('Billed to') + due(d, H) + '</div>' + H.items({ num: 1 }) + foot(H) + '</div>' },

  { id: 'minimal', name: 'Minimal', paper: 'a4', accent: '#111111',
    render: (d, H) => '<div class="pad"><div class="hd"><div class="hl">' + H.logo() + '<div class="bn">' + H.bizName() + '</div></div><div class="ttl">' + H.title('Invoice') + '</div></div>' +
      '<div class="row3"><div>' + H.biz({ noName: 1 }) + '</div>' + H.cust('Bill to') + H.meta() + '</div>' + H.items() + foot(H) + '</div>' },

  { id: 'corporate', name: 'Corporate blue', paper: 'a4', accent: '#1d4ed8',
    render: (d, H) => '<div class="stripe"></div><div class="pad"><div class="hd"><div class="hl">' + H.mark() + '<div>' + '<div class="bn">' + H.bizName() + '</div>' + H.biz({ noName: 1 }) + '</div></div><div class="ttl">' + H.title('Invoice') + '</div></div>' +
      '<div class="boxes"><div class="box">' + H.cust('Bill to') + '</div><div class="box">' + H.meta() + '</div><div class="box hi">' + due(d, H, 'Balance due') + '</div></div>' + H.items({ num: 1 }) + foot(H) + '</div><div class="stripe bt"></div>' },

  { id: 'coral', name: 'Creative coral', paper: 'a4', accent: '#f0624f',
    render: (d, H) => blobs + '<div class="pad"><div class="ttl">' + H.title('Invoice') + '</div><div class="hd"><div class="hl">' + H.mark() + H.biz() + '</div>' + H.meta() + '</div>' +
      '<div class="row">' + H.cust('For') + due(d, H, 'Total to pay') + '</div>' + H.items() + foot(H) + '</div>' },

  { id: 'elegant', name: 'Elegant serif', paper: 'a4', accent: '#a16207',
    render: (d, H) => '<div class="pad"><div class="ctr">' + H.logo() + '<div class="bn">' + H.bizName() + '</div>' + H.biz({ noName: 1 }) + '</div><div class="rule"></div>' +
      '<div class="ttl">' + H.title('Invoice') + '</div><div class="row">' + H.cust('Billed to') + H.meta() + '</div>' + H.items() + foot(H) + '</div>' },

  { id: 'dark', name: 'Dark header', paper: 'a4', accent: '#f59e0b',
    render: (d, H) => '<div class="top"><div class="hd"><div class="hl">' + H.mark() + '<div><div class="bn">' + H.bizName() + '</div>' + H.biz({ noName: 1 }) + '</div></div><div class="hr"><div class="ttl">' + H.title('Invoice') + '</div>' + H.meta() + '</div></div></div>' +
      '<div class="pad"><div class="row">' + H.cust('Bill to') + due(d, H) + '</div>' + H.items() + foot(H) + '</div>' },

  { id: 'sidebar', name: 'Sidebar', paper: 'a4', accent: '#0f766e',
    render: (d, H) => '<div class="sbbg"></div><div class="grid"><div class="sb">' + H.mark() + '<div class="bn">' + H.bizName() + '</div>' + H.biz({ noName: 1 }) +
      '<div class="gap"></div>' + H.cust('Bill to') + '<div class="gap"></div>' + H.meta() + '<div class="gap"></div>' + due(d, H) + '</div>' +
      '<div class="main"><div class="ttl">' + H.title('Invoice') + '</div>' + H.items() + foot(H) + '</div></div>' },

  { id: 'compact', name: 'Compact', paper: 'a4', accent: '#334155',
    render: (d, H) => '<div class="pad"><div class="hd"><div class="hl">' + H.logo() + '<div><div class="bn">' + H.bizName() + '</div>' + H.biz({ noName: 1 }) + '</div></div><div class="hr"><div class="ttl">' + H.title('Invoice') + '</div>' + H.meta() + '</div></div>' +
      '<div class="row">' + H.cust('Bill to') + due(d, H) + '</div>' + H.items({ num: 1 }) + foot(H) + '</div>' },

  { id: 'freelancer', name: 'Freelancer', paper: 'a4', accent: '#16a34a',
    render: (d, H) => '<div class="pad"><div class="hd"><div class="hl">' + H.mark() + '<div><div class="bn">' + H.bizName() + '</div><div class="ttl">' + H.title('Invoice') + ' ' + H.t('no', 'INV-0001') + '</div></div></div>' + H.biz({ noName: 1 }) + '</div>' +
      '<div class="hero"><div><div class="lbl">Amount due</div><div class="amt">' + H.esc(H.dueAmount()) + '</div></div><div class="hm">' +
      '<div><span class="ml">Issued</span> ' + H.esc(H.fdate(d.date)) + '</div>' + (d.due ? '<div><span class="ml">Due</span> ' + H.esc(H.fdate(d.due)) + '</div>' : '') + '</div></div>' +
      H.cust('Prepared for') + H.items({ heads: ['Work done', 'Qty', 'Rate', 'Amount'] }) + foot(H) + '</div>' },
];

/* more designs: a purpose (pro forma, quote, tax invoice) or a colour, built on the layouts above */
const R = (id) => T.find((t) => t.id === id).render;
const retitle = (id, word) => (d, H) => R(id)(d, Object.assign({}, H, { title: (t) => H.title(t === 'Invoice' ? word : t) }));
[
  { id: 'proforma', base: 'classic', name: 'Pro forma invoice', paper: 'a4', accent: '#b45309', render: retitle('classic', 'Pro forma invoice') },
  { id: 'quote', base: 'modern', name: 'Quote and estimate', paper: 'a4', accent: '#0e7490', render: retitle('modern', 'Quote') },
  { id: 'taxinvoice', base: 'corporate', name: 'Tax invoice', paper: 'a4', accent: '#0f172a', render: retitle('corporate', 'Tax invoice') },
  { id: 'printer', base: 'compact', name: 'Printer friendly black and white', paper: 'a4', accent: '#000000', render: (d, H) => R('compact')(d, H) },
  { id: 'sunrise', base: 'coral', name: 'Sunrise orange', paper: 'a4', accent: '#ea580c', render: (d, H) => R('coral')(d, H) },
  { id: 'ocean', base: 'sidebar', name: 'Ocean sidebar', paper: 'a4', accent: '#0369a1', render: (d, H) => R('sidebar')(d, H) },
  { id: 'forest', base: 'elegant', name: 'Forest serif', paper: 'a4', accent: '#166534', render: (d, H) => R('elegant')(d, H) },
  { id: 'royal', base: 'dark', name: 'Royal purple header', paper: 'a4', accent: '#7c3aed', render: (d, H) => R('dark')(d, H) },
].forEach((t) => T.push(t));

const sample = {
  biz: { name: 'Bright Path Studio', addr: '12 Admiralty Way, Lekki\nLagos, Nigeria', phone: '+234 803 123 4567', email: 'hello@brightpath.ng', logo: '' },
  cust: { name: 'Adaeze Okafor', contact: 'adaeze@example.com' },
  items: [{ desc: 'Logo and brand design', qty: '1', price: '150000' }, { desc: 'Website, 5 pages', qty: '1', price: '450000' },
    { desc: 'Hosting and domain, 1 year', qty: '1', price: '60000' }, { desc: 'Social media graphics', qty: '10', price: '5000' }],
  no: 'INV-0042', currency: 'NGN', taxName: 'VAT', taxRate: '7.5', discount: '', paid: '', title: '',
  notes: 'Zenith Bank\nAccount name: Bright Path Studio\nAccount number: 1234567890', thanks: 'Thank you for your business.',
};

DG.init({ kind: 'invoice', templates: T, sample });
})();
