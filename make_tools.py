"""Build the free tools pages: tools/index.html and one folder per tool.

Run from the Portfolio folder:  python make_tools.py
Pages: defined here (QR code, WiFi QR, WhatsApp QR, QR scanner, background remover) and in tools_new/*.py (one module per newer tool).
All tools run in the visitor's browser. Nothing is uploaded.
"""
import html, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_seo
sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = make_seo.SITE
e = lambda s: html.escape(s, quote=True)
WA = 'https://wa.me/2347035940200?text=Hi%20Evans%2C%20I%20found%20you%20through%20your%20free%20tools.%20I%20need%20help%20with%3A%20'
EMAIL = 'mailto:ademiluaolufemi2@gmail.com?subject=From%20your%20free%20tools'
LINKEDIN = 'https://www.linkedin.com/in/evansademilua/'

# Tools shown on the hub, in this order: slug, small label, tile title, tile text, short name for related links.
# Tools defined in tools_new/*.py add themselves to this list through their INFO dict.
CARDS = [
    ('qr-code-generator', 'QR codes', 'QR code generator', 'Links, text, WiFi, WhatsApp, email, phone, SMS, location and contact cards. Add a logo and colors.', 'QR code'),
    ('remove-background', 'Images', 'Background remover', 'Remove the background from any image. Exact for logos, AI cutout for photos. Transparent PNG.', 'Background remover'),
    ('video-compressor', 'Video', 'Video compressor', 'Shrink a big video, like 2 GB down to 500 MB. Trim it or cut it into two parts.', 'Video compressor'),
    ('qr-code-scanner', 'Scanner', 'QR code scanner', 'Read a code from a photo, a screenshot or your camera. Nothing is uploaded.', 'QR scanner'),
    ('wifi-qr-code-generator', 'WiFi', 'WiFi QR code generator', 'Let guests join your network with one scan. Print a clean sign for your wall.', 'WiFi QR'),
]
NAMES = {c[0]: c[4] for c in CARDS}

# ------------------------------------------------------------------ shared markup
def header(current=None):
    fab = ('<a href="/#embedded" class="nav-fab" aria-label="Embedded systems, coming soon" title="Embedded systems, coming soon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.6"/><path d="M9.5 3v4M14.5 3v4M9.5 17v4M14.5 17v4M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/></svg></a>')
    site = '<a href="/#work">Recent builds</a><a href="/cv.html">CV</a><a href="/tools/" aria-current="page">Tools</a>' + fab
    return ('<a class="skip" href="#main">Skip to the tool</a>\n<header class="th"><div class="wrap top">'
            '<a class="brand" href="/" title="Evans Ademilua, portfolio"><img src="/favicon-32.png" width="30" height="30" alt=""><span>Evans Ademilua</span></a>'
            '<nav aria-label="Site">%s</nav>'
            '<a class="cta" href="/#book" title="Book a call with Evans"><span class="cta-long">Book a call with Evans</span><span class="cta-short">Book a call</span></a></div></header>' % site)

ICO = {
 'chat': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>',
 'mail': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
 'in': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>',
 'dl': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16"/></svg>',
}

FOOTER = '''<footer>
<section class="contact" id="contact" aria-labelledby="contact-h">
  <div class="wrap">
    <div>
      <h2 id="contact-h">Contact me</h2>
      <p>Need a website, a web app, a booking system or a custom tool like these built for your business? I build them. Tell me what you need and I will reply fast.</p>
      <div class="by"><img src="/favicon-192.png" width="38" height="38" alt="Evans Ademilua"><span>Built by <a href="/">Evans Ademilua</a>, full stack developer and CEO of Large Technologies, Lagos, Nigeria.</span></div>
    </div>
    <div class="btns">
      <a class="btn primary" href="%s" target="_blank" rel="noopener">%s WhatsApp me</a>
      <a class="btn" href="%s">%s Email me</a>
      <a class="btn" href="%s" target="_blank" rel="noopener">%s LinkedIn</a>
      <a class="btn" href="/">See my portfolio</a>
    </div>
  </div>
</section>
<div class="legal"><div class="wrap"><span>&copy; Evans Ademilua. These tools are free to use. Your data stays in your browser.</span><span><a href="/">Portfolio</a> &nbsp;|&nbsp; <a href="/tools/">All tools</a> &nbsp;|&nbsp; <a href="/cv.html">CV</a></span></div></div>
</footer>
<div id="print-sheet" aria-hidden="true"></div>''' % (WA, ICO['chat'], EMAIL, ICO['mail'], LINKEDIN, ICO['in'])

def head(title, desc, path, nodes, js_vendor, js_own, image=None):
    og_image = image or SITE + '/tools/og-tools.jpg'
    tags = make_seo.seo_tags(path, title, desc, nodes, image=og_image)
    return '''<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s</title>
<meta name="description" content="%s">
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
%s<link rel="stylesheet" href="/tools/tools.css">
</head>
<body>
''' % (e(title), e(desc), tags)

def scripts(vendor, own, module=()):
    s = ''.join('<script src="/tools/vendor/%s" defer></script>\n' % v for v in vendor)
    s += ''.join('<script src="/tools/%s" defer></script>\n' % o for o in own)
    s += ''.join('<script type="module" src="/tools/%s"></script>\n' % m for m in module)
    return s

# ------------------------------------------------------------------ tool panels
def field(id_, label, kind='text', ph='', extra='', help_=''):
    h = '<p class="help">%s</p>' % help_ if help_ else ''
    if kind == 'textarea':
        return '<div class="field"><label for="%s">%s</label><textarea id="%s" placeholder="%s"%s></textarea>%s</div>' % (id_, label, id_, e(ph), extra, h)
    return '<div class="field"><label for="%s">%s</label><input type="%s" id="%s" placeholder="%s" autocomplete="off"%s>%s</div>' % (id_, label, kind, id_, e(ph), extra, h)

