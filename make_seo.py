"""Search and AI-search setup for evansademilua.vercel.app.

Run from the Portfolio folder:  python make_seo.py
It writes robots.txt, sitemap.xml, llms.txt and the IndexNow key file, and patches the case study
pages (canonical address, description, social preview, working navigation).

When you move to your own domain (for example evansademilua.com), change SITE below, re-run this
file, then regenerate the pages that import it. Everything else follows from that one line.
"""
import datetime, glob, html, json, os, re, secrets, sys
sys.stdout.reconfigure(encoding='utf-8')

SITE = 'https://evansademilua.vercel.app'
ROOT = os.path.dirname(os.path.abspath(__file__))
OG_IMAGE = SITE + '/images/og-image.jpg'

NAME = 'Evans Ademilua'
ALT_NAMES = ['Olufemi Ademilua', 'Olufemi Evans Ademilua', 'Evans Large']   # other names people search for
JOB = 'Full Stack Developer and Web Developer'
LINKEDIN = 'https://www.linkedin.com/in/evansademilua'
UPWORK = 'https://www.upwork.com/freelancers/~018567da5396e7b2fe'
SAME_AS = [LINKEDIN, UPWORK]
KNOWS = ['Full-stack web development', 'Web development', 'Web design', 'Video, PDF, image and QR code tools', 'Python', 'FastAPI', 'React', 'Next.js', 'TypeScript', 'PostgreSQL', 'Supabase',
         'Workflow automation', 'n8n', 'LLM and AI integration', 'Bubble.io', 'Client portals', 'Booking systems']
BIO = ('Evans Ademilua, also known as Olufemi Evans Ademilua and Evans Large, is a full stack developer and web developer '
       'and the CEO of Large Technologies in Lagos, Nigeria. He builds websites, web apps, booking systems, client portals, '
       'internal dashboards, workflow automation and AI features for businesses, and runs a set of free online tools including a QR code generator, a video compressor, PDF tools and image tools.')

e = lambda s: html.escape(s, quote=True)
TODAY = datetime.date.today().isoformat()


def graph(extra_nodes=None):
    person = {
        '@type': 'Person', '@id': SITE + '/#person', 'name': NAME, 'alternateName': ALT_NAMES,
        'url': SITE + '/', 'image': SITE + '/images/evans-headshot.jpg', 'jobTitle': JOB, 'description': BIO,
        'address': {'@type': 'PostalAddress', 'addressLocality': 'Lagos', 'addressCountry': 'NG'},
        'worksFor': {'@id': SITE + '/#org'},
        'alumniOf': {'@type': 'CollegeOrUniversity', 'name': 'Obafemi Awolowo University'},
        'knowsAbout': KNOWS, 'sameAs': SAME_AS,
    }
    org = {
        '@type': 'Organization', '@id': SITE + '/#org', 'name': 'Large Technologies', 'url': SITE + '/',
        'logo': SITE + '/favicon-192.png', 'founder': {'@id': SITE + '/#person'},
        'description': 'Software studio that builds booking systems, client portals, dashboards and AI automation for businesses.',
        'sameAs': SAME_AS,
    }
    site = {'@type': 'WebSite', '@id': SITE + '/#website', 'url': SITE + '/', 'name': NAME,
            'description': BIO, 'inLanguage': 'en', 'publisher': {'@id': SITE + '/#person'}}
    nodes = [site, person, org] + (extra_nodes or [])
    return {'@context': 'https://schema.org', '@graph': nodes}


