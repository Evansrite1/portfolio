"""The Presenter landing page: a moving futuristic hero, the download steps for each computer, what it does, and how it compares."""
import html

ICONS = {
 'book': '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M5 17h13"/>',
 'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
 'search': '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
 'keys': '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/>',
 'music': '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
 'doc': '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
 'sliders': '<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/>',
 'palette': '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2-.6-1.2.2-2.5 1.6-2.5H17a4 4 0 0 0 4-4A9 9 0 0 0 12 3z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/>',
 'image': '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
 'audio': '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
 'pdf': '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 15h6M9 18h4"/>',
 'play': '<rect x="3" y="5" width="18" height="14" rx="3.5"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>',
 'clock': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
 'sun': '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
 'camera': '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.6"/>',
 'phonecam': '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><circle cx="12" cy="11" r="2.8"/><path d="M11 18h2"/>',
 'phone': '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2M10 6h4"/>',
 'split': '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M12 5v14"/>',
 'layers': '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
 'auto': '<circle cx="12" cy="12" r="8.5"/><path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor"/>',
 'offline': '<path d="M3 9a14 14 0 0 1 18 0M6 12.5a9.5 9.5 0 0 1 12 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/><path d="M4 4l16 16"/>',
 'update': '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
 'user': '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/><path d="M16.5 4.5l3 3"/>',
 'monitor': '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
}
FEATURES = [
 ('book', 'Bible versions', 'Many versions, ready offline. Add more.'),
 ('mic', 'Listens to the preacher', 'Picks verses and songs from the message and queues them. Works offline.'),
 ('search', 'Voice search', 'Say a passage and it finds it, even with no internet.'),
 ('keys', 'Type fast', 'Space moves from book to chapter to verse, with suggestions as you type.'),
 ('music', 'Songs library', 'Your songs, searched as you type. Double tap to show.'),
 ('doc', 'Songs from a file', 'Bring in a whole song book from one text file.'),
 ('sliders', 'Text layout', 'Font, size, alignment and where the reference sits.'),
 ('palette', '22 themes', 'Change the look of the whole app.'),
 ('image', 'Photos and video', 'One tap adds, two taps shows. Videos loop.'),
 ('audio', 'Audio', 'Play audio with a clean screen and the name.'),
 ('pdf', 'PDFs and slides', 'Every page becomes a slide you step through.'),
 ('play', 'YouTube links', 'Full screen on the TV with nothing around it.'),
 ('clock', 'Countdown', 'Count down for a time, with your words and logo.'),
 ('sun', 'Time of day', 'Count down to 9:00, then start by itself.'),
 ('camera', 'Cameras and capture', 'A webcam or a capture card on the big screen.'),
 ('phonecam', 'Phone as a camera', 'Scan a code and your phone becomes a wireless camera.'),
 ('phone', 'Phone remote', 'Change slides and see the screen from your phone.'),
 ('split', 'Split screen', 'Two things side by side, such as a verse and a song.'),
 ('layers', 'Backgrounds', 'Moving and still backgrounds behind your words.'),
 ('auto', 'Runs by itself', 'Give items start times and let the service run.'),
 ('offline', 'Works offline', 'No internet needed to run it.'),
 ('update', 'Updates inside', 'One tap and it updates and reopens itself.'),
 ('user', 'No account', 'No sign-up and nothing is uploaded.'),
 ('monitor', 'Windows and Mac', 'Apple chip and Intel Macs, and Windows.'),
]
CHIPS = ['Scripture', 'Songs', 'Media', 'PDFs', 'Cameras', 'Phone camera', 'Countdown', 'Split screen', 'Listen', 'Themes']

COLS = ['Presenter by Evans Large', 'EasyWorship', 'ProPresenter', 'Proclaim', 'FreeShow', 'OpenLP']
Y, N, NF = 'Yes', 'No', 'Not found'
ROWS = [
 ('Price', 'Free for now', 'From about $18 to $21 a month', 'From about $29 a month', 'From about $25 to $27 a month', 'Free', 'Free'),
 ('Opens fast', 'About 1 second (measured)', 'Not measured', 'Not measured', 'Not measured', 'Not measured', 'Not measured'),
 ('Listens to the speaker and queues the verses and songs, offline', Y, NF, NF, NF, NF, NF),
 ('Your phone as a wireless camera, set up with a QR code', Y, NF, NF, NF, NF, NF),
 ('Updates itself inside the app, no website visit', Y, NF, NF, NF, NF, NF),
 ('Works with no internet from the first launch', Y, Y, Y, Y, Y, Y),
 ('No account or licence needed', Y, N, N, N, Y, Y),
 ('Phone remote that shows the screen live', Y, Y, Y, Y, Y, Y),
 ('Type a passage with Space from book to chapter to verse', Y, NF, NF, NF, NF, NF),
 ('Text layout for songs and scripture', Y, Y, Y, Y, Y, Y),
]


def icon(k):
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>' % ICONS[k]