PANELS = {
 'url': ('Link', '<div data-panel="url">' + field('f-url', 'Website or link', 'url', 'https://example.com', ' inputmode="url"', 'We add https:// if you leave it out.') + '</div>'),
 'text': ('Text', '<div data-panel="text">' + field('f-text', 'Your text', 'textarea', 'Type any text, a note, a code or a message') + '</div>'),
 'email': ('Email', '<div data-panel="email">' + field('f-email-to', 'Email address', 'email', 'name@example.com') +
          field('f-email-subject', 'Subject (optional)', 'text', 'Hello') + field('f-email-body', 'Message (optional)', 'textarea', 'Write a short message') + '</div>'),
 'phone': ('Phone', '<div data-panel="phone">' + field('f-phone', 'Phone number', 'tel', '+234 701 234 5678', ' inputmode="tel"', 'Include the country code so it works from anywhere.') + '</div>'),
 'sms': ('SMS', '<div data-panel="sms">' + field('f-sms-number', 'Phone number', 'tel', '+234 701 234 5678', ' inputmode="tel"') + field('f-sms-text', 'Message (optional)', 'textarea', 'Text that is already typed when they scan') + '</div>'),
 'whatsapp': ('WhatsApp', '<div data-panel="whatsapp">' + field('f-wa-number', 'WhatsApp number with country code', 'tel', '2347012345678', ' inputmode="tel"', 'Digits only, no plus sign and no leading 0. Nigeria is 234, the US is 1, the UK is 44.') +
             '<p class="help" id="wa-hint" style="color:var(--accent)"></p>' + field('f-wa-text', 'Pre-filled message (optional)', 'textarea', 'Hello, I would like to place an order') + '</div>'),
 'wifi': ('WiFi', '<div data-panel="wifi">' + field('f-wifi-ssid', 'Network name (SSID)', 'text', 'My Home WiFi') +
         '<div class="field"><label for="f-wifi-enc">Security</label><select id="f-wifi-enc"><option value="WPA">WPA, WPA2 or WPA3 (most networks)</option><option value="WEP">WEP (old routers)</option><option value="nopass">No password (open network)</option></select></div>' +
         '<div id="wifi-pass-row">' + field('f-wifi-pass', 'Password', 'password', 'Your WiFi password') + '<label class="check"><input type="checkbox" id="f-wifi-show"> Show password</label></div>' +
         '<label class="check"><input type="checkbox" id="f-wifi-hidden"> This is a hidden network</label></div>'),
 'vcard': ('Contact card', '<div data-panel="vcard"><div class="row2">' + field('f-vc-first', 'First name', 'text', 'Evans') + field('f-vc-last', 'Last name', 'text', 'Ademilua') + '</div>' +
          '<div class="row2">' + field('f-vc-org', 'Company', 'text', 'Large Technologies') + field('f-vc-title', 'Job title', 'text', 'Full stack developer') + '</div>' +
          '<div class="row2">' + field('f-vc-phone', 'Phone', 'tel', '+234 701 234 5678') + field('f-vc-email', 'Email', 'email', 'name@example.com') + '</div>' +
          field('f-vc-web', 'Website', 'url', 'https://example.com') + '<div class="row2">' + field('f-vc-street', 'Street', 'text', '') + field('f-vc-city', 'City', 'text', 'Lagos') + '</div>' +
          field('f-vc-country', 'Country', 'text', 'Nigeria') + field('f-vc-note', 'Note (optional)', 'text', '') + '<p class="help">Fewer fields make a simpler code that scans faster.</p></div>'),
 'geo': ('Location', '<div data-panel="geo"><div class="row2">' + field('f-geo-lat', 'Latitude', 'text', '6.5244', ' inputmode="decimal"') + field('f-geo-lng', 'Longitude', 'text', '3.3792', ' inputmode="decimal"') + '</div><p class="help">Find coordinates by right-clicking a place in Google Maps.</p></div>'),
}

def qr_tool(types, default):
    tabs = ''
    if len(types) > 1:
        tabs = '<div class="tabs" role="tablist" aria-label="What should the QR code contain?">' + ''.join(
            '<button type="button" role="tab" data-type="%s" aria-selected="%s">%s</button>' % (t, 'true' if t == default else 'false', PANELS[t][0]) for t in types) + '</div>'
    panels = ''.join(PANELS[t][1] for t in types)
    design = '''<details class="opts" open>
  <summary>Customize the design</summary>
  <div class="row2">
    <div class="field"><label for="o-fg">Code color</label><input type="color" id="o-fg" value="#000000"></div>
    <div class="field"><label for="o-bg">Background</label><input type="color" id="o-bg" value="#ffffff"></div>
  </div>
  <label class="check"><input type="checkbox" id="o-transparent"> Transparent background</label>
  <div class="row2">
    <div class="field"><label for="o-shape">Shape</label><select id="o-shape"><option value="square">Square</option><option value="rounded">Rounded</option><option value="dots">Dots</option></select></div>
    <div class="field"><label for="o-ec">Error correction</label><select id="o-ec"><option value="L">Low (7%)</option><option value="M" selected>Medium (15%)</option><option value="Q">Quartile (25%)</option><option value="H">High (30%)</option></select></div>
  </div>
  <div class="row2">
    <div class="field"><label for="o-margin">Quiet zone (modules)</label><input type="number" id="o-margin" value="4" min="0" max="10"></div>
    <div class="field"><label for="o-size">Download size (pixels)</label><select id="o-size"><option value="512">512</option><option value="1024" selected>1024</option><option value="2048">2048</option><option value="4096">4096</option></select></div>
  </div>
  <div class="field"><label for="o-logo">Logo in the middle (optional)</label><input type="file" id="o-logo" accept="image/*">
    <label class="check" style="margin-top:10px"><input type="checkbox" id="o-logo-rm" checked> Remove the logo background automatically</label>
    <p class="help" id="logo-status" role="status" hidden></p>
    <p class="help" id="logo-note" hidden>Any image works. The background is removed, the logo is trimmed and fitted to the center, and error correction is set to High so the code still scans.</p>
    <button type="button" class="btn" id="logo-clear" hidden style="margin-top:8px">Remove logo</button></div>
</details>'''
    wa_link = ('<div id="wa-link-box" hidden><label>Your WhatsApp link</label><p class="linkbox" id="wa-link">The link appears here</p>'
               '<button type="button" class="btn" id="btn-copy-link" data-needs-code>Copy link</button></div>') if 'whatsapp' in types else ''
    return '''<div class="tool" id="qr-tool" data-types="%s" data-default="%s">
  <div class="card">
    %s
    %s
    %s
    %s
  </div>
  <div class="card preview" aria-live="polite">
    <div class="qr-box" id="qr-preview"><div class="qr-empty">Fill in the details to see your QR code</div></div>
    <p class="warn" id="qr-warn"></p><p class="warn" id="qr-msg"></p>
    <p class="qr-data" id="qr-data"></p>
    <div class="btns">
      <button type="button" class="btn primary" id="btn-png" data-needs-code disabled>%s Download PNG</button>
      <button type="button" class="btn" id="btn-svg" data-needs-code disabled>SVG</button>
      <button type="button" class="btn" id="btn-copy" data-needs-code disabled>Copy</button>
      <button type="button" class="btn" id="btn-print" data-needs-code disabled>Print</button>
      <button type="button" class="btn" id="btn-vcf" hidden>Save .vcf</button>
    </div>
  </div>
</div>''' % (','.join(types), default, tabs, panels, wa_link, design, ICO['dl'])

