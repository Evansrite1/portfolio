INFO = dict(slug='mailer', kicker='Email', tile_title='Outreach Mailer',
            tile_desc='Up to 25 Gmail accounts at 150 emails a day each, with a full inbox, CSV and PDF lead upload, lead splitting by number, no repeat emails, and live sent, opened, replied and bounced stats. Windows.',
            nav='Outreach Mailer', pos=4)

TOOL = '''<div class="tool" id="om-tool" style="grid-template-columns:1fr">
  <div class="card" style="text-align:center;padding:38px 20px">
    <img src="/tools/mailer/logo.png" width="96" height="96" alt="Outreach Mailer logo" style="display:block;margin:0 auto 14px;border-radius:22px">
    <h2 style="margin:0 0 8px;font-size:1.6rem">Outreach Mailer</h2>
    <p class="help" style="max-width:54ch;margin:0 auto 20px">Connect up to 25 Gmail accounts, send up to 150 emails a day from each, and read, reply and clean every inbox inside the app. Upload leads from a CSV, text or PDF file, split them across your mailboxes by number, and the app remembers every address it has emailed so none goes out twice. Import your leads, fix their details, write one email and press start. A built-in tracker shows you, live, who opened and who replied.</p>
    <a class="btn primary" id="om-dl" href="https://github.com/Evansrite1/portfolio/releases/download/mailer-latest/Outreach-Mailer-Setup.exe" style="padding:15px 28px;font-size:1rem" download>Download for Windows</a>
    <p class="help" id="om-note" style="margin-top:12px">Outreach Mailer is for Windows computers for now.</p>
    <p class="help" style="max-width:58ch;margin:14px auto 0">It signs in with a Google app password that you create yourself, and keeps it encrypted on your computer. Your leads and results never leave your computer. Replies, bounces and opt-outs are read from your own mailbox, so those numbers are exact. Opens are a guide, because some mail programs load pictures early or block them.</p>
  </div>
</div>'''

PAGE = dict(
    title='Outreach Mailer: Send Emails From Your Gmail With Live Stats',
    desc='Download Outreach Mailer for Windows. Connect your Gmail, import leads, send personal emails at a safe pace, and watch live sent, opened, replied and bounced numbers.',
    h1='Download Outreach Mailer', app='Outreach Mailer',
    lead='For Windows.',
    minimal=True, tool=TOOL, vendor=[], own=[], module=[], css=[],
    sections='', faq=[], related=[])
