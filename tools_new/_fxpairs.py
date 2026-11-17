"""One page for each popular currency pair, such as /tools/currency-calculator/usd-to-ngn/. They use the same calculator
(fxtool.js) with the pair already chosen, plus a quick table, the reverse pair and other pairs."""
import html

# code: (name, short name, where it is used)
CUR = {
    'USD': ('US dollar', 'dollar', 'the United States'),
    'EUR': ('Euro', 'euro', 'Germany, France, Italy, Spain and other euro countries'),
    'GBP': ('British pound', 'pound', 'the United Kingdom'),
    'NGN': ('Nigerian naira', 'naira', 'Nigeria'),
    'KES': ('Kenyan shilling', 'Kenyan shilling', 'Kenya'),
    'GHS': ('Ghanaian cedi', 'cedi', 'Ghana'),
    'ZAR': ('South African rand', 'rand', 'South Africa'),
    'AED': ('UAE dirham', 'dirham', 'the United Arab Emirates'),
    'KWD': ('Kuwaiti dinar', 'Kuwaiti dinar', 'Kuwait'),
    'SAR': ('Saudi riyal', 'riyal', 'Saudi Arabia'),
    'INR': ('Indian rupee', 'rupee', 'India'),
    'CAD': ('Canadian dollar', 'Canadian dollar', 'Canada'),
    'AUD': ('Australian dollar', 'Australian dollar', 'Australia'),
    'PHP': ('Philippine peso', 'peso', 'the Philippines'),
}
CODES = list(CUR)
AMOUNTS = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000]
e = lambda s: html.escape(s, quote=True)


def slug(a, b):
    return 'currency-calculator/%s-to-%s' % (a.lower(), b.lower())


def page(a, b, TOOL, SECTIONS):
    na, sa, ca = CUR[a]
    nb, sb, cb = CUR[b]
    tool = TOOL.replace('<div class="tool" id="fx-tool">', '<div class="tool" id="fx-tool" data-from="%s" data-to="%s" data-amount="1">' % (a, b), 1)
    others = [c for c in CODES if c not in (a, b)]
    links = ''.join('<li><a href="/tools/%s/">%s to %s</a></li>' % (slug(a, c), e(CUR[a][1]).title() if False else CUR[a][0], CUR[c][0]) for c in others[:6])
    links += ''.join('<li><a href="/tools/%s/">%s to %s</a></li>' % (slug(c, b), CUR[c][0], CUR[b][0]) for c in others[6:10])
    rows = ''.join('<tr><td class="num">%s %s</td><td class="num" data-amt="%d">...</td></tr>' % (f'{n:,}', a, n) for n in AMOUNTS)
    sections = (
        '<section class="block prose"><h2>How much is 1 %s in %s?</h2>'
        '<p id="fx-oneline" class="fx-oneline" role="status">Loading the rate...</p>'
        '<p>The calculator above uses the live mid-market rate between the %s (%s) and the %s (%s). Change the amount to convert any value. '
        'Press Swap to go the other way, to <a href="/tools/%s/">%s to %s</a>.</p></section>'
        '<section class="block prose"><h2>%s to %s conversion table</h2>'
        '<table class="fx-table" id="fx-quick"><thead><tr><th scope="col">%s</th><th scope="col">%s</th></tr></thead><tbody>%s</tbody></table>'
        '<p class="help">Reference rates, filled in when the page opens. Banks and exchange offices give a worse rate. Use the margin box in the calculator to estimate it.</p></section>'
        '<section class="block prose"><h2>About the %s and the %s</h2>'
        '<p>The <b>%s</b> (%s) is used in %s. The <b>%s</b> (%s) is used in %s.</p>'
        '<p>The two are traded on the international currency market, and this page shows the mid-market rate, the middle point between buying and selling prices. '
        'It is a good guide for pricing, planning a trip or checking a quote. It is not the rate a bank, a card or a transfer service will give you.</p></section>'
        '<section class="block prose"><h2>More currency pairs</h2><ul class="related">%s<li><a href="/tools/currency-calculator/">Currency calculator, all 160 currencies</a></li></ul></section>'
    ) % (a, nb, na, a, nb, b, slug(b, a), nb, na, a, b, a, b, rows, na.lower() if False else na, nb, na, a, ca, nb, b, cb, links)
    faq = [
        ('How much is 1 %s in %s?' % (na, nb), 'Open the calculator at the top of this page. It shows the live %s to %s rate and the time the rates were published, and updates as you change the amount.' % (a, b)),
        ('Is this the rate my bank will give me?', 'No. It is the mid-market reference rate. Banks, card companies and exchange offices add a margin or fee. Enter their margin in the calculator to estimate what you would really get.'),
        ('How do I convert %s to %s?' % (b, a), 'Press Swap in the calculator, or open the <a href="/tools/%s/">%s to %s page</a>.' % (slug(b, a), nb, na)),
        ('How often does the %s to %s rate change?' % (a, b), 'The rate service publishes new rates about once a day, and the page shows the exact time of the rates it uses. Press Refresh rates to download them again.'),
    ]
    return dict(
        title='%s to %s (%s to %s): Live Exchange Rate Converter' % (na, nb, a, b),
        desc='Convert %s (%s) to %s (%s) with a live mid-market rate, a conversion table and a bank margin option. Free, no sign-up.' % (na, a, nb, b),
        h1='%s to %s converter' % (na, nb), app='%s to %s Converter' % (na, nb),
        lead='Convert the %s (%s) to the %s (%s) with the live reference rate. The rate and the time it was published are shown under the result.' % (na, a, nb, b),
        tool=tool, vendor=[], own=['fxtool.js', 'fxpair.js'], module=[], css=['currency-calculator.css'],
        sections=sections, faq=faq, related=['invoice-receipt-generator', 'pdf-converter', 'qr-code-generator'])


def build(TOOL, SECTIONS):
    out = {}
    for a in CODES:
        for b in CODES:
            if a != b:
                out[slug(a, b)] = page(a, b, TOOL, SECTIONS)
    return out
