INFO = dict(slug='whatsapp-link-generator', kicker='WhatsApp', tile_title='WhatsApp link and QR code generator',
            tile_desc='Make a wa.me chat link with a ready message, a QR code and printable QR cards for your shop or table.', nav='WhatsApp link')

TOOL = '''<div class="tool" id="wa-tool">
  <div class="card">
    <div class="field wa-cc"><label id="wa-cc-label">1. Country</label>
      <button type="button" class="wa-cc-btn" id="wa-cc-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="wa-cc-label wa-cc-name"><span class="wa-flag" id="wa-cc-flag">NG</span><span id="wa-cc-name">Nigeria +234</span><span class="wa-caret" aria-hidden="true"></span></button>
      <div class="wa-cc-pop" id="wa-cc-pop" hidden>
        <input type="text" id="wa-cc-search" role="combobox" aria-expanded="true" aria-controls="wa-cc-list" aria-autocomplete="list" aria-label="Search country or dialling code" placeholder="Search country or code, for example Ghana or 233" autocomplete="off">
        <ul id="wa-cc-list" role="listbox" aria-label="Countries"></ul>
      </div>
    </div>
    <div class="field"><label for="wa-number">2. WhatsApp number</label>
      <input type="tel" id="wa-number" inputmode="tel" autocomplete="off" placeholder="0803 123 4567" aria-describedby="wa-error wa-note">
      <p class="wa-err" id="wa-error" role="alert"></p><p class="help" id="wa-note" aria-live="polite"></p>
      <p class="help">Type it the way you dial it. Spaces, dashes and a leading 0 are fine. The country code is added for you.</p></div>
    <div class="field"><label id="wa-tpl-label">3. Message</label>
      <div class="wa-chips" id="wa-tpls" role="group" aria-labelledby="wa-tpl-label"></div>
      <label for="wa-msg" class="wa-sub">Edit the message</label>
      <textarea id="wa-msg" style="min-height:140px"></textarea>
      <p class="help">Replace the words in [square brackets]. People can still change the message before they press send.</p>
    </div>
    <div class="field"><label for="wa-name">Business name for the QR cards (optional)</label>
      <input type="text" id="wa-name" maxlength="40" placeholder="For example Mama Ade Kitchen"></div>
  </div>

  <div class="card preview">
    <label>Your WhatsApp link</label>
    <div class="wa-link" id="wa-link" aria-live="polite">Type your number to see your link</div>
    <p class="help" id="wa-len"></p>
    <div class="btns">
      <button type="button" class="btn primary" id="wa-copy" data-needs-link disabled>Copy link</button>
      <button type="button" class="btn" id="wa-open" data-needs-link disabled>Open to test</button>
    </div>
    <div class="wa-out empty" id="wa-out"><canvas id="wa-qr" width="480" height="480" role="img" aria-label="QR code of your WhatsApp link"></canvas></div>
    <div class="btns">
      <button type="button" class="btn" id="wa-png" data-needs-link disabled>Download PNG</button>
      <button type="button" class="btn" id="wa-svg" data-needs-link disabled>Download SVG</button>
    </div>
  </div>

  <div class="card wa-wide">
    <label>Ready QR cards</label>
    <p class="help">Pick a style and download it as a PNG to print or share. The business name field above is used on the cards.</p>
    <div class="wa-styles" id="wa-styles"></div>
  </div>

  <div class="card wa-wide">
    <label for="wa-snippet">WhatsApp button for your website</label>
    <p class="help">Paste this HTML into your website where you want a green Chat with us on WhatsApp button.</p>
    <textarea id="wa-snippet" readonly style="min-height:90px;font-family:var(--mono);font-size:.78rem"></textarea>
    <div class="btns"><button type="button" class="btn" id="wa-copy-snippet" data-needs-link disabled>Copy HTML</button></div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to make a WhatsApp link and QR code</h2>
<ol>
<li><b>Pick your country.</b> Search by name or dialling code, for example Nigeria +234.</li>
<li><b>Type your number.</b> Type it as you dial it, for example 0803 123 4567. The tool removes the 0, spaces and dashes and adds the country code, so it becomes 2348031234567.</li>
<li><b>Pick a message.</b> Choose a template such as an order, price enquiry or booking and edit it, or write your own.</li>
<li><b>Copy, test and download.</b> Copy the link, press Open to test, and download the QR code as PNG or SVG, or one of the ready QR cards.</li>
</ol>
<p>Everything is made in your browser. Your number and message are not sent to any server.</p></section>
<section class="block prose"><h2>What a wa.me link is</h2>
<p>A wa.me link looks like <code>https://wa.me/2348031234567?text=Hello</code>. It has the country code and number with no plus sign, no spaces and no leading 0. When someone taps it or scans the QR code, WhatsApp opens a chat with you and puts the message in the box. They still press send.</p>
<p>It is free and needs no account with Meta. The WhatsApp Business API is a different paid service for sending messages from software.</p></section>
<section class="block prose"><h2>Where to use it</h2>
<ul>
<li>Shop windows, menus, tables and receipts, so customers can order or ask questions.</li>
<li>Business cards, flyers, posters and product packaging.</li>
<li>Instagram, TikTok and Facebook bios, and a button on your website.</li>
<li>Church, event and registration desks.</li>
</ul></section>
<section class="block prose"><h2>Common country codes</h2>
<p>Nigeria 234, Ghana 233, Kenya 254, South Africa 27, United Kingdom 44, United States and Canada 1, United Arab Emirates 971, Kuwait 965, Saudi Arabia 966, India 91. Remove the leading 0 from the local number before you add the code. The tool does this for you.</p></section>'''

PAGE = dict(
    title='WhatsApp Link and QR Code Generator: Free wa.me Chat Link',
    desc='Make a WhatsApp click-to-chat link and QR code with a ready message. Pick your country, type your number, choose a template, then copy the link or download the QR code as PNG or SVG. Free, no sign-up.',
    h1='WhatsApp link and QR code generator', app='WhatsApp Link and QR Code Generator',
    lead='Make a wa.me link and QR code that opens a WhatsApp chat with your number and a message already typed. Put it on flyers, menus, shop windows and your website so people can message you in one tap.',
    tool=TOOL, vendor=['qrcode.js'], own=['watool.js'], module=[], css=['whatsapp-link-generator.css'],
    sections=SECTIONS,
    faq=[
        ('How do I create a WhatsApp link?', 'Pick your country, type your number, choose a message and copy the link. It looks like wa.me followed by your number with the country code.'),
        ('Do I type the plus sign or the 0?', 'Type the number any way you like. The tool removes the plus sign, spaces, dashes and the leading 0, and adds the country code.'),
        ('Do I need WhatsApp Business?', 'No. The link and QR code work with a normal WhatsApp account and with WhatsApp Business.'),
        ('Can customers message me without saving my number?', 'Yes. Tapping the link or scanning the code opens a chat with you straight away.'),
        ('Will people see my phone number?', 'Yes. The chat opens with your number, so use a number you are happy to share.'),
        ('Why is my message full of percent signs in the link?', 'The message is encoded so spaces, new lines and symbols work inside a link. WhatsApp shows your normal text.'),
        ('Does the QR code expire?', 'No. It holds the link itself, so it works for as long as the number is on WhatsApp. If you change the message, download a new code.'),
        ('Is my number sent to your server?', 'No. The link, QR code and cards are made in your browser, and nothing is uploaded.'),
    ],
    related=['qr-code-generator', 'vcard-qr-code-generator', 'wifi-qr-code-generator', 'qr-code-scanner', 'invoice-generator'])
