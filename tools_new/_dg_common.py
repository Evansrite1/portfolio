"""Shared form pieces for the invoice and receipt generators (not a tool page itself)."""
import html

e = lambda s: html.escape(s, quote=True)


def f(id_, label, kind='text', ph='', extra='', help_=''):
    h = '<p class="help">%s</p>' % help_ if help_ else ''
    if kind == 'textarea':
        return '<div class="field"><label for="%s">%s</label><textarea id="%s" placeholder="%s" maxlength="500" rows="3"%s></textarea>%s</div>' % (id_, label, id_, e(ph), extra, h)
    return '<div class="field"><label for="%s">%s</label><input type="%s" id="%s" placeholder="%s" autocomplete="off"%s>%s</div>' % (id_, label, kind, id_, e(ph), extra, h)


def sel(id_, label, options, help_=''):
    h = '<p class="help">%s</p>' % help_ if help_ else ''
    return '<div class="field"><label for="%s">%s</label><select id="%s">%s</select>%s</div>' % (
        id_, label, id_, ''.join('<option value="%s">%s</option>' % (v, t) for v, t in options), h)


def group(title, body, open_=True):
    return '<details class="opts"%s><summary>%s</summary>%s</details>' % (' open' if open_ else '', title, body)


SWATCHES = ['#2563eb', '#15803d', '#c8312b', '#1f2937', '#d97706', '#7c3aed', '#0f766e']


def design(kind):
    if kind == 'invoice':
        paper = sel('dg-paper', 'Paper size', [('a4', 'A4'), ('letter', 'US Letter')])
        tpl_help = ''
    else:
        paper = sel('dg-paper', 'Layout', [('thermal', 'Thermal receipt, 80 mm wide'), ('a5', 'A5 page'), ('a4', 'A4 page')])
        tpl_help = 'The template applies to the A5 and A4 layouts. The thermal layout has one plain style.'
    sw = ''.join('<button type="button" class="dg-sw" data-c="%s" style="background:%s" aria-label="Use colour %s"></button>' % (c, c, c) for c in SWATCHES)
    return group('Design', '<div class="row2">' + paper + sel('dg-tpl', 'Template', [('clean', 'Clean'), ('bold', 'Bold'), ('minimal', 'Minimal')], tpl_help) + '</div>'
                 '<div class="field"><label for="dg-accent">Accent colour</label><div class="dg-accent-row"><input type="color" id="dg-accent" value="#2563eb"><div class="dg-sws" style="margin-top:0">' + sw + '</div></div></div>')


def business():
    return group('Your business',
                 f('dg-biz-name', 'Business name', 'text', 'Your business name', ' maxlength="100"') +
                 f('dg-biz-addr', 'Address', 'textarea', 'Street, city, country') +
                 '<div class="row2">' + f('dg-biz-email', 'Email', 'email', 'you@example.com', ' maxlength="100"') + f('dg-biz-phone', 'Phone', 'tel', '+234 701 234 5678', ' maxlength="40"') + '</div>' +
                 f('dg-biz-tax', 'Tax ID or VAT number (optional)', 'text', '', ' maxlength="40"') +
                 '<div class="field"><label for="dg-logo">Logo (optional)</label><input type="file" id="dg-logo" accept="image/*"><p class="help" id="dg-logo-note">Optional. PNG, JPG, WebP or SVG. It stays in your browser.</p>'
                 '<button type="button" class="btn" id="dg-logo-clear" hidden style="margin-top:8px">Remove logo</button></div>')


def money_adjust(kind):
    ship = f('dg-ship', 'Shipping or delivery', 'number', '0.00', ' min="0" step="any" inputmode="decimal"') if kind == 'invoice' else ''
    paid_label = 'Amount paid so far' if kind == 'invoice' else 'Amount received'
    paid_help = 'Leave empty if nothing has been paid yet.' if kind == 'invoice' else 'Leave empty if the customer paid the exact total. The change is worked out for you.'
    return group('Discount, tax and payments',
                 '<div class="row2"><div class="field"><label for="dg-disc-type">Discount type</label><select id="dg-disc-type"><option value="pct">Percent (%)</option><option value="fixed">Fixed amount</option></select></div>'
                 + f('dg-disc', 'Discount', 'number', '0', ' min="0" step="any" inputmode="decimal"') + '</div>' +
                 '<div class="row2">' + f('dg-taxname', 'Tax name', 'text', 'VAT', ' maxlength="20"', 'For example VAT, GST or Sales tax.') +
                 f('dg-taxpct', 'Tax rate (%)', 'number', '0', ' min="0" max="100" step="any" inputmode="decimal"', 'Applied to the total after the discount.') + '</div>' +
                 ship + f('dg-paid', paid_label, 'number', '0.00', ' min="0" step="any" inputmode="decimal"', paid_help))


def items(kind):
    head = 'Items' if kind == 'receipt' else 'Line items'
    note = '' if kind == 'receipt' else '<p class="help">Tax % on a line is optional. It is added on top of that line, after any discount.</p>'
    return group(head, '<div id="dg-items"></div><button type="button" class="btn" id="dg-add" style="margin-top:4px">Add an item</button>' + note)


def remember():
    return ('<div class="dg-remember"><label class="check" style="margin-top:14px"><input type="checkbox" id="dg-remember"> Remember my business details in this browser</label>'
            '<p class="help" id="dg-remember-note">Optional. Saves your business details, payment details, currency and design on this device only. Untick to delete them.</p></div>')


def actions(pdf_label='Download PDF'):
    return ('<div class="btns dg-actions"><button type="button" class="btn primary" id="dg-pdf">%s</button>'
            '<button type="button" class="btn" id="dg-print">Print</button>'
            '<button type="button" class="btn" id="dg-wa">Copy WhatsApp text</button>'
            '<button type="button" class="btn" id="dg-reset">Reset</button></div>'
            '<p class="help" id="dg-status" role="status" aria-live="polite"></p>'
            '<div class="dg-errors" id="dg-errors" role="alert" hidden></div>'
            '<p class="dg-warn" id="dg-warn" role="status" hidden></p>'
            '<textarea class="dg-wa-box" id="dg-wa-box" readonly hidden aria-label="Text to copy"></textarea>') % pdf_label


def preview():
    return actions() + '<div class="dg-pages" id="dg-pages"><p class="help" style="text-align:center">Loading the preview...</p></div>'