BARCODE_TOOL = '''<div class="tool" id="bc-tool" data-default="CODE128">
  <div class="card">
    <div class="field"><label for="bc-format">Barcode type</label><select id="bc-format"></select><p class="help" id="bc-hint"></p></div>
    <div class="field"><label for="bc-value">Value</label><input type="text" id="bc-value" autocomplete="off" spellcheck="false"><p class="help"><button type="button" class="btn" id="bc-example" style="padding:6px 12px;font-size:.78rem">Use an example</button></p></div>
    <details class="opts" open>
      <summary>Customize the design</summary>
      <div class="row2">
        <div class="field"><label for="bc-width">Bar width</label><select id="bc-width"><option value="1">Thin</option><option value="2" selected>Normal</option><option value="3">Wide</option><option value="4">Extra wide</option></select></div>
        <div class="field"><label for="bc-height">Height (pixels)</label><input type="number" id="bc-height" value="100" min="30" max="400"></div>
      </div>
      <label class="check"><input type="checkbox" id="bc-text" checked> Show the number under the bars</label>
      <div class="row2">
        <div class="field"><label for="bc-font">Number size</label><input type="number" id="bc-font" value="18" min="8" max="48"></div>
        <div class="field"><label for="bc-margin">Margin (pixels)</label><input type="number" id="bc-margin" value="10" min="0" max="60"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="bc-fg">Bar color</label><input type="color" id="bc-fg" value="#000000"></div>
        <div class="field"><label for="bc-bg">Background</label><input type="color" id="bc-bg" value="#ffffff"></div>
      </div>
      <label class="check"><input type="checkbox" id="bc-transparent"> Transparent background</label>
    </details>
  </div>
  <div class="card preview" aria-live="polite">
    <div class="bc-box" id="bc-preview"><svg id="bc-svg" aria-label="Barcode"></svg><div class="qr-empty" id="bc-empty" hidden>Enter a value to see your barcode</div></div>
    <p class="warn" id="bc-msg"></p>
    <div class="btns">
      <button type="button" class="btn primary" id="bc-png" data-needs-code disabled>%s Download PNG</button>
      <button type="button" class="btn" id="bc-svgdl" data-needs-code disabled>SVG</button>
      <button type="button" class="btn" id="bc-copy" data-needs-code disabled>Copy</button>
      <button type="button" class="btn" id="bc-print" data-needs-code disabled>Print</button>
    </div>
  </div>
</div>''' % ICO['dl']

SCAN_TOOL = '''<div class="tool" id="scan-tool">
  <div class="card">
    <div class="scan-drop" id="scan-drop">
      <p style="margin:0 0 12px"><b>Drop an image here</b>, paste a screenshot, or choose a file</p>
      <input type="file" id="scan-file" accept="image/*">
      <p class="help">PNG, JPG, WebP or a screenshot. The image is read in your browser and never uploaded.</p>
    </div>
    <p style="text-align:center;color:var(--faint);margin:14px 0">or</p>
    <div class="btns" style="margin:0;justify-content:center">
      <button type="button" class="btn primary" id="scan-start">Scan with your camera</button>
      <button type="button" class="btn" id="scan-stop" hidden>Stop the camera</button>
    </div>
    <div id="scan-cam-box" hidden style="margin-top:14px"><video id="scan-video" class="scan-video" muted playsinline></video></div>
    <p class="help" id="scan-msg" role="status" style="text-align:center;margin-top:12px"></p>
  </div>
  <div class="card preview" aria-live="polite">
    <b>Result</b>
    <p class="help" style="margin-top:6px">What the code contains appears here.</p>
    <div class="result" id="scan-result" hidden>
      <span class="kind" id="scan-kind">QR code</span>
      <code id="scan-text"></code>
      <p class="warn" id="scan-warn" hidden style="margin:0 0 12px">Check the address carefully before you open it. Scams hide behind QR codes.</p>
      <div class="btns" style="margin:0"><a class="btn primary" id="scan-open" href="#" target="_blank" rel="noopener noreferrer nofollow" hidden>Open link</a><button type="button" class="btn" id="scan-copy">Copy</button></div>
    </div>
    <div id="scan-preview-box" hidden><img id="scan-preview" class="thumb" alt="The image you chose"></div>
  </div>
</div>'''