def build():
    e = html.escape
    feats = ''.join('<li tabindex="0">%s<b>%s</b><span class="fd">%s</span></li>' % (icon(i), e(t), e(d)) for i, t, d in FEATURES)
    chips = ''.join('<li>%s</li>' % e(c) for c in CHIPS)
    th = ''.join('<th scope="col">%s</th>' % e(c) for c in COLS)
    def cell(v, i):
        cls = ' class="me"' if i == 0 else ''
        mark = ' data-v="y"' if v == Y else ' data-v="n"' if v in (N, NF) else ''
        return '<td%s%s>%s</td>' % (cls, mark, e(v))
    tr = ''.join('<tr><th scope="row">%s</th>%s</tr>' % (e(r[0]), ''.join(cell(v, i) for i, v in enumerate(r[1:]))) for r in ROWS)
    vids = ['vid-11-nebula', 'vid-04-violet-spiral', 'vid-08-night-diamond', 'vid-01-blue-flow', 'vid-06-ocean-waves']
    vlayers = ''.join('<video class="bgv%s" muted loop playsinline preload="none" data-src="/tools/second-screen-presenter/backgrounds/%s.webm" poster="/tools/second-screen-presenter/backgrounds/geo-%s.jpg"></video>' % (' on' if i == 0 else '', v, ['11-grid', '05-cubes', '10-squares', '12-arcs', '07-waves'][i]) for i, v in enumerate(vids))
    return '''
<section class="ph" id="ph">
  <div class="ph-bg" aria-hidden="true">%(vlayers)s<div class="ph-stars"></div><div class="ph-grid"></div><div class="ph-shade"></div></div>
  <div class="ph-in">
    <div class="ph-left">
      <h1 class="ph-h">Presenter <em>by Evans Large</em></h1>
      <p class="ph-lead">Bible verses, song lyrics, videos, PDFs, cameras and countdowns on your TV or projector, run from your laptop or your phone. It opens fast, and it works with no internet.</p>
      <ul class="ph-chips" aria-label="What it does">%(chips)s</ul>
      <p class="ph-note">Windows and Mac. No account. Nothing is uploaded.</p>
    </div>
    <aside class="ph-dl" id="download" aria-label="Download">
      <div class="dl-tabs" role="tablist" aria-label="Your computer">
        <button type="button" role="tab" data-os="win" aria-selected="true">Windows</button>
        <button type="button" role="tab" data-os="macArm" aria-selected="false">Mac, Apple chip</button>
        <button type="button" role="tab" data-os="macIntel" aria-selected="false">Mac, Intel</button>
      </div>
      <div class="dl-panel" data-panel="win">
        <a class="dl-btn" data-file="win" href="#" download>Download for Windows</a>
        <ol class="dl-steps">
          <li>Open the downloaded zip and press <b>Extract all</b>.</li>
          <li>Open the new folder and double-click <b>Presenter Setup</b>.</li>
          <li>If Windows says it protected your PC, press <b>More info</b>, then <b>Run anyway</b>.</li>
          <li>Press <b>Install Presenter</b>. It takes one to two minutes and opens by itself.</li>
        </ol>
      </div>
      <div class="dl-panel" data-panel="macArm" hidden>
        <a class="dl-btn" data-file="macArm" href="#" download>Download for Mac, Apple chip</a>
        <ol class="dl-steps">
          <li>Open the downloaded zip. It holds the installer and a <b>Read me first</b> file with these steps.</li>
          <li>Open the <b>.dmg</b> and drag Presenter into <b>Applications</b>.</li>
          <li>Open <b>Terminal</b> (Command and Space, type Terminal), paste this line and press Enter:<code>xattr -cr "/Applications/Presenter by Evans Large.app"</code></li>
          <li>Open Presenter. If the Mac still warns you, open <b>System Settings, Privacy and Security</b> and press <b>Open Anyway</b>.</li>
        </ol>
        <p class="dl-small">M1, M2, M3 or M4 Mac? This one. Not sure? Apple menu, About This Mac.</p>
      </div>
      <div class="dl-panel" data-panel="macIntel" hidden>
        <a class="dl-btn" data-file="macIntel" href="#" download>Download for Mac, Intel</a>
        <ol class="dl-steps">
          <li>Open the downloaded zip. It holds the installer and a <b>Read me first</b> file with these steps.</li>
          <li>Open the <b>.dmg</b> and drag Presenter into <b>Applications</b>.</li>
          <li>Open <b>Terminal</b> (Command and Space, type Terminal), paste this line and press Enter:<code>xattr -cr "/Applications/Presenter by Evans Large.app"</code></li>
          <li>Open Presenter. If the Mac still warns you, open <b>System Settings, Privacy and Security</b> and press <b>Open Anyway</b>.</li>
        </ol>
        <p class="dl-small">Older Mac with an Intel processor? This one.</p>
      </div>
      <p class="dl-net"><b>Internet.</b> You do not need it to run Presenter. When the internet is on, the app checks for updates by itself and shows an <b>Update now</b> button, and you can add more Bible versions. With no internet, everything else works as normal.</p>
    </aside>
  </div>
</section>

<section class="pf" id="features">
  <div class="pw">
    <h2>Everything it does</h2>
    <ul class="pf-grid">%(feats)s</ul>
  </div>
</section>

<section class="pcmp2" id="compare">
  <div class="pw">
    <h2>How it compares</h2>
    <div class="edge">
      <div><b>About 1s</b><span>to open, measured with no internet</span></div>
      <div><b>0</b><span>accounts or sign-ups</span></div>
      <div><b>3</b><span>things the others do not list: listening, a phone camera and in-app updates</span></div>
    </div>
    <div class="pcmp-w"><table><thead><tr><th scope="col"></th>%(th)s</tr></thead><tbody>%(tr)s</tbody></table></div>
    <p class="help">Based on public listings in November 2026. Prices change, and "Not found" means I could not find that feature listed, not that it is missing. The paid programs do more in some areas: ProPresenter is stronger for broadcast and multi-screen production, and Proclaim for planning with a team. "About 1 second" was measured on one Windows laptop with no internet.</p>
  </div>
</section>
''' % dict(vlayers=vlayers, chips=chips, feats=feats, th=th, tr=tr)
