INFO = dict(slug='second-screen-presenter', kicker='Present', tile_title='Second screen presenter',
            tile_desc='Show photos, videos, YouTube links and text on a TV or projector, controlled from your laptop.',
            nav='Screen presenter', pos=1)

TOOL = '''<div class="ss" id="ss-tool">
  <div class="card ss-bar">
    <div class="ss-status"><span class="ss-dot" id="ss-dot"></span><div><b id="ss-st">Display not open</b><small id="ss-st2">Connect your TV or projector, set it to extend your screen, then open the display.</small></div></div>
    <div class="ss-bar-btns">
      <select id="ss-screen" hidden aria-label="Screen to show on"></select>
      <button type="button" class="btn" id="ss-move" hidden>Move to selected screen</button>
      <button type="button" class="btn" id="ss-ident" hidden>Identify</button>
      <button type="button" class="btn primary" id="ss-open">Open display screen</button>
    </div>
    <p class="help ss-msg" id="ss-msg" role="status"></p>
  </div>

  <div class="tool ss-main">
    <div class="card">
      <h2 class="ss-h">Your items</h2>
      <div class="scan-drop" id="ss-drop">
        <p style="margin:0 0 12px"><b>Drop photos and videos here</b> or choose them</p>
        <button type="button" class="btn primary" id="ss-pick">Add photos and videos</button>
        <input type="file" id="ss-file" accept="image/*,video/*,.mov,.mkv" multiple hidden aria-label="Choose photos and videos">
        <p class="help">They stay on this computer. Nothing is uploaded.</p>
      </div>
      <div class="field" style="margin-top:16px"><label for="ss-url">Add a link</label>
        <div class="ss-inline"><input id="ss-url" type="url" inputmode="url" placeholder="YouTube, Vimeo, Google Slides, image or web page link" autocomplete="off"><button type="button" class="btn" id="ss-addurl">Add</button></div>
      </div>
      <details class="ss-textadd"><summary>Add a text slide</summary>
        <div class="field" style="margin-top:10px"><label for="ss-text">Words on the screen</label><textarea id="ss-text" rows="3" placeholder="Welcome to our Sunday service"></textarea></div>
        <div class="ss-inline"><select id="ss-tstyle" aria-label="Text slide colours"><option value="dark">White on black</option><option value="light">Black on white</option><option value="coral">White on navy and coral</option></select><button type="button" class="btn" id="ss-addtext">Add slide</button></div>
      </details>
      <ol class="ss-list" id="ss-list"></ol>
      <p class="help" id="ss-empty">Nothing added yet. Add photos, videos, links or text, then press Show on the one you want on the screen.</p>
    </div>

    <div class="card preview">
      <h2 class="ss-h">On screen now</h2>
      <div class="ss-mon" id="ss-mon"><span>Nothing on screen</span></div>
      <p class="ss-now" id="ss-now"></p>
      <div class="ss-media" id="ss-media" hidden>
        <div class="ss-inline"><button type="button" class="btn primary" id="ss-play">Play</button><button type="button" class="btn" id="ss-restart">From the start</button><span class="ss-time" id="ss-time">0:00 / 0:00</span></div>
        <input type="range" id="ss-seek" min="0" max="1" step="0.1" value="0" aria-label="Position in the video">
        <div class="ss-inline ss-vol"><label for="ss-vol">Volume</label><input type="range" id="ss-vol" min="0" max="100" value="100"><label class="check" style="margin:0"><input type="checkbox" id="ss-loop"> Loop</label></div>
      </div>
      <button type="button" class="btn" id="ss-web" hidden style="width:100%;margin-top:10px">Page blank? Open page directly on the display</button>
      <div class="ss-nav">
        <button type="button" class="btn" id="ss-prev">&larr; Back</button>
        <button type="button" class="btn" id="ss-black" aria-pressed="false" disabled>Black screen</button>
        <button type="button" class="btn primary" id="ss-next">Next &rarr;</button>
      </div>
      <div class="ss-opts">
        <label class="check"><input type="checkbox" id="ss-fade" checked> Fade between items</label>
        <label class="check"><input type="checkbox" id="ss-fill"> Fill the whole screen (crops edges)</label>
        <label class="check"><input type="checkbox" id="ss-onend"> Go to the next item when a video ends</label>
        <label class="check"><input type="checkbox" id="ss-auto"> Change photos and text every <input type="number" id="ss-secs" min="2" max="600" value="8" aria-label="Seconds"> seconds</label>
      </div>
      <p class="help">Keys: Right arrow or Page Down for next, Left arrow or Page Up for back, Space to play or pause, B for a black screen. Presentation clickers work too.</p>
    </div>
  </div>
</div>'''