def seo_tags(path, title, desc, extra_nodes=None, og_type='website', image=None):
    """Head tags for a page: robots, canonical, social preview, and structured data."""
    url = SITE + path
    ld = json.dumps(graph(extra_nodes), ensure_ascii=False, separators=(',', ':'))
    img = image or OG_IMAGE
    return (
        '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">\n'
        '<link rel="canonical" href="%s">\n'
        '<meta name="author" content="%s">\n'
        '<meta property="og:type" content="%s">\n'
        '<meta property="og:site_name" content="%s">\n'
        '<meta property="og:title" content="%s">\n'
        '<meta property="og:description" content="%s">\n'
        '<meta property="og:url" content="%s">\n'
        '<meta property="og:image" content="%s">\n'
        '<meta property="og:image:width" content="1200">\n'
        '<meta property="og:image:height" content="630">\n'
        '<meta property="og:image:alt" content="Evans Ademilua, full stack developer">\n'
        '<meta name="twitter:card" content="summary_large_image">\n'
        '<meta name="twitter:title" content="%s">\n'
        '<meta name="twitter:description" content="%s">\n'
        '<meta name="twitter:image" content="%s">\n'
        '<script type="application/ld+json">%s</script>\n'
    ) % (url, NAME, og_type, NAME, e(title), e(desc), url, img, e(title), e(desc), img, ld)


# ------------------------------------------------------------------ static files
PUBLIC_PAGES = [  # path, priority
    ('/', '1.0'), ('/full-stack-developer/', '0.9'), ('/web-developer/', '0.9'), ('/solutions.html', '0.8'), ('/cv.html', '0.8'),
    ('/tools/', '0.9'), ('/tools/qr-code-generator/', '0.9'), ('/tools/remove-background/', '0.9'), ('/tools/wifi-qr-code-generator/', '0.8'),
    ('/tools/whatsapp-qr-code-generator/', '0.8'), ('/tools/qr-code-scanner/', '0.8'),
    ('/work/caretrac.html', '0.6'), ('/work/billionaire-club.html', '0.6'), ('/work/sky-team-ife.html', '0.6'),
    ('/work/chillwireless.html', '0.6'), ('/work/cge.html', '0.6'),
]

ROBOTS = '''# {site}
# Everything public is open to search engines and AI search crawlers.
User-agent: *
Allow: /
Disallow: /Audit/
Disallow: /drafts/

# AI search and assistant crawlers (named so there is no doubt they are welcome)
User-agent: OAI-SearchBot
Allow: /
User-agent: GPTBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Perplexity-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Applebot
Allow: /
User-agent: Bingbot
Allow: /
User-agent: Googlebot
Allow: /

Sitemap: {site}/sitemap.xml
'''

LLMS = '''# Evans Ademilua

> Evans Ademilua is a full stack developer and web developer and the CEO of Large Technologies, based in Lagos, Nigeria. He is also known as Olufemi Evans Ademilua, Olufemi Ademilua and Evans Large. He builds websites, web apps, booking systems, client portals, internal dashboards, workflow automation and AI features for businesses. Top Rated on Upwork with eight 5-star client reviews.

## Key pages
- [Home and portfolio]({site}/): about, recent builds, how a project runs, and how to request an audit
- [Full stack developer for hire]({site}/full-stack-developer/): what he builds, the stack he uses and how to hire him
- [Web developer in Lagos, Nigeria]({site}/web-developer/): websites and web apps for businesses worldwide
- [Free online tools]({site}/tools/): QR code generator, barcode generator, WiFi QR, WhatsApp QR and link, vCard QR and a QR scanner
- [QR code generator]({site}/tools/qr-code-generator/): free, no sign-up, never expires
- [Barcode generator]({site}/tools/barcode-generator/): Code 128, EAN-13, UPC-A and more
- [Background remover]({site}/tools/remove-background/): remove an image background, exact for logos and AI for photos
- [Solutions]({site}/solutions.html): nine systems he builds, what each does and how it benefits the owner
- [CV]({site}/cv.html): curriculum vitae, skills, experience, education
- [CareTRAC case study]({site}/work/caretrac.html): field and client coordination portal (FastAPI, React)
- [Sky Team Ife case study]({site}/work/sky-team-ife.html): operations dashboard (Vercel, Supabase)
- [Billionaire Club case study]({site}/work/billionaire-club.html): community platform (Next.js)
- [Chill Wireless case study]({site}/work/chillwireless.html): e-commerce storefront
- [Common Ground Engineering case study]({site}/work/cge.html): booking and lead capture (Cal.com, Telegram)

## Skills
Python, FastAPI, TypeScript, React, Next.js, Node.js, PostgreSQL, Supabase, n8n workflow automation, LLM API integration (OpenAI, Claude), Bubble.io, FlutterFlow.

## Profiles
- [LinkedIn]({linkedin})
- [Upwork]({upwork})

## Contact
Request a business audit or book a meeting from the home page: {site}/#audits
'''