BG_TOOL = '''<div class="tool" id="bg-tool">
  <div class="card">
    <div class="scan-drop" id="bg-drop">
      <p style="margin:0 0 12px"><b>Drop an image here</b>, paste it, or choose a file</p>
      <input type="file" id="bg-file" accept="image/*">
      <p class="help">PNG, JPG or WebP. It is processed in your browser and never uploaded.</p>
    </div>
    <div id="bg-controls" hidden>
      <div class="field" style="margin-top:18px"><label for="bg-mode">Method</label><select id="bg-mode"><option value="auto">Automatic (recommended)</option><option value="color">Plain background (exact)</option><option value="ai">Photo (AI cutout)</option></select></div>
      <div id="bg-adv-color" hidden><div class="field"><label for="bg-tol">Sensitivity</label><input type="range" id="bg-tol" min="10" max="110" value="38"><p class="help">Raise it if some background is left. Lower it if the edge of your subject is being eaten away.</p></div></div>
      <div id="bg-adv-ai" hidden><div class="field"><label for="bg-th">Edge position</label><input type="range" id="bg-th" min="20" max="80" value="50"></div><div class="field"><label for="bg-soft">Edge softness</label><input type="range" id="bg-soft" min="0" max="4" value="1"></div></div>
      <div class="row2"><div class="field"><label for="bg-out">Download with</label><select id="bg-out"><option value="transparent">Transparent background</option><option value="color">A solid color</option></select></div><div class="field"><label for="bg-color">Color</label><input type="color" id="bg-color" value="#ffffff" hidden></div></div>
    </div>
    <p class="help" id="bg-status" role="status"></p>
  </div>
  <div class="card preview" aria-live="polite">
    <div id="bg-view" hidden><div class="tabs"><button type="button" id="bg-view-result" aria-pressed="true">Result</button><button type="button" id="bg-view-orig" aria-pressed="false">Original</button></div></div>
    <div class="bg-box empty" id="bg-box"><canvas id="bg-canvas"></canvas><div class="qr-empty">Your image appears here</div></div>
    <div class="btns">
      <button type="button" class="btn primary" id="bg-png" data-needs-result disabled>%s Download PNG</button>
      <button type="button" class="btn" id="bg-jpg" data-needs-result disabled>JPG</button>
      <button type="button" class="btn" id="bg-copy" data-needs-result disabled>Copy</button>
      <button type="button" class="btn" id="bg-reset" data-needs-result disabled>Clear</button>
    </div>
  </div>
</div>''' % ICO['dl']

# ------------------------------------------------------------------ page content
def faq_html(items):
    return '<section class="block prose faq"><h2>Frequently asked questions</h2>' + ''.join('<details><summary>%s</summary><p>%s</p></details>' % (e(q), a) for q, a in items) + '</section>'

def related_html(slugs):
    return '<section class="block prose"><h2>More free tools</h2><ul class="related">' + ''.join('<li><a href="/tools/%s/">%s</a></li>' % (s, e(NAMES[s])) for s in slugs if s in NAMES) + '<li><a href="/tools/">All tools</a></li></ul></section>'

PAGES = {}

