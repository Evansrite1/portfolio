import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _dg_common as c

INFO = dict(slug='invoice-generator', kicker='Business', tile_title='Invoice generator',
            tile_desc='Pick one of 10 invoice designs, add your logo and items, and download a PDF or image.', nav='Invoice generator')

SECTIONS = '''<section class="block prose"><h2>How to make an invoice</h2>
<ol>
<li>Pick a design from the gallery. You can switch to another design at any time and keep your details.</li>
<li>Add your business, your customer and the items. The totals, tax and balance are worked out for you.</li>
<li>Click any text on the invoice if you want to change it there.</li>
<li>Download the PDF, save it as an image, or print it.</li>
</ol></section>
<section class="block prose"><h2>What an invoice should include</h2>
<ul>
<li><b>An invoice number and the date.</b> Numbers that count up, like INV-0001 and INV-0002, keep your records tidy. The next number is suggested for you.</li>
<li><b>A due date,</b> so your customer knows when to pay.</li>
<li><b>Your details and your customer's details.</b></li>
<li><b>Each item</b> with the quantity, the price and the line total.</li>
<li><b>Discount and tax</b> as separate lines, then the total.</li>
<li><b>How to pay:</b> your bank name, account name and account number.</li>
</ul></section>
<section class="block prose"><h2>How the totals are worked out</h2>
<p>Each line is quantity times price. The subtotal is the sum of the lines. The discount, as a percent or a fixed amount, comes off the subtotal. Tax, such as VAT, is added on the amount after the discount. Anything already paid is taken off to give the balance due. Nigeria's standard VAT rate is 7.5%.</p>
<p>If you only need proof that someone has paid, use the <a href="/tools/receipt-generator/">receipt generator</a>.</p></section>'''

PAGE = dict(
    title='Free Invoice Generator: 10 Designs, PDF Download',
    desc='Make an invoice in your browser. Choose from 10 designs, add your logo, VAT and bank details, and download a PDF or PNG. Naira and other currencies. Free.',
    h1='Free invoice generator', app='Free Invoice Generator',
    lead='Pick a design, fill in a few details and download a clean PDF invoice. Your details stay in your browser.',
    tool=c.tool('invoice'), vendor=[], own=['docgen.js', 'invoicetool.js'], module=[], css=['docgen.css'],
    sections=SECTIONS,
    faq=[
        ('Is this invoice generator free?', 'Yes. There is no sign-up, no watermark and no limit.'),
        ('Is my information uploaded?', 'No. The invoice is made in your browser. Your business details are saved in your own browser so the next invoice is filled in for you. Press Forget my details to delete them.'),
        ('Can I use naira and other currencies?', 'Yes. The naira is the default. You can also pick US dollars, pounds, euros, Kenyan shillings, cedis, rand, CFA francs and more.'),
        ('Can I change the design after I fill it in?', 'Yes. Pick another design from the gallery or the list above the preview. Your details move to the new design.'),
        ('Can I edit the text on the invoice itself?', 'Yes. Click any text in the preview, such as your business name or an item, and type.'),
        ('Is the PDF text selectable?', 'Yes. The PDF is made with real text, not a screenshot, so you can search and copy from it.'),
        ('What happens if I have many items?', 'The invoice runs onto a second A4 page. Rows are never cut in half.'),
    ],
    related=['receipt-generator', 'currency-calculator', 'whatsapp-link-generator', 'pdf-converter', 'qr-code-generator'])
