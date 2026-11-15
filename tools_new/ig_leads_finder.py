INFO = dict(slug='ig-leads-finder', kicker='Leads', tile_title='IG Leads Finder',
            tile_desc='Find Instagram businesses that need your service, by kind of business, country, city and size. Windows and Mac.',
            nav='IG Leads Finder', pos=3)

TOOL = '''<div class="tool" id="lf-tool" style="grid-template-columns:1fr">
  <div class="card" style="text-align:center;padding:38px 20px">
    <img src="/tools/ig-leads-finder/logo.png" width="96" height="96" alt="IG Leads Finder logo" style="display:block;margin:0 auto 14px;border-radius:22px">
    <h2 style="margin:0 0 8px;font-size:1.6rem">IG Leads Finder</h2>
    <p class="help" style="max-width:52ch;margin:0 auto 20px">Pick the service you offer and the kind of business you want to reach. It finds them on Instagram and saves a leads sheet with a message for each one.</p>
    <a class="btn primary" id="lf-dl" href="https://github.com/Evansrite1/portfolio/releases/download/leads-latest/IG-Leads-Finder-Setup.exe" style="padding:15px 28px;font-size:1rem" download>Download the installer</a>
    <p class="help" id="lf-dl-other" style="margin-top:12px"></p>
    <p class="help" id="lf-dl-tip" style="max-width:58ch;margin:6px auto 0"></p>
    <p class="help" style="max-width:58ch;margin:14px auto 0">It works with your own Instagram login in a real browser window. Instagram can limit an account that searches too fast, so the app starts at a safe speed.</p>
  </div>
</div>'''

PAGE = dict(
    title='IG Leads Finder: Find Instagram Businesses That Need Your Service',
    desc='Download IG Leads Finder for Windows and Mac. Choose your service and audience, find matching Instagram businesses, and save a leads sheet with a message for each.',
    h1='Download IG Leads Finder', app='IG Leads Finder',
    lead='For Windows and Mac.',
    minimal=True, tool=TOOL, vendor=[], own=['appdl.js', 'leads-download.js'], module=[], css=[],
    sections='', faq=[], related=[])