SECTIONS = '''
<section class="block prose"><h2>How to show things on a second screen</h2>
<ol>
<li><b>Connect the TV or projector.</b> Plug it into your laptop with HDMI and set it to <b>extend</b> your desktop, not mirror it. On Windows press Windows key + P and choose Extend. On a Mac open System Settings, Displays, and turn off mirroring.</li>
<li><b>Open the display screen.</b> Press Open display screen. In Chrome and Edge it can open straight on the TV once you allow the site to use your screens. Otherwise drag the window onto the TV. Click it once to make it full screen.</li>
<li><b>Add your items.</b> Photos, videos, YouTube or Vimeo links, Google Slides, web pages and text slides. Drag them into order.</li>
<li><b>Press Show.</b> The item appears on the big screen while you keep control on your laptop. Use Next and Back, play and pause videos, or go to a black screen between moments.</li>
</ol></section>
<section class="block prose"><h2>Made for real events</h2>
<ul>
<li><b>Churches and ministries:</b> announcements, song words as text slides, sermon videos and photos.</li>
<li><b>Classes and training:</b> switch between pictures, short videos, a YouTube clip and your slides without showing your desktop.</li>
<li><b>Weddings, parties and shops:</b> run a photo slideshow that changes every few seconds, or show a menu or promo video on a TV.</li>
<li><b>Meetings:</b> keep your notes and email private on the laptop while the room only sees what you choose.</li>
</ul></section>
<section class="block prose"><h2>Tips for a smooth show</h2>
<ul>
<li>Click the display screen once before you start. Browsers only allow sound after a click there, and the same click makes it full screen.</li>
<li>Video sound comes out of whatever your computer uses for sound. To hear it through the TV, pick the TV or HDMI as the sound output in your computer settings.</li>
<li>Some websites refuse to be shown inside another page. If a web page stays blank, press Open page directly on the display.</li>
<li>To show on a Chromecast or smart TV without a cable, open the display screen and use Cast in the Chrome menu to cast that tab.</li>
<li>Your list is not saved when you close this page, so keep your files in one folder for next time.</li>
</ul></section>'''

PAGE = dict(
    title='Second Screen Presenter: Show Videos and Photos on a TV',
    desc='Free presenter for a TV or projector. Show photos, videos, YouTube links, slides and text on an extended screen and control it all from your laptop. Nothing is uploaded.',
    h1='Second screen presenter', app='Second Screen Presenter',
    lead='Plug in a TV or projector, then show photos, videos, YouTube links, slides and text on it while you control everything from your laptop. Your audience only sees what you choose.',
    tool=TOOL, vendor=[], own=['sstool.js'], module=[], css=['second-screen.css'],
    sections=SECTIONS,
    faq=[
        ('Is this free?', 'Yes. There is no sign-up, no watermark and no limit.'),
        ('Are my photos and videos uploaded?', 'No. They are opened in your browser and passed straight to the display window on the same computer.'),
        ('Why is my TV showing the same thing as my laptop?', 'Your display is set to mirror. Set it to extend instead: Windows key + P then Extend on Windows, or turn off mirroring in Displays settings on a Mac.'),
        ('Why is there no sound?', 'Browsers block sound until you click the page. Click the display screen once. If you still hear nothing, set your computer sound output to the TV or HDMI.'),
        ('Can I show a YouTube video?', 'Yes. Paste the YouTube link and press Show. You can play, pause, jump and change the volume from your laptop.'),
        ('Can I use a presentation clicker?', 'Yes. Most clickers send Page Down and Page Up, which move to the next and previous item.'),
        ('Which browsers work best?', 'Chrome and Edge on a computer. They can open the display directly on your second screen. Other browsers work too, but you drag the display window there yourself.'),
    ],
    related=['video-editor', 'video-compressor', 'image-to-pdf', 'screen-recorder', 'qr-code-generator'])
