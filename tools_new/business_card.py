INFO = dict(slug='business-card', kicker='Business', tile_title='Digital business card',
            tile_desc='Design your own business card with your photo, logo and colours. Download it as a picture or PDF, save it as a phone contact, add a QR code, or share a link.', nav='Digital business card')


def f(k, label, ph='', wide=False, typ='text'):
    return '<div class="field%s"><label for="bc-%s">%s</label><input type="%s" id="bc-%s" placeholder="%s" autocomplete="off" maxlength="120"></div>' % (' wide' if wide else '', k, label, typ, k, ph)


def seg(id_, label, opts):
    return ('<span class="gm-label">%s</span><div class="seg-row" id="%s" role="group" aria-label="%s">%s</div>' %
            (label, id_, label, ''.join('<button type="button" class="chip" data-v="%s" aria-pressed="false">%s</button>' % (v, t) for v, t in opts)))


TOOL = ('<div id="bc"><div class="bc-viewbar" id="bc-viewbar" hidden><h2 id="bc-viewtitle" style="margin:0 0 4px"></h2><p class="help">Shared with you. Save the contact to your phone.</p></div>'
        '<div class="tool"><div class="card" id="bc-edit"><h2 style="margin:0 0 10px;font-size:1.1rem">Your details</h2><div class="bc-fields">' +
        f('name', 'Name', 'Ada Okafor') + f('title', 'Job title', 'Founder and Designer') + f('company', 'Business', 'Bright Path Studio') + f('tagline', 'Tagline', 'What you do, in a few words') +
        f('phone', 'Phone', '+234 803 123 4567', typ='tel') + f('email', 'Email', 'you@example.com', typ='email') + f('website', 'Website', 'yourwebsite.com') + f('address', 'Address', 'Street, city, country') +
        f('instagram', 'Instagram', '@yourname') + f('linkedin', 'LinkedIn', 'yourname') + f('x', 'X (Twitter)', '@yourname') + f('facebook', 'Facebook', 'yourpage') + f('whatsapp', 'WhatsApp number', '+234...', typ='tel') + '</div>'
        '<h2 style="margin:16px 0 6px;font-size:1.1rem">Pictures</h2><div class="gm-row2"><div class="field"><label for="bc-photo">Your photo</label><input type="file" id="bc-photo" accept="image/*"><button type="button" class="chip" id="bc-rmphoto" style="margin-top:6px">Remove photo</button></div>'
        '<div class="field"><label for="bc-logo">Your logo</label><input type="file" id="bc-logo" accept="image/*"><button type="button" class="chip" id="bc-rmlogo" style="margin-top:6px">Remove logo</button></div></div>'
        '<h2 style="margin:16px 0 6px;font-size:1.1rem">Design</h2>' + seg('bc-tpls', 'Style', []) + seg('bc-orient', 'Shape', [('h', 'Wide'), ('v', 'Tall')]) +
        '<span class="gm-label">Colour sets</span><div class="seg-row" id="bc-presets"></div>'
        '<div class="gm-row2"><div><span class="gm-label">Main colour</span><input type="color" id="bc-c1c" aria-label="Main colour"></div><div><span class="gm-label">Second colour</span><input type="color" id="bc-c2c" aria-label="Second colour"></div>'
        '<div><span class="gm-label">Background</span><input type="color" id="bc-bgc" aria-label="Background colour"></div><div><span class="gm-label">Text colour</span><input type="color" id="bc-inkc" aria-label="Text colour"></div></div>' +
        seg('bc-font', 'Lettering', [('sans', 'Clean'), ('serif', 'Classic'), ('mono', 'Typewriter'), ('round', 'Friendly'), ('display', 'Bold')]) + seg('bc-shape', 'Photo shape', [('circle', 'Circle'), ('square', 'Square'), ('none', 'No photo')]) +
        '<label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="bc-qr"> Show a QR code on the back that saves your contact</label>'
        '<div class="btns" style="margin-top:8px"><button type="button" class="btn" id="bc-reset">Start again</button></div></div>'
        '<div class="card"><canvas id="bc-cv" width="1050" height="600"></canvas><div class="btns" style="justify-content:center;margin-top:12px"><button type="button" class="btn" id="bc-flip">Show the back</button></div>'
        '<div class="btns" style="justify-content:center;margin-top:10px"><button type="button" class="btn primary" id="bc-png">Download picture</button><button type="button" class="btn" id="bc-pdf">Download PDF</button><button type="button" class="btn" id="bc-vcf">Save as phone contact</button><button type="button" class="btn" id="bc-link">Copy share link</button></div>'
        '<div id="bc-actions"></div><p class="help" id="bc-status" role="status" style="text-align:center"></p></div></div></div>')

SECTIONS = '''<section class="block prose"><h2>Make a digital business card</h2>
<p>Fill in your name, job, business and contact details, add your photo and logo, and pick a style, colours and lettering. The card updates as you type. Turn it over to see the back, which can carry a QR code: when someone scans it with their phone camera, your contact is ready to save.</p>
<ul><li><b>Download picture:</b> a sharp image of the side you are looking at, ready to print or send.</li>
<li><b>Download PDF:</b> front and back at 3.5 by 2 inches, for a print shop.</li>
<li><b>Save as phone contact:</b> a .vcf file that adds you to anyone's contacts, with your photo.</li>
<li><b>Copy share link:</b> a link that opens your card as a small page with Call, Email, Website and Save contact buttons. It carries your text and colours, not your pictures.</li></ul>
<p>Everything is made in your browser. Nothing is uploaded, and your card is saved on this device so it is there next time.</p></section>'''

PAGE = dict(
    title='Digital Business Card Maker: Design, QR Code, PDF and Share Link',
    desc='Make a digital business card free: add your photo, logo and colours, pick a style, and download a picture or PDF, save a phone contact (.vcf), add a QR code or share a link.',
    h1='Digital business card', app='Digital Business Card Maker', lead='Design your own business card with your photo, logo and colours, then download it, save it as a contact, or share a link.',
    tool=TOOL, vendor=['qrcode.js', 'pdf-lib/pdf-lib.min.js'], own=['bizcard.js'], module=[], css=['games.css'], sections=SECTIONS,
    faq=[('Is it free?', 'Yes. There is no sign-up and no watermark.'), ('Can I add my photo and logo?', 'Yes. They are resized in your browser and are not uploaded.'),
         ('How do people save my contact?', 'They scan the QR code on the back with their phone camera, open the .vcf file you send, or open your share link and press Save contact.'),
         ('Can I print it?', 'Download the PDF, which has the front and back at 3.5 by 2 inches, and take it to a print shop.'), ('Why does the share link not include my photo?', 'A link has a limited length. Send the .vcf file when you want the photo to travel with your contact.')],
    related=['invoice-receipt-generator', 'qr-code-generator', 'color-picker', 'weather'])