PAGES['qr-code-generator'] = dict(
    title='Free QR Code Generator: No Sign-Up, Never Expires',
    desc='Create a free QR code for a link, text, WiFi, WhatsApp, email, phone, SMS, location or contact card. Add your logo, choose colors, download PNG or SVG. No sign-up, no expiry.',
    h1='Free QR code generator', app='Free QR Code Generator',
    lead='Make a QR code for a link, text, WiFi, WhatsApp, email, phone number, SMS, location or contact card. Choose your colors and shape, add your logo, then download a sharp PNG or SVG. No sign-up, no watermark and no expiry.',
    pills=['No sign-up', 'No watermark', 'Never expires', 'Runs in your browser'],
    tool=qr_tool(['url', 'text', 'email', 'phone', 'sms', 'whatsapp', 'wifi', 'vcard', 'geo'], 'url'), vendor=['qrcode.js'], own=['bgremove.js', 'qr.js'],
    sections='''
<section class="block prose"><h2>How to create a QR code</h2>
<ol>
<li><b>Choose what the code should do.</b> Pick a link, text, email, phone number, SMS, WhatsApp chat, WiFi network, contact card or map location.</li>
<li><b>Type or paste your details.</b> The QR code updates as you type, so you can see it straight away.</li>
<li><b>Customize it.</b> Change the colors and the shape, set the error correction level, or add your logo in the middle.</li>
<li><b>Download and test.</b> Save a PNG for screens and documents or an SVG for printing, then scan it with your phone before you share it.</li>
</ol></section>
<section class="block prose"><h2>What you can put in a QR code</h2>
<ul>
<li><b>Link or website.</b> Send people to a page, a menu, a form or a profile.</li>
<li><b>Text.</b> Show a message, a code or a short note.</li>
<li><b>Email.</b> Open a new email with the address, subject and message already filled in.</li>
<li><b>Phone and SMS.</b> Start a call or a text with one scan.</li>
<li><b>WhatsApp.</b> Open a chat with your number. See the <a href="/tools/whatsapp-link-generator/">WhatsApp QR code generator</a>.</li>
<li><b>WiFi.</b> Let guests join your network without typing a password. See the <a href="/tools/wifi-qr-code-generator/">WiFi QR code generator</a>.</li>
<li><b>Contact card.</b> Save your details to their contacts. Pick the Contact card type above.</li>
<li><b>Location.</b> Open a point on the map from its coordinates.</li>
</ul></section>
<section class="block prose"><h2>Tips for a QR code that scans every time</h2>
<ul>
<li><b>Keep strong contrast.</b> Dark code on a light background scans best. Avoid light code on a dark background.</li>
<li><b>Leave the quiet zone.</b> The empty border around the code should stay at 4 modules wide. Do not crop it.</li>
<li><b>Print it big enough.</b> Aim for at least 2 by 2 cm (about 0.8 inch). As a rule, the scanning distance can be about ten times the width of the code.</li>
<li><b>Keep the content short.</b> Shorter links make simpler codes that scan faster and from further away.</li>
<li><b>Use High error correction with a logo.</b> It lets the code survive the logo covering part of the middle. This tool sets it for you, removes the logo background and fits it to the center automatically.</li>
<li><b>Always test.</b> Scan the finished code with an iPhone and an Android phone before you print a thousand flyers.</li>
</ul></section>
<section class="block prose"><h2>Free, private and permanent</h2>
<p>These are static QR codes. The information is stored in the pattern itself, so the code keeps working for as long as the link or the information inside it does. There is no account, no tracking redirect and no subscription behind it. Everything is created in your browser, so what you type is never sent to a server.</p></section>''',
    faq=[
        ('Is this QR code generator really free?', 'Yes. There is no sign-up, no watermark, no limit on how many codes you make and no payment for downloads.'),
        ('Do these QR codes expire?', 'No. The data is stored inside the code, so it never expires. A code that points to a website keeps working as long as that website address does.'),
        ('What is the difference between static and dynamic QR codes?', 'A static code holds the information directly and cannot be edited later. A dynamic code points to a short link on a service that can change where it goes and count scans, and those services usually need a paid account. This tool makes static codes.'),
        ('What size should I print a QR code?', 'At least 2 by 2 cm (about 0.8 inch). For posters and signs, make it larger so people can scan from a distance. Use the SVG download for large prints because it stays sharp at any size.'),
        ('Which error correction level should I choose?', 'Medium is fine for most uses. High lets a code still scan when up to 30% is damaged or covered, which is why it is used when you add a logo. Higher levels make the pattern denser.'),
        ('Can I add my logo to the QR code?', 'Yes. Choose a logo image in the design options. Keep it small and test the result with your phone. The tool raises error correction to High automatically.'),
        ('Should I download PNG or SVG?', 'Use PNG for websites, documents and social media. Use SVG for printing, because it is a vector file that scales to any size without blur.'),
        ('Is my data private?', 'Yes. The code is generated in your browser. Nothing you type is uploaded or stored by this site.'),
        ('Can I track how many people scan my code?', 'Not with a static code. If you need scan counts, point the code to a link that you control, add tracking parameters to it, and read the results in your analytics tool.'),
    ],
    related=['remove-background', 'barcode-generator', 'wifi-qr-code-generator', 'whatsapp-link-generator', 'vcard-qr-code-generator', 'qr-code-scanner'])

PAGES['wifi-qr-code-generator'] = dict(
    title='WiFi QR Code Generator: Share Your Password With a Scan',
    desc='Create a WiFi QR code so guests join your network by scanning, with no typing. Print it or download PNG and SVG. Free, private, runs in your browser.',
    h1='WiFi QR code generator', app='WiFi QR Code Generator',
    lead='Let guests join your WiFi by scanning a code instead of typing a long password. Enter your network name and password, then print the code or download it. Your password never leaves your browser.',
    pills=['No sign-up', 'Print ready', 'Password stays in your browser', 'Works on iPhone and Android'],
    tool=qr_tool(['wifi'], 'wifi'), vendor=['qrcode.js'], own=['bgremove.js', 'qr.js'],
    sections='''
<section class="block prose"><h2>How to make a WiFi QR code</h2>
<ol>
<li><b>Enter your network name</b> exactly as it appears on your devices, including capital letters.</li>
<li><b>Choose the security type.</b> WPA covers WPA, WPA2 and WPA3 networks, which is almost every router today.</li>
<li><b>Type the password.</b> Use the Show password box to check it.</li>
<li><b>Print or download the code</b> and put it where guests can see it.</li>
</ol></section>
<section class="block prose"><h2>How guests scan it</h2>
<p><b>iPhone and iPad:</b> open the Camera app, point it at the code and tap the banner that appears. <b>Android:</b> open the camera or Google Lens, point it at the code and tap to join. Most recent phones need no extra app.</p></section>
<section class="block prose"><h2>Where to put it</h2>
<p>Cafes, restaurants, offices, waiting rooms, rental apartments, guest rooms and event venues. Frame the printed code near the entrance or on the table.</p>
<p>Remember that anyone who can scan the code can join the network, so treat it like the password itself. If you share a guest network, give guests that one rather than your main network.</p></section>''',
    faq=[
        ('Is it safe to make a WiFi QR code here?', 'Yes. The code is created in your browser and your network name and password are not uploaded or stored by this site.'),
        ('Which security type should I choose?', 'Choose WPA for WPA, WPA2 and WPA3 networks. Choose WEP only for very old routers. Choose No password for open networks.'),
        ('Why does the code not connect?', 'Check that the network name matches exactly, including capitals and spaces, and that the password is correct. If the network is hidden, tick the hidden network box.'),
        ('Does the QR code stop working if I change the password?', 'Yes. The password is stored inside the code. If you change it, make a new code and replace the printed one.'),
        ('Can I print the WiFi code?', 'Yes. Use the Print button for a clean page with just the code and the network name, or download the SVG for large prints.'),
    ],
    related=['qr-code-generator', 'whatsapp-link-generator', 'vcard-qr-code-generator', 'qr-code-scanner', 'barcode-generator'])

