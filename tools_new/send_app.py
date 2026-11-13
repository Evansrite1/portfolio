INFO = dict(slug='send-app', kicker='Files', tile_title='File Share by Evans Large',
            tile_desc='Send big files and folders between two computers over Wi-Fi. Install it on both. Windows, Mac and Linux.',
            nav='File Share', pos=2)

TOOL = '''<div class="tool" id="fs-tool" style="grid-template-columns:1fr">
  <div class="card" style="text-align:center;padding:38px 20px">
    <img src="/tools/send-app/logo.svg" width="96" height="96" alt="File Share by Evans Large logo" style="display:block;margin:0 auto 14px;border-radius:22px">
    <h2 style="margin:0 0 20px;font-size:1.6rem">File Share by Evans Large</h2>
    <a class="btn primary" id="fs-dl" href="https://github.com/Evansrite1/portfolio/releases/download/send-v1.0.0/File-Share-Setup.exe" style="padding:15px 28px;font-size:1rem" download>Download the installer</a>
    <p class="help" id="fs-dl-other" style="margin-top:12px"></p>
    <p class="help" id="fs-dl-tip" style="max-width:58ch;margin:6px auto 0"></p>
  </div>
</div>'''

PAGE = dict(
    title='Download File Share by Evans Large: Send Files Between Computers',
    desc='Download File Share by Evans Large, an installer for Windows, Mac and Linux that sends big files and folders between computers over Wi-Fi.',
    h1='Download File Share by Evans Large', app='File Share by Evans Large',
    lead='For Windows, Mac and Linux.',
    minimal=True, tool=TOOL, vendor=[], own=['appdl.js', 'send-download.js'], module=[], css=[],
    sections='', faq=[], related=[])
