import _dg_common as c

INFO = dict(slug='invoice-generator', kicker='Business', tile_title='Invoice generator',
            tile_desc='Make a clean invoice with your logo, VAT and bank details. Download a PDF or send it on WhatsApp.', nav='Invoice generator')

details = c.group('Invoice details',
    '<div class="row2"><div class="field"><label for="dg-no">Invoice number</label><div class="dg-inline"><input type="text" id="dg-no" maxlength="30" autocomplete="off"><button type="button" class="btn" id="dg-no-next" title="Use the next number">Next</button></div></div>'
    + c.sel('dg-cur', 'Currency', []) + '</div>'
    '<label class="check"><input type="checkbox" id="dg-curcode"> Show the currency code (for example NGN) instead of the symbol</label>'
    '<div class="row3"><div class="field"><label for="dg-issue">Issue date</label><input type="date" id="dg-issue"></div>'
    '<div class="field"><label for="dg-terms">Payment terms</label><select id="dg-terms"><option value="0">Due on receipt</option><option value="7">Net 7 days</option><option value="14">Net 14 days</option><option value="30">Net 30 days</option><option value="45">Net 45 days</option><option value="60">Net 60 days</option><option value="custom">Pick a due date</option></select></div>'
    '<div class="field"><label for="dg-due">Due date</label><input type="date" id="dg-due"></div></div>')

client = c.group('Bill to',
    c.f('dg-cl-name', 'Client name', 'text', 'Client or company name', ' maxlength="100"') +
    c.f('dg-cl-addr', 'Client address', 'textarea', 'Street, city, country') +
    c.f('dg-cl-email', 'Client email (optional)', 'email', 'client@example.com', ' maxlength="100"'))

payment = c.group('Notes and payment details',
    c.f('dg-notes', 'Notes or terms', 'textarea', 'For example: Thank you for your business. Late payments may attract a fee.') +
    '<div class="row2">' + c.f('dg-bank', 'Bank name', 'text', 'Your bank', ' maxlength="60"') + c.f('dg-acct-name', 'Account name', 'text', '', ' maxlength="80"') + '</div>' +
    '<div class="row2">' + c.f('dg-acct-no', 'Account number', 'text', '0123456789', ' maxlength="40" inputmode="numeric"') + c.f('dg-paylink', 'Payment link or note', 'text', 'Pay online: your payment link', ' maxlength="120"') + '</div>')

signature = c.group('Signature (optional)',
    c.sel('dg-sig-mode', 'Signature', [('none', 'No signature'), ('type', 'Type your name'), ('draw', 'Draw it')]) +
    '<div id="dg-sig-type-box" hidden>' + c.f('dg-sig-text', 'Your name as a signature', 'text', 'Your name', ' maxlength="60"') + '</div>'
    '<div id="dg-sig-draw-box" hidden><canvas class="dg-sig-canvas" id="dg-sig-canvas" width="600" height="180" aria-label="Draw your signature here with a mouse, finger or pen"></canvas>'
    '<button type="button" class="btn" id="dg-sig-clear" style="margin-top:8px">Clear signature</button></div>', open_=False)

TOOL = ('<div class="tool dg-tool" id="dg-tool" data-kind="invoice">\n<div class="card">'
        + c.business() + client + details + c.items('invoice') + c.money_adjust('invoice') + payment + signature + c.design('invoice') + c.remember()
        + '</div>\n<div class="card preview" aria-live="polite">' + c.preview() + '</div>\n</div>')

