"""Invoice generator and receipt generator as one tool with two buttons. The page shows one at a time (both use the same
engine and the same element names), and switching reloads the page with #invoice or #receipt."""
import importlib.util
import os
import sys

_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
import _dg_common as c


def _load(name):
    spec = importlib.util.spec_from_file_location('part_' + name, os.path.join(_d, '_parts', name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


_inv, _rec = _load('invoice_generator'), _load('receipt_generator')

INFO = dict(slug='invoice-receipt-generator', kicker='Business', tile_title='Invoice and receipt generator',
            tile_desc='Make an invoice or a receipt in one tool: 18 invoice designs and 33 receipt designs, with PDF, PNG and print. No sign-up, no watermark.',
            nav='Invoice and receipt generator', pos=5)

TOOL = ('<div class="vh-tabs" role="tablist" aria-label="Choose a document">'
        '<button type="button" role="tab" class="vh-tab" data-k="invoice" aria-selected="false">Invoice</button>'
        '<button type="button" role="tab" class="vh-tab" data-k="receipt" aria-selected="false">Receipt</button></div>\n'
        '<div id="dh-mount"></div>\n'
        '<template id="tpl-invoice">' + c.tool('invoice') + '</template>\n'
        '<template id="tpl-receipt">' + c.tool('receipt') + '</template>')


def _strip(h):
    return h.replace('<section class="block prose">', '<div>').replace('</section>', '</div>')


PAGE = dict(
    title='Free Invoice and Receipt Generator: 51 Designs, PDF, No Watermark',
    desc='Make an invoice or a receipt in your browser. 18 invoice designs and 33 receipt designs, including church, rent, school fees, pro forma, quote, tax invoice and festive. PDF, PNG and print. No sign-up, no watermark.',
    h1='Invoice and receipt generator', app='Free Invoice and Receipt Generator',
    lead='Choose Invoice or Receipt, pick a design, fill in a few details and download a clean PDF. No sign-up, no watermark. Your details stay in your browser.',
    tool=TOOL, vendor=[], own=['dochub.js'], module=[], css=['docgen.css', 'video-hub.css'],
    sections='<section class="block prose" id="about-invoice"><h2>Invoice generator</h2>' + _strip(_inv.SECTIONS) + '</section>'
             '<section class="block prose" id="about-receipt"><h2>Receipt generator</h2>' + _strip(_rec.SECTIONS) + '</section>'
             '<section class="block prose"><h2>Only for your own business</h2><p>These documents are for real sales and payments in your own business: invoices you send, receipts you give. Do not use a receipt maker to copy another shop, or to claim a refund or an expense that did not happen. That is fraud.</p></section>',
    faq=list(_inv.PAGE['faq']) + list(_rec.PAGE['faq']),
    related=['currency-calculator', 'pdf-converter', 'qr-code-generator', 'image-converter'])
