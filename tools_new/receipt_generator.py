import _dg_common as c

INFO = dict(slug='receipt-generator', kicker='Business', tile_title='Receipt generator',
            tile_desc='Make a sales receipt for a till roll (80 mm) or an A5 or A4 page. PDF, print or WhatsApp.', nav='Receipt generator')

customer = c.group('Customer (optional)',
    c.f('dg-cl-name', 'Customer name', 'text', 'Walk-in customer', ' maxlength="100"') +
    c.f('dg-cl-email', 'Phone or email', 'text', '', ' maxlength="100"'))

details = c.group('Receipt details',
    '<div class="row2">' + c.f('dg-no', 'Receipt number', 'text', '', ' maxlength="30"') + c.sel('dg-cur', 'Currency', []) + '</div>'
    '<label class="check"><input type="checkbox" id="dg-curcode"> Show the currency code (for example NGN) instead of the symbol</label>'
    '<div class="row3"><div class="field"><label for="dg-issue">Date</label><input type="date" id="dg-issue"></div>'
    '<div class="field"><label for="dg-time">Time</label><input type="time" id="dg-time"></div>'
    + c.f('dg-cashier', 'Cashier', 'text', 'Name', ' maxlength="40"') + '</div>'
    '<div class="row2">' + c.sel('dg-method', 'Payment method', [('Cash', 'Cash'), ('Bank transfer', 'Bank transfer'), ('Card', 'Card'), ('POS', 'POS'), ('Other', 'Other')])
    + '<div id="dg-method-other-box" hidden>' + c.f('dg-method-other', 'Describe the method', 'text', 'Mobile money', ' maxlength="30"') + '</div></div>')

closing = c.group('Thank-you note',
    c.f('dg-thanks', 'Message at the bottom', 'text', 'Thank you for your purchase.', ' maxlength="140"') +
    c.f('dg-notes', 'Extra note (optional, A5 and A4 only)', 'textarea', 'For example: Goods once sold cannot be returned.'))

TOOL = ('<div class="tool dg-tool" id="dg-tool" data-kind="receipt">\n<div class="card">'
        + c.business() + customer + details + c.items('receipt') + c.money_adjust('receipt') + closing + c.design('receipt') + c.remember()
        + '</div>\n<div class="card preview" aria-live="polite">' + c.preview() + '</div>\n</div>')

SECTIONS = '''<section class="block prose"><h2>What a receipt should include</h2>
<p>A receipt is proof that a customer paid. Keep it short and complete:</p>
<ul>
<li><b>Your business name, address and phone number,</b> and your tax ID if you are registered.</li>
<li><b>A receipt number,</b> the date and the time. Numbers that count up make your records easy to check.</li>
<li><b>Each item,</b> with the quantity and the price.</li>
<li><b>The subtotal, any discount, any tax and the total.</b></li>
<li><b>How the customer paid:</b> cash, transfer, card or POS.</li>
<li><b>The amount received and the change given,</b> if they paid more than the total.</li>
<li><b>A thank-you line</b> and, if you want, your return policy.</li>
</ul></section>
<section class="block prose"><h2>Thermal receipt or A5 and A4?</h2>
<p>The thermal layout is 80 mm wide, the common till-roll width, and as long as it needs to be. Choose it when you hand over a printed slip from a receipt printer. The A5 and A4 layouts are normal pages, good for emailing a PDF, keeping records, or printing on a regular printer. They use the same Clean, Bold and Minimal templates as the invoice generator.</p>
<p>To print on a receipt printer, press Print and choose the printer. The page size is set to the receipt width, but the result depends on the printer driver, so print one test slip first.</p></section>
<section class="block prose"><h2>Receipt or invoice?</h2>
<p>Give a receipt after the customer has paid. Send an invoice before payment, to ask for it. If a customer still owes money, use the <a href="/tools/invoice-generator/">invoice generator</a>. If part of the payment is outstanding, enter the amount received and the receipt shows the balance owing.</p></section>
<section class="block prose"><h2>How the totals are worked out</h2>
<p>Each line is quantity times price, rounded to the smallest unit of the currency. The subtotal is the sum of the lines. A percent or fixed discount is taken off the subtotal, then the tax rate is applied to the discounted amount. The change is the amount received minus the total.</p></section>'''

PAGE = dict(
    title='Free Receipt Generator: Thermal 80mm and A5 PDF Receipts',
    desc='Make a sales receipt in your browser. Thermal 80 mm or A5 and A4, with items, tax, payment method and change. Download a PDF or print. Free, nothing uploaded.',
    h1='Free receipt generator', app='Free Receipt Generator',
    lead='Enter the items, choose how the customer paid and get a clean receipt. Print it on a 80 mm till roll or download an A5 or A4 PDF. It runs in your browser, so nothing you type is uploaded.',
    tool=TOOL, vendor=[], own=['docgen.js', 'receipttool.js'], module=[], css=['docgen.css'],
    sections=SECTIONS,
    faq=[
        ('Is this receipt generator free?', 'Yes. There is no sign-up, no watermark and no limit on how many receipts you make.'),
        ('Is my data uploaded?', 'No. The receipt is built in your browser. If you tick Remember my business details, they are saved in your own browser on this device only, and unticking the box deletes them.'),
        ('Can I print on a thermal receipt printer?', 'Yes. Choose the thermal layout, press Print and pick your receipt printer. The page is set to 80 mm wide. How it prints depends on the printer driver, so test with one receipt first.'),
        ('Does the receipt work with Naira and other currencies?', 'Yes. Choose any currency from the list. The PDF has an embedded font, so signs such as the Naira sign and the Cedi sign print correctly.'),
        ('How is the change calculated?', 'Enter the amount received. If it is more than the total, the receipt shows the difference as change. If it is less, the receipt shows the balance owing. If you leave it empty, the customer is treated as having paid the exact total.'),
        ('Is the PDF text selectable?', 'Yes. The PDF is built with real text and an embedded font, not a screenshot.'),
        ('Can I send the receipt on WhatsApp?', 'Yes. Download the PDF and attach it to the chat, or press Copy WhatsApp text to copy a short summary of the items and total.'),
    ],
    related=['invoice-generator', 'currency-calculator', 'whatsapp-link-generator', 'image-to-pdf', 'qr-code-generator', 'merge-pdf'])
