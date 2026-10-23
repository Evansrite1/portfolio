INFO = dict(slug='whatsapp-link-generator', kicker='WhatsApp', tile_title='WhatsApp link generator',
            tile_desc='Make a wa.me click-to-chat link with a ready message, plus a QR code. Copy as a link or button.', nav='WhatsApp link')

TOOL = '''<div class="tool" id="wa-tool">
  <div class="card">
    <div class="field"><label for="wa-country">Country</label><select id="wa-country"></select></div>
    <div class="field"><label for="wa-number">WhatsApp number</label><input type="tel" id="wa-number" inputmode="tel" autocomplete="off" placeholder="0703 594 0200 or +234 703 594 0200" aria-describedby="wa-error wa-note">
      <p class="wa-err" id="wa-error" role="alert"></p><p class="help" id="wa-note" aria-live="polite"></p>
      <p class="help">Type it the way you dial it. A leading 0 is removed and the country code is added for you. If you start with + or 00, the number is used as it is.</p></div>
    <div class="field"><label>Message templates</label>
      <div class="wa-chips" role="group" aria-label="Message templates">
        <button type="button" data-tpl="order" aria-pressed="false">Order</button><button type="button" data-tpl="booking" aria-pressed="false">Booking</button><button type="button" data-tpl="support" aria-pressed="false">Support</button><button type="button" data-tpl="quote" aria-pressed="false">Quote</button>
      </div>
      <label for="wa-msg">Message (optional)</label>
      <textarea id="wa-msg" placeholder="Hello, I would like to place an order" style="min-height:150px"></textarea>
      <p class="help">Replace the words in [square brackets] with your own. People can still edit the message before they send it.</p>
      <div class="btns" style="margin-top:8px"><button type="button" class="btn" id="wa-clear">Clear message</button></div>
    </div>
  </div>

  <div class="card preview">
    <label>Preview of what they see</label>
    <div class="wa-chat" aria-live="polite"><div class="wa-bubble empty" id="wa-bubble"></div></div>
    <div class="wa-link" id="wa-link" aria-live="polite">Enter a number to see your link</div>
    <p class="help" id="wa-len"></p>
    <div class="btns">
      <button type="button" class="btn primary" id="wa-copy" data-needs-link disabled>Copy link</button>
      <button type="button" class="btn" id="wa-open" data-needs-link disabled>Open to test</button>
      <button type="button" class="btn" id="wa-copy-html" data-needs-link disabled>Copy HTML button</button>
      <button type="button" class="btn" id="wa-copy-md" data-needs-link disabled>Copy Markdown</button>
    </div>
    <div class="wa-qr-wrap empty" id="wa-qr-wrap"><canvas id="wa-qr" width="480" height="480" role="img" aria-label="QR code of your WhatsApp link"></canvas></div>
    <div class="btns"><button type="button" class="btn" id="wa-png" data-needs-link disabled>Download QR code PNG</button></div>
    <span id="wa-live" hidden></span>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to make a WhatsApp link</h2>
<ol>
<li><b>Choose your country and type the number.</b> Type it as you normally dial it. The tool removes spaces, dashes, a leading 0 or 00 and a plus sign, and adds the country code.</li>
<li><b>Write the message (optional).</b> Pick a template for an order, booking, support request or quote, or write your own. The preview shows what the person will see in the chat box.</li>
<li><b>Copy the link.</b> Use Open to test to check it opens your chat, then paste the link into your bio, website, email signature or ad.</li>
<li><b>Use the QR code.</b> Download the PNG and put it on a flyer, receipt, shop window or menu so people can scan and start a chat.</li>
</ol></section>
<section class="block prose"><h2>What a wa.me link is</h2>
<p>A wa.me link looks like <code>https://wa.me/2347035940200?text=Hello</code>. The number is written with the country code and digits only, with no plus sign, no spaces and no leading 0. When someone taps it, WhatsApp opens a chat with that number and puts the text in the message box. They still have to press send.</p>
<p>The text is URL encoded, which means characters such as spaces, new lines, ampersands and accented letters are replaced with codes like %20 and %0A. This is what lets a long message with line breaks survive inside a link, and the tool does it for you.</p></section>
<section class="block prose"><h2>wa.me links and the WhatsApp Business API</h2>
<p>A wa.me link is a free shortcut that opens a chat in the WhatsApp or WhatsApp Business app. It does not need an account with Meta, an approval or a developer. The WhatsApp Business API is a separate paid service for companies that send messages from software, run several agents on one number or send approved template messages. A wa.me link can send people to a number that uses either one.</p></section>
<section class="block prose"><h2>Common uses</h2>
<ul>
<li>A Chat on WhatsApp button on a website, using the HTML snippet.</li>
<li>A link in an Instagram, TikTok or Facebook bio.</li>
<li>A QR code on packaging, a shop door, a menu or a business card.</li>
<li>A pre-filled order or booking message so customers send you the details you need.</li>
</ul></section>'''

PAGE = dict(
    title='WhatsApp Link Generator: Create a wa.me Chat Link Free',
    desc='Create a WhatsApp click-to-chat link with a ready message. Pick the country, add a template, copy the link, HTML button or Markdown, and download a QR code. Free, no sign-up.',
    h1='Free WhatsApp link generator', app='Free WhatsApp Link Generator',
    lead='Make a wa.me link that opens a WhatsApp chat with your number and a message already typed. Copy it as a link, an HTML button or Markdown, or download it as a QR code.',
    tool=TOOL, vendor=['qrcode.js'], own=['watool.js'], module=[], css=['whatsapp-link-generator.css'],
    sections=SECTIONS,
    faq=[
        ('How do I create a WhatsApp link?', 'Choose your country, type your number, add a message if you want one and copy the link. It has the form wa.me followed by your number with the country code.'),
        ('Do I put a plus sign or a zero in the number?', 'No. In a wa.me link the number has the country code and digits only. You can type it any way you like and the tool removes the plus sign, spaces, dashes and a leading 0 or 00.'),
        ('Why is my message full of percent signs in the link?', 'The message is URL encoded so spaces, line breaks, ampersands and non-English letters work inside a link. WhatsApp turns the codes back into your text.'),
        ('Is a wa.me link the same as the WhatsApp Business API?', 'No. A wa.me link just opens a chat in the app and needs no approval. The Business API is a separate paid service for sending messages from software.'),
        ('Can I make a QR code for my WhatsApp link?', 'Yes. The QR code on this page contains the same link. Download the PNG and print it. When someone scans it, WhatsApp opens your chat with the message ready.'),
        ('Does the link work on the desktop and on phones?', 'Yes. On a phone it opens the WhatsApp app. On a computer it opens WhatsApp Web or the desktop app if the person has it.'),
        ('Is my number sent to your server?', 'No. The link and QR code are made in your browser, and nothing is uploaded.')
    ],
    related=['qr-code-generator', 'whatsapp-qr-code-generator', 'qr-code-scanner', 'invoice-generator', 'currency-calculator'])