def write_static():
    open(os.path.join(ROOT, 'robots.txt'), 'w', encoding='utf-8', newline='\n').write(ROBOTS.format(site=SITE))
    urls = ''.join('  <url>\n    <loc>%s%s</loc>\n    <lastmod>%s</lastmod>\n    <priority>%s</priority>\n  </url>\n' % (SITE, p, TODAY, pr) for p, pr in PUBLIC_PAGES)
    open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8', newline='\n').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '</urlset>\n')
    open(os.path.join(ROOT, 'llms.txt'), 'w', encoding='utf-8', newline='\n').write(LLMS.format(site=SITE, linkedin=LINKEDIN, upwork=UPWORK))
    # IndexNow key file (lets Bing and others be told about new pages instantly)
    keyfile = [f for f in glob.glob(os.path.join(ROOT, '*.txt')) if re.fullmatch(r'[0-9a-f]{32}\.txt', os.path.basename(f))]
    if keyfile:
        key = os.path.basename(keyfile[0])[:-4]
    else:
        key = secrets.token_hex(16)
        open(os.path.join(ROOT, key + '.txt'), 'w', encoding='utf-8', newline='\n').write(key)
    print('robots.txt, sitemap.xml, llms.txt written; IndexNow key', key)
    return key


# ------------------------------------------------------------------ case study pages
NAV = '''    <nav class="site">
      <a href="../index.html#about">About</a>
      <a href="../index.html#work">Work</a>
      <a href="../solutions.html">Solutions</a>
      <a href="../index.html#process">Process</a>
      <a href="../index.html#audits">Audit</a>
      <a href="../index.html#reviews">Reviews</a>
      <a href="../index.html#book" class="nav-cta">Book a meeting</a>
    </nav>'''


def patch_work_pages():
    for f in sorted(glob.glob(os.path.join(ROOT, 'work', '*.html'))):
        t = open(f, encoding='utf-8').read()
        slug = os.path.basename(f)
        # working navigation (old links pointed at sections that no longer exist)
        t = re.sub(r'    <nav class="site">.*?</nav>', NAV, t, count=1, flags=re.S)
        m = re.search(r'<h1>(.*?)</h1>\s*<p>(.*?)</p>', t, re.S)
        name = re.sub(r'<[^>]+>', '', m.group(1)).strip() if m else slug
        desc = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', m.group(2))).strip() if m else BIO
        desc = html.unescape(desc)
        if len(desc) > 200:
            desc = desc[:197].rsplit(' ', 1)[0] + '...'
        title = '%s case study | Evans Ademilua' % name
        t = re.sub(r'<title>.*?</title>', '<title>%s</title>' % e(title), t, count=1, flags=re.S)
        # drop any earlier SEO block, then add the current one
        t = re.sub(r'<meta name="description"[^>]*>\n?', '', t)
        t = re.sub(r'<meta name="robots"[^>]*>\n.*?<script type="application/ld\+json">.*?</script>\n', '', t, flags=re.S)
        page = {'@type': 'WebPage', '@id': '%s/work/%s#page' % (SITE, slug), 'url': '%s/work/%s' % (SITE, slug), 'name': title,
                'description': desc, 'isPartOf': {'@id': SITE + '/#website'}, 'author': {'@id': SITE + '/#person'}}
        block = '<meta name="description" content="%s">\n' % e(desc) + seo_tags('/work/' + slug, title, desc, [page])
        t = t.replace('</title>\n', '</title>\n' + block, 1) if '</title>\n' in t else t.replace('</title>', '</title>\n' + block, 1)
        open(f, 'w', encoding='utf-8', newline='').write(t)
        print('patched', slug)


if __name__ == '__main__':
    write_static()
    patch_work_pages()
