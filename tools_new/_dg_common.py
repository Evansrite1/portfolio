"""Shared HTML for the invoice and receipt generators (not a tool page itself).
Used only by invoice_generator.py and receipt_generator.py."""
import html

e = lambda s: html.escape(s, quote=True)


def f(key, label, kind='text', ph='', extra='', id_=None):
    i = id_ or 'dg-' + key.replace('.', '-')
    if kind == 'textarea':
        return '<div class="field"><label for="%s">%s</label><textarea id="%s" data-f="%s" placeholder="%s" rows="2" maxlength="400"%s></textarea></div>' % (i, label, i, key, e(ph), extra)
    return '<div class="field"><label for="%s">%s</label><input type="%s" id="%s" data-f="%s" placeholder="%s" autocomplete="off"%s></div>' % (i, label, kind, i, key, e(ph), extra)


def sel(key, label, options, id_=None):
    i = id_ or 'dg-' + key.replace('.', '-')
    return '<div class="field"><label for="%s">%s</label><select id="%s" data-f="%s">%s</select></div>' % (
        i, label, i, key, ''.join('<option value="%s">%s</option>' % (e(v), e(t)) for v, t in options))


NUM = ' inputmode="decimal"'


def tool(kind):
    inv = kind == 'invoice'
    word = 'invoice' if inv else 'receipt'
    business = ('<h3>Your business</h3>' + f('biz.name', 'Business name', 'text', 'Your business name', ' maxlength="100"') +
                '<div class="field"><label for="dg-logo">Logo (optional)</label><input type="file" id="dg-logo" accept="image/*">'
                '<p class="help" id="dg-logo-note">Optional. PNG, JPG, WebP or SVG.</p><button type="button" class="btn" id="dg-logo-clear" hidden style="margin-top:6px">Remove logo</button></div>' +
                f('biz.addr', 'Address', 'textarea', 'Street, city, country') +
                '<div class="row2">' + f('biz.phone', 'Phone', 'tel', '+234 803 123 4567', ' maxlength="40"') + f('biz.email', 'Email', 'email', 'you@example.com', ' maxlength="100"') + '</div>')
    customer = ('<h3>%s</h3>' % ('Customer' if inv else 'Customer (optional)') +
                '<div class="row2">' + f('cust.name', 'Customer name', 'text', 'Customer or company', ' maxlength="100"') + f('cust.contact', 'Phone or email', 'text', '', ' maxlength="100"') + '</div>')
    items = ('<h3>Items</h3><div class="dg-ihead" aria-hidden="true"><span>Description</span><span>Qty</span><span>Price</span><span></span></div>'
             '<div id="dg-items"></div><button type="button" class="btn" id="dg-add">Add an item</button>')
    money = ('<h3>Money</h3><div class="row2"><div class="field"><label for="dg-cur">Currency</label><select id="dg-cur" data-f="currency"></select></div>' +
             f('taxRate', 'Tax rate, %', 'text', '0', NUM + ' maxlength="6"') + '</div>'
             '<div class="row2">' + f('discount', 'Discount', 'text', '0', NUM + ' maxlength="14"') +
             sel('discType', 'Discount type', [('pct', 'Percent (%)'), ('fixed', 'Fixed amount')]) + '</div>' +
             f('paid', 'Amount paid so far' if inv else 'Amount received', 'text', '0' if inv else 'Leave empty if paid exactly', NUM + ' maxlength="14"'))
    if inv:
        details = ('<h3>Invoice details</h3><div class="dg-row3">' + f('no', 'Invoice number', 'text', 'INV-0001', ' maxlength="30"') +
                   f('date', 'Date', 'date') + f('due', 'Due date', 'date') + '</div>' +
                   f('notes', 'Payment details or note', 'textarea', 'Bank name, account name and account number'))
    else:
        details = ('<h3>Receipt details</h3><div class="dg-row3">' + f('no', 'Receipt number', 'text', 'RCT-0001', ' maxlength="30"') +
                   f('date', 'Date', 'date') + f('time', 'Time', 'time') + '</div>' +
                   sel('method', 'Paid by', [(m, m) for m in ('Cash', 'Bank transfer', 'POS', 'Card', 'Mobile money', 'Cheque', 'Other')]) +
                   f('notes', 'Note (optional)', 'textarea', 'For example: Goods sold cannot be returned after 7 days.'))
    more = ('<details class="opts"><summary>More options</summary>' +
            '<div class="row2">' + f('thanks', 'Closing line', 'text', '', ' maxlength="120"') + f('taxName', 'Tax name', 'text', 'VAT', ' maxlength="20"') + '</div>' +
            '<div class="row2">' + f('title', 'Title on the %s' % word, 'text', 'Invoice' if inv else 'Receipt', ' maxlength="40"') +
            '<div class="field"><label for="dg-accent">Main colour</label><div class="dg-inline"><input type="color" id="dg-accent" value="#1e3a8a">'
            '<button type="button" class="btn" id="dg-accent-reset">Use the design colour</button></div></div></div></details>')
    form = ('<div class="card dg-form" id="dg-form">' + business + customer + items + money + details + more +
            '<p class="dg-save">Your business details are saved in this browser only, so the next %s is filled in for you. '
            '<button type="button" class="dg-link" id="dg-forget">Forget my details</button></p></div>').replace('%s', word)
    pv = ('<div class="card preview dg-pv"><div class="dg-bar"><button type="button" class="btn" id="dg-prev" aria-label="Previous design">&lsaquo;</button>'
          '<select id="dg-tpl" aria-label="Design"></select><button type="button" class="btn" id="dg-next" aria-label="Next design">&rsaquo;</button>'
          '<button type="button" class="btn" id="dg-gallery-link">All designs</button></div>'
          '<div class="dg-stage" id="dg-stage"><div class="dg-sheet" id="dg-sheet"></div></div>'
          '<p class="help">Click any text on the %s to change it. Your changes go into the form too.</p>'
          '<div class="btns dg-actions"><button type="button" class="btn primary" id="dg-pdf">Download PDF</button>'
          '<button type="button" class="btn" id="dg-print">Print</button><button type="button" class="btn" id="dg-png">Download PNG</button>'
          '<button type="button" class="btn" id="dg-new">New %s</button></div>'
          '<p class="help" id="dg-status" role="status" aria-live="polite"></p></div>') % (word, word)
    chips = ('<div class="dg-filter" id="dg-filter" role="group" aria-label="Show designs"><button type="button" data-g="all" aria-pressed="true">All</button>'
             '<button type="button" data-g="everyday" aria-pressed="false">Everyday</button><button type="button" data-g="festive" aria-pressed="false">Festive</button></div>') if not inv else ''
    return ('<div class="dg" id="dg" data-kind="kind">'
            '<section class="dg-step" id="dg-gallery"><div class="dg-head"><span class="dg-n">1</span><h2>Choose a design</h2><p class="help" id="dg-count"></p></div>%s'
            '<div class="dg-gal" id="dg-gal"><noscript>This tool needs JavaScript to show the designs.</noscript></div></section>'
            '<section class="dg-step" id="dg-editor"><div class="dg-head"><span class="dg-n">2</span><h2>Add your details</h2><p class="help">Everything stays in your browser. Nothing is uploaded.</p></div>'
            '<div class="tool dg-tool">{form}{pv}</div></section></div>').replace('%s', chips, 1).replace('{form}', form).replace('{pv}', pv).replace('data-kind="kind"', 'data-kind="' + kind + '"')
