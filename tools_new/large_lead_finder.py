INFO = dict(slug='large-lead-finder', kicker='Leads', tile_title='Large Lead Finder',
            tile_desc='Find leads for any of 126 niches in any country, with a working email or an Instagram page on every lead and all their social media. Download a CSV or PDF, or files for the Outreach Mailer and IG Outreach. Windows.',
            nav='Large Lead Finder', pos=3)

TOOL = '''<div class="tool" id="om-tool" style="grid-template-columns:1fr">
  <div class="card" style="text-align:center;padding:38px 20px">
    <img src="/tools/large-lead-finder/logo.png" width="96" height="96" alt="Large Lead Finder logo" style="display:block;margin:0 auto 14px;border-radius:22px">
    <h2 style="margin:0 0 8px;font-size:1.6rem">Large Lead Finder</h2>
    <p class="help" style="max-width:56ch;margin:0 auto 20px">Choose what every lead must have: a working email, an Instagram page, or either. Search the niches by typing, pick any countries from the full list of the world (none picked means every country), and set how many leads you want. It reads the open map and each business's own website, collects every social page it finds (Instagram, Facebook, X, LinkedIn, TikTok, YouTube and more), checks the emails, and gives you an easy CSV and PDF, plus files ready for the Outreach Mailer and IG Outreach.</p>
    <a class="btn primary" id="om-dl" href="https://github.com/Evansrite1/portfolio/releases/download/llf-latest/Large-Lead-Finder-Setup.exe" style="padding:15px 28px;font-size:1rem" download>Download for Windows</a>
    <p class="help" id="om-note" style="margin-top:12px">Large Lead Finder is for Windows computers for now. The installer downloads its own built-in browser (about 150 MB), so you need the internet while it installs.</p>
    <p class="help" style="max-width:58ch;margin:14px auto 0">Leads come from OpenStreetMap and from each business's public website. Coverage differs by country: well mapped places give many more leads. Emails are checked for a working mail domain, which lowers bounces but cannot prove a mailbox exists.</p>
  </div>
</div>'''

PAGE = dict(
    title='Large Lead Finder: Find Email and Instagram Leads for Any Niche',
    desc='Download Large Lead Finder for Windows. Find leads for any of 126 niches, each with a working email or an Instagram page, and export spreadsheets for email and Instagram outreach.',
    h1='Download Large Lead Finder', app='Large Lead Finder',
    lead='For Windows.',
    minimal=True, tool=TOOL, vendor=[], own=[], module=[], css=[],
    sections='', faq=[], related=[])
