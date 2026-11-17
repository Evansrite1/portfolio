INFO = dict(slug='ig-outreach', kicker='Instagram', tile_title='IG Outreach',
            tile_desc='Send Instagram messages from up to 10 of your own accounts, 20 a day each, see who replies, and track the numbers for every account and for the whole outreach. Windows and Mac.',
            nav='IG Outreach', pos=3)

TOOL = '''<div class="tool" id="lf-tool" style="grid-template-columns:1fr">
  <div class="card" style="text-align:center;padding:38px 20px">
    <img src="/tools/ig-outreach/logo.png" width="96" height="96" alt="IG Outreach logo" style="display:block;margin:0 auto 14px;border-radius:22px">
    <h2 style="margin:0 0 8px;font-size:1.6rem">IG Outreach</h2>
    <p class="help" style="max-width:52ch;margin:0 auto 20px">Log in to up to 10 Instagram accounts, add your leads (the spreadsheet from Large Lead Finder works), and it sends the messages slowly, 20 a day from each account by default. It notices who replies and shows your numbers for the whole outreach and for each account: sent today, this week and in total, replies, reply rate and failed.</p>
    <a class="btn primary" id="lf-dl" href="https://github.com/Evansrite1/portfolio/releases/download/leads-latest/IG-Outreach-Setup.exe" style="padding:15px 28px;font-size:1rem" download>Download the installer</a>
    <p class="help" id="lf-dl-other" style="margin-top:12px"></p>
    <p class="help" id="lf-dl-tip" style="max-width:58ch;margin:6px auto 0"></p>
    <p class="help" style="max-width:58ch;margin:14px auto 0">It works with your own Instagram login in a real browser window. Instagram limits accounts that search or message too fast, so the app starts slow, keeps to a daily message limit you set, and stops by itself if Instagram pushes back.</p>
  </div>
</div>'''

PAGE = dict(
    title='IG Outreach: Find Instagram Leads, Send Messages and Track Replies',
    desc='Download IG Outreach for Windows and Mac. Find Instagram businesses that need your service, send each a message from your own account, see who replies and track your outreach numbers.',
    h1='Download IG Outreach', app='IG Outreach',
    lead='For Windows and Mac.',
    minimal=True, tool=TOOL, vendor=[], own=['appdl.js', 'leads-download.js'], module=[], css=[],
    sections='', faq=[], related=[])