SECTIONS = '''<section class="block prose"><h2>What an invoice should include</h2>
<p>An invoice is a request for payment. A clear one gets paid faster and avoids arguments later. Include these things:</p>
<ul>
<li><b>The word Invoice and a unique invoice number.</b> Numbers that count up (INV-0001, INV-0002) make it easy for you and your client to find a document later.</li>
<li><b>The issue date and the due date.</b> Say exactly when payment is expected, not just "soon".</li>
<li><b>Your details and your client's details.</b> Business name, address, email and phone for both sides.</li>
<li><b>A tax ID or VAT number</b> if you are registered. Rules differ by country, so check what your local tax office requires.</li>
<li><b>Itemised lines.</b> A description, quantity and rate for each item, with the line total.</li>
<li><b>Discounts, tax and shipping</b> shown as separate lines, then the total.</li>
<li><b>How to pay.</b> Bank name, account name and account number, or a payment link.</li>
</ul></section>
<section class="block prose"><h2>How to get paid faster</h2>
<ul>
<li><b>Send it the same day the work is done,</b> while the client still remembers the value you gave.</li>
<li><b>Set short payment terms.</b> Due on receipt or net 7 days gets paid sooner than net 60.</li>
<li><b>Put the bank details on the invoice,</b> so nobody has to ask you for them.</li>
<li><b>Ask for a deposit</b> on bigger jobs and record it in the Amount paid field. The invoice then shows the balance still due.</li>
<li><b>Send it where the client reads messages.</b> Use Copy WhatsApp text for a short message with the totals and your bank details, and attach the PDF.</li>
<li><b>Follow up politely</b> the day after the due date, with the invoice attached again.</li>
</ul></section>
<section class="block prose"><h2>How the totals are worked out</h2>
<p>Each line is quantity times rate, rounded to the smallest unit of the currency (2 decimals for most currencies, 3 for the Kuwaiti dinar, 0 for the Japanese yen). The subtotal is the sum of the lines. A percent discount is taken off the subtotal, or a fixed discount is subtracted. A tax rate on a line applies to that line after its share of the discount. The overall tax rate, such as VAT, applies to the subtotal after the discount. Shipping is added last and is not taxed. Amount paid is then subtracted to give the balance due.</p>
<p>Nigeria's standard VAT rate has been 7.5% since 2020. Enter the rate that applies to you in the tax rate field, or leave it at 0 if you do not charge tax.</p></section>
<section class="block prose"><h2>Invoice, receipt or quotation?</h2>
<p>A quotation (or estimate) is a price offer sent before the work. An invoice asks for payment after or during the work. A receipt confirms that payment was made. If you only need proof of payment, use the <a href="/tools/receipt-generator/">receipt generator</a>.</p></section>'''

PAGE = dict(
    title='Free Invoice Generator: Make a PDF Invoice Online',
    desc='Make a professional invoice in your browser and download it as a PDF. Naira, dollars, euros and more, with VAT, discounts and bank details. Free, private.',
    h1='Free invoice generator', app='Free Invoice Generator',
    lead='Fill in the form and watch your invoice appear. Add your logo, VAT, discount and bank details, then download a PDF, print it or copy a WhatsApp message. It runs in your browser, so your details are never uploaded.',
    tool=TOOL, vendor=[], own=['docgen.js', 'invoicetool.js'], module=[], css=['docgen.css'],
    sections=SECTIONS,
    faq=[
        ('Is this invoice generator really free?', 'Yes. There is no sign-up, no watermark and no limit on how many invoices you make.'),
        ('Is my business and client information uploaded?', 'No. The invoice is built in your browser. Nothing you type is sent to a server. If you tick Remember my business details, they are saved in your own browser on this device only, and unticking the box deletes them.'),
        ('Can I use Naira, Cedis and other African currencies?', 'Yes. Pick from the currency list, which includes NGN, GHS, KES, ZAR, EGP and every other currency your browser knows, as well as USD, EUR, GBP, AED, KWD, CAD, AUD and INR. The PDF uses an embedded font, so the Naira and Cedi signs print correctly. If a currency symbol is unusual, tick the option to show the currency code instead.'),
        ('Can I add VAT or a discount?', 'Yes. Set an overall tax rate, such as VAT at 7.5%, or add a tax rate to individual lines. A discount can be a percent or a fixed amount. The totals update as you type.'),
        ('Is the PDF text selectable?', 'Yes. The PDF is built with real text and an embedded font, not a screenshot, so you can select, search and copy from it.'),
        ('How do I send the invoice on WhatsApp?', 'Download the PDF and attach it in the chat. You can also press Copy WhatsApp text to copy a short summary with the items, total and your bank details, then paste it into the message.'),
        ('Can I save my business details for next time?', 'Yes, if you tick Remember my business details. They are stored in your browser only. The next invoice number is suggested for you, counting up from the last one you downloaded.'),
    ],
    related=['receipt-generator', 'currency-calculator', 'whatsapp-link-generator', 'image-to-pdf', 'merge-pdf', 'qr-code-generator'])