PAGES['qr-code-scanner'] = dict(
    title='QR Code Scanner Online: Scan From Image or Camera',
    desc='Scan a QR code online from a photo, a screenshot or your camera. Free, no app to install, and nothing is uploaded. Also reads many barcodes in supported browsers.',
    h1='QR code scanner', app='QR Code Scanner',
    lead='Scan a QR code from a photo or a screenshot, or use your camera. Everything runs in your browser, so the image and the result never leave your device. No app to install.',
    pills=['No sign-up', 'No app needed', 'Nothing is uploaded', 'Image or camera'],
    tool=SCAN_TOOL, vendor=['jsQR.js'], own=['scanner.js'],
    sections='''
<section class="block prose"><h2>How to scan a QR code online</h2>
<ol>
<li><b>Choose a source.</b> Drop or paste an image of the code, pick a file, or press the camera button.</li>
<li><b>Hold it steady.</b> With the camera, fill the frame with the code and keep it in good light.</li>
<li><b>Read the result.</b> The content appears on the page. Copy it, or open it if it is a link.</li>
</ol></section>
<section class="block prose"><h2>Check links before you open them</h2>
<p>A QR code can hide any address. Criminals stick fake codes over real ones on parking meters, posters and menus. Read the address in the result and make sure it is the site you expect before you open it. Never enter passwords or card details on a page you reached from a code you do not trust.</p></section>
<section class="block prose"><h2>If it will not scan</h2>
<ul>
<li>Make sure the whole code is in the picture, including the empty border.</li>
<li>Use a sharper, larger image and crop in on the code.</li>
<li>Reduce glare and shadows, and hold the camera parallel to the code.</li>
<li>Try a different photo. Very small or blurry codes cannot be read.</li>
</ul></section>''',
    faq=[
        ('Is this QR code scanner free?', 'Yes. It is free with no sign-up and no app to install.'),
        ('Are my images uploaded?', 'No. The image is read in your browser and nothing is sent to a server.'),
        ('Which codes can it read?', 'It reads QR codes in every modern browser. In browsers that support the barcode detection feature, such as Chrome on Android and desktop, it also reads many barcode types.'),
        ('Why does the camera not start?', 'The browser needs your permission, and the page must be opened over a secure connection. Allow camera access in your browser settings, or upload an image instead.'),
        ('Is it safe to open a link from a QR code?', 'Only if you trust where it came from. Read the address first. This tool never opens a link for you.'),
    ],
    related=['qr-code-generator', 'barcode-generator', 'wifi-qr-code-generator', 'whatsapp-link-generator', 'vcard-qr-code-generator'])


PAGES['remove-background'] = dict(
    title='Free Background Remover: Remove Image Background Online',
    desc='Remove the background from any image online, free. Plain backgrounds are removed exactly and photos get an AI cutout. Download a transparent PNG. No sign-up, nothing uploaded.',
    h1='Free background remover', app='Free Background Remover',
    lead='Remove the background from any image in seconds. Logos and graphics on a plain background are cleaned exactly, and photos get an AI cutout. Download a transparent PNG or place your subject on a solid color. Nothing is uploaded.',
    pills=['No sign-up', 'No watermark', 'Transparent PNG', 'Runs in your browser'],
    tool=BG_TOOL, vendor=[], own=['bgremove.js', 'bgtool.js'],
    sections='''
<section class="block prose"><h2>How to remove a background</h2>
<ol>
<li><b>Add your image.</b> Drop it on the box, paste it, or choose a file.</li>
<li><b>Wait a moment.</b> The tool picks the best method for your picture and shows the result on a checkerboard so you can see what is transparent.</li>
<li><b>Fine tune.</b> Use the sliders if some background is left or the edge needs to be softer or tighter.</li>
<li><b>Download.</b> Save a transparent PNG, a JPG on a solid color, or copy the image.</li>
</ol></section>
<section class="block prose"><h2>Which method does it use?</h2>
<ul>
<li><b>Plain background (exact).</b> For logos, icons, signatures and graphics on a white or single-color background. The background color is removed from the edges inward, so the result is clean and instant, and nothing needs to download.</li>
<li><b>Photo (AI cutout).</b> For people, products and animals. An open-source AI model finds the main subject. The first time you use it, the engine (about 15 MB) downloads once and is then kept by your browser.</li>
<li><b>Automatic.</b> Looks at the edges of your image and chooses between the two for you. Images that are already transparent are left alone.</li>
</ul></section>
<section class="block prose"><h2>Tips for a clean cutout</h2>
<ul>
<li>Use a sharp image where the subject stands out from the background.</li>
<li>For photos with several objects, crop in on the one you want. The AI model keeps the most prominent objects it finds.</li>
<li>For fine hair or fur, soften the edge a little and check the result on a dark and a light background.</li>
<li>Logos work best as a high-resolution image on a plain background.</li>
</ul></section>
<section class="block prose"><h2>Put your logo in a QR code</h2>
<p>The <a href="/tools/qr-code-generator/">QR code generator</a> uses the same engine. Upload any logo there and the background is removed automatically before it is placed in the middle of the code.</p></section>''',
    faq=[
        ('Is this background remover free?', 'Yes. There is no sign-up, no watermark and no limit on how many images you process.'),
        ('Is my image uploaded to a server?', 'No. The image is processed in your browser, so it never leaves your device.'),
        ('Why is the first photo slower?', 'The AI engine, about 15 MB, downloads the first time you cut out a photo. After that your browser keeps it, so later photos are fast. Images on a plain background need no download at all.'),
        ('Why did it keep other objects in my photo?', 'The model finds the most prominent objects in a picture, not just one. Crop the image around the subject you want and try again.'),
        ('Which file formats work?', 'You can add PNG, JPG and WebP images. Downloads are a transparent PNG or a JPG on a solid color.'),
        ('Does it work for logos?', 'Yes, and it works best for them. Logos on a plain background are cleaned exactly, without the AI model.'),
        ('Which model does the AI cutout use?', 'The open-source U2-Net model, in its small version, running through ONNX Runtime Web in your browser.'),
    ],
    related=['qr-code-generator', 'barcode-generator', 'wifi-qr-code-generator', 'qr-code-scanner', 'whatsapp-link-generator'])

