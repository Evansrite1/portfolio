import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _dg_common as c

INFO = dict(slug='receipt-generator', kicker='Business', tile_title='Receipt generator',
            tile_desc='25 receipt designs, from till roll to Christmas, Eid and Independence Day. PDF, PNG or print.', nav='Receipt generator')

SECTIONS = '''<section class="block prose"><h2>How to make a receipt</h2>
<ol>
<li>Pick a design. There are till roll designs for receipt printers, page designs, and festive ones for Christmas, New Year, Easter, Eid, Valentine's Day, Black Friday, Independence Day and Thanksgiving.</li>
<li>Add your business and the items. Enter the amount received and the change is worked out for you.</li>
<li>Click any text on the receipt to change it there.</li>
<li>Download the PDF or PNG, or print it.</li>
</ol></section>
<section class="block prose"><h2>What a receipt should include</h2>
<ul>
<li><b>Your business name, address and phone number.</b></li>
<li><b>A receipt number, the date and the time.</b></li>
<li><b>Each item</b> with the quantity and the price.</li>
<li><b>The total,</b> with any discount and tax shown.</li>
<li><b>How the customer paid,</b> the amount received and any change.</li>
</ul></section>
<section class="block prose"><h2>Till roll or page?</h2>
<p>The till roll designs are 80 mm wide, the usual receipt printer width. Press Print and choose your receipt printer, and print one test receipt first. The page designs are A5 wide, good for sending a PDF on WhatsApp or by email.</p>
<p>If the customer has not paid yet, send an invoice with the <a href="/tools/invoice-generator/">invoice generator</a>.</p></section>'''

PAGE = dict(
    title='Free Receipt Generator: 25 Designs, Festive and Till Roll',
    desc='Make a receipt in your browser. 25 designs including thermal till roll, Christmas, Eid and Independence Day. Tax, change and PDF or PNG download. Free.',
    h1='Free receipt generator', app='Free Receipt Generator',
    lead='Pick a design, add the items and download a receipt as a PDF or image, or print it. Your details stay in your browser.',
    tool=c.tool('receipt'), vendor=[], own=['docgen.js', 'receipttool.js'], module=[], css=['docgen.css'],
    sections=SECTIONS,
    faq=[
        ('Is this receipt generator free?', 'Yes. There is no sign-up, no watermark and no limit.'),
        ('Is my information uploaded?', 'No. The receipt is made in your browser. Your business details are saved in your own browser so they are filled in next time. Press Forget my details to delete them.'),
        ('Can I print on a thermal receipt printer?', 'Yes. Pick a till roll design, press Print and choose the printer. The page is 80 mm wide.'),
        ('How is the change worked out?', 'Enter the amount received. If it is more than the total, the receipt shows the change. If it is less, it shows the balance owing. Leave it empty if the customer paid the exact total.'),
        ('Are there festive designs?', 'Yes. Christmas, New Year, Easter, Eid, Valentine, Black Friday, Nigerian Independence Day and Thanksgiving or harvest.'),
        ('Which currencies can I use?', 'The naira is the default. You can also pick dollars, pounds, euros, cedis, Kenyan shillings, rand, CFA francs and more.'),
    ],
    related=['invoice-generator', 'currency-calculator', 'whatsapp-link-generator', 'pdf-converter', 'qr-code-generator'])