# ------------------------------------------------------------------ build pages
def schema_nodes(slug, p):
    url = '%s/tools/%s/' % (SITE, slug)
    app = {'@type': 'WebApplication', '@id': url + '#app', 'name': p['app'], 'url': url, 'description': p['desc'],
           'applicationCategory': 'UtilitiesApplication', 'operatingSystem': 'Any', 'browserRequirements': 'Requires JavaScript',
           'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'}, 'creator': {'@id': SITE + '/#person'}, 'isAccessibleForFree': True}
    faq = {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': html.unescape(__import__('re').sub(r'<[^>]+>', '', a))}} for q, a in p['faq']]}
    crumbs = {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE + '/'},
        {'@type': 'ListItem', 'position': 2, 'name': 'Free tools', 'item': SITE + '/tools/'},
        {'@type': 'ListItem', 'position': 3, 'name': p['app'], 'item': url}]}
    return [app, faq, crumbs]

def build_page(slug, p):
    h = head(p['title'], p['desc'], '/tools/%s/' % slug, schema_nodes(slug, p), p['vendor'], p['own'])
    body = header() + '''
<main id="main">
<div class="wrap">
<section class="hero-t center">
  <h1>%s</h1>
  <p class="lead">%s</p>
</section>
%s
%s
%s
%s
</div>
</main>
%s
%s''' % (e(p['h1']), e(p['lead']), p['tool'], p['sections'],
         faq_html(p['faq']), related_html(p['related']), FOOTER, scripts(p['vendor'], p['own'], p.get('module', ())))
    extra = ''.join('<link rel="stylesheet" href="/tools/css/%s">\n' % c for c in p.get('css', ()))
    out = (h + body).replace('</head>', extra + '</head>', 1) + '</body>\n</html>\n'
    d = os.path.join(ROOT, 'tools', slug)
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'index.html'), 'w', encoding='utf-8', newline='\n').write(out)
    return out

HUB = dict(
    title='Free Online Tools: Video, PDF, Image, Audio and QR Code Tools',
    desc='Free online tools by Evans Ademilua: video compressor, video trimmer, screen recorder, audio editor, PDF tools, image tools, QR codes, invoice generator and more. Free, and your files stay in your browser.',
    app='Free Online Tools',
    faq=[
        ('Are these tools really free?', 'Yes. They are built so you can get real work done without paying or creating an account.'),
        ('Is my data private?', 'Yes. Everything runs in your browser. The videos, images, PDFs and audio you open are not sent to a server.'),
        ('Why do some tools take a few minutes?', 'Your own computer does the work, so a large video takes longer than a small image. Chrome or Edge on a computer works best.'),
        ('Who made these tools?', 'Evans Ademilua, a full stack developer and the CEO of Large Technologies in Lagos, Nigeria. If you need a website, an app or a custom tool built for your business, use the Book a call button at the top of this page.'),
    ])

def load_new_tools():
    """Import every module in tools_new/. Each has INFO (hub card) and PAGE (the page)."""
    import importlib
    d = os.path.join(ROOT, 'tools_new')
    if not os.path.isdir(d):
        return
    sys.path.insert(0, d)
    mods = sorted(f[:-3] for f in os.listdir(d) if f.endswith('.py') and not f.startswith('_'))
    for m in mods:
        try:
            mod = importlib.import_module(m)
            i = mod.INFO
            mod.PAGE
        except Exception as ex:
            print('SKIPPED tools_new/%s.py: %s' % (m, ex))
            continue
        card = (i['slug'], i['kicker'], i['tile_title'], i['tile_desc'], i['nav'])
        if i['slug'] not in NAMES:
            CARDS.insert(i.get('pos', len(CARDS)), card)
            NAMES[i['slug']] = i['nav']
        PAGES[i['slug']] = mod.PAGE

# Short "how to use" steps for the detailed view of the tools page. Tools without an entry use their page lead.
HOWTO = {
    'qr-code-generator': ['Pick what the code should open: a link, WiFi, WhatsApp, a contact and more.', 'Type the details, then add a logo and colours if you like.', 'Download the code as PNG or SVG and print or share it.'],
    'remove-background': ['Add a photo or a logo.', 'Wait a moment while the background is removed on your device.', 'Download the cut-out as a transparent PNG.'],
    'video-compressor': ['Add a video.', 'Pick a target size or quality, and trim it if you want.', 'Download the smaller video.'],
    'qr-code-scanner': ['Open a photo or screenshot of a code, or use your camera.', 'The result appears at once.', 'Copy it or open the link.'],
    'wifi-qr-code-generator': ['Type your network name and password.', 'Pick a style for the sign.', 'Download it and put it on the wall so guests can scan and join.'],
    'second-screen-presenter': ['Open the presenter and connect a TV or projector set to extend.', 'Add songs, Bible passages, photos, videos and countdowns to your service.', 'Click a song or double-click anything else to show it on the screen.'],
    'audio-mastering': ['Open the studio and drop in audio files, or add a MIDI track.', 'Edit, mix and add plugins, or repair noise in the spectral view.', 'Pick a loudness target in Mastering and export WAV or MP3.'],
    'invoice-generator': ['Pick an invoice design from the gallery.', 'Fill in your business, your customer and the items.', 'Check the live preview, then download the PDF.'],
    'receipt-generator': ['Pick a receipt design, including festive ones.', 'Fill in your business and what was paid for.', 'Download or print the receipt.'],
    'pdf-converter': ['Choose To PDF, From PDF or Edit PDF.', 'Add your files with the plus button.', 'Press the main button and download the result.'],
    'whatsapp-link-generator': ['Pick your country and type your number.', 'Choose a ready message or write your own.', 'Copy the link or download the QR code.'],
    'video-converter': ['Add a video or an audio file.', 'Pick the format you want, such as MP4, MP3 or a video from your song.', 'Download the converted file.'],
}

VIEW_SCRIPT = """<script>
(function () {
  var root = document.getElementById('tl'), grid = document.getElementById('tl-grid'), q = document.getElementById('tl-q'), cats = document.getElementById('tl-cats'), none = document.getElementById('tl-none'), cat = 'all';
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setView(v) {
    if (['tiles', 'list', 'detail'].indexOf(v) < 0) v = 'tiles';
    grid.className = 'tl-grid tl-' + v;
    [].forEach.call(root.querySelectorAll('[data-view]'), function (b) { b.setAttribute('aria-pressed', b.dataset.view === v); });
    save('tools_view', v);
  }
  function filter() {
    var t = q.value.trim().toLowerCase(), shown = 0;
    [].forEach.call(grid.children, function (c) {
      var ok = (cat === 'all' || c.dataset.k === cat) && (!t || c.dataset.q.indexOf(t) >= 0);
      c.hidden = !ok; if (ok) shown++;
    });
    none.hidden = shown > 0;
  }
  root.addEventListener('click', function (e) {
    var v = e.target.closest('[data-view]'); if (v) { setView(v.dataset.view); return; }
    var c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; [].forEach.call(cats.children, function (x) { x.setAttribute('aria-pressed', x === c); }); filter(); }
  });
  q.addEventListener('input', filter);
  setView(load('tools_view') || 'tiles');
})();
</script>"""

def build_hub():
    cats = []
    for s, k, t, d, n in CARDS:
        if k not in cats:
            cats.append(k)
    def card(s, k, t, d):
        how = HOWTO.get(s)
        if not how and s in PAGES:
            how = [PAGES[s].get('lead', '')]
        steps = ''.join('<li>%s</li>' % e(x) for x in (how or []))
        return ('<a class="tile" href="/tools/%s/" data-k="%s" data-q="%s"><i>%s</i><b>%s</b><span>%s</span>'
                '<span class="tl-how"><em>How to use</em><ol>%s</ol><u>Open the tool</u></span></a>') % (
            s, e(k), e((t + ' ' + d + ' ' + k).lower()), e(k), e(t), e(d), steps)
    tiles = ''.join(card(s, k, t, d) for s, k, t, d, n in CARDS)
    bar = ('<div class="tl-bar">'
           '<input type="search" id="tl-q" placeholder="Search the tools" aria-label="Search the tools">'
           '<div class="tl-views" role="group" aria-label="View">'
           '<button type="button" data-view="tiles" aria-pressed="true">Tiles</button>'
           '<button type="button" data-view="list" aria-pressed="false">List</button>'
           '<button type="button" data-view="detail" aria-pressed="false">Detailed</button></div></div>'
           '<div class="tl-cats" id="tl-cats" role="group" aria-label="Category"><button type="button" data-cat="all" aria-pressed="true">All</button>%s</div>') % ''.join(
        '<button type="button" data-cat="%s" aria-pressed="false">%s</button>' % (e(c), e(c)) for c in cats)
    url = SITE + '/tools/'
    nodes = [
        {'@type': 'CollectionPage', '@id': url + '#page', 'url': url, 'name': HUB['title'], 'description': HUB['desc'], 'isPartOf': {'@id': SITE + '/#website'}, 'author': {'@id': SITE + '/#person'}},
        {'@type': 'ItemList', 'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'name': t, 'url': '%s/tools/%s/' % (SITE, s)} for i, (s, k, t, d, n) in enumerate(CARDS)]},
        {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in HUB['faq']]},
        {'@type': 'BreadcrumbList', 'itemListElement': [{'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE + '/'}, {'@type': 'ListItem', 'position': 2, 'name': 'Free tools', 'item': url}]},
    ]
    h = head(HUB['title'], HUB['desc'], '/tools/', nodes, [], [])
    body = header() + '''
<main id="main">
<div class="wrap">
<section class="hero-t center">
  <h1>Free tools that work for you</h1>
  <p class="lead">I built these so you can get real work done for free, as much as possible. Shrink a video, cut out a background, make a QR code or send an invoice, right here in your browser.</p>
</section>
<section class="block" id="tl">%s<div class="tl-grid tl-tiles" id="tl-grid">%s</div><p class="help" id="tl-none" hidden>No tool matches that. Try another word.</p></section>
<div class="narrow">%s</div>
</div>
</main>
%s
%s''' % (bar, tiles, faq_html(HUB['faq']), VIEW_SCRIPT, FOOTER)
    d = os.path.join(ROOT, 'tools')
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'index.html'), 'w', encoding='utf-8', newline='\n').write(h + body + '\n</body>\n</html>\n')

def update_seo_lists():
    pages = [p for p in make_seo.PUBLIC_PAGES if not p[0].startswith('/tools/')]
    i = [p[0] for p in pages].index('/cv.html') + 1
    tool_pages = [('/tools/', '0.9')] + [('/tools/%s/' % c[0], '0.9' if c[0] in ('qr-code-generator', 'remove-background', 'video-compressor') else '0.8') for c in CARDS]
    make_seo.PUBLIC_PAGES = pages[:i] + tool_pages + pages[i:]
    lines = ['- [Free online tools]({site}/tools/): video, audio, PDF, image and QR code tools that run in the browser']
    lines += ['- [%s]({site}/tools/%s/): %s' % (c[2], c[0], c[3]) for c in CARDS]
    old_start = make_seo.LLMS.index('- [Free online tools]')
    old_end = make_seo.LLMS.index('- [Solutions]')
    make_seo.LLMS = make_seo.LLMS[:old_start] + '\n'.join(lines) + '\n' + make_seo.LLMS[old_end:]
    make_seo.write_static()

if __name__ == '__main__':
    load_new_tools()
    for slug, p in PAGES.items():
        out = build_page(slug, p)
        assert chr(0x2014) not in out, 'em dash in ' + slug
    build_hub()
    update_seo_lists()
    print('built', len(PAGES), 'tool pages and the hub')
