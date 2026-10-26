INFO = dict(slug='second-screen-presenter', kicker='Present', tile_title='Second screen presenter',
            tile_desc='Bible verses, lyrics, PDFs, videos, cameras and countdowns on a TV or projector, with a stage display and phone remote.',
            nav='Screen presenter', pos=1)

TOOL = '''<div class="tool" id="ss-tool" style="grid-template-columns:1fr">
  <div class="card" style="text-align:center;padding:34px 20px">
    <h2 style="margin:0 0 8px">Open the presenter</h2>
    <p class="help" style="max-width:58ch;margin:0 auto 20px">A full-screen workspace like the church and streaming programs. Your library on the left, your service next to it, a preview and a live screen, and every slide below them. It opens on its own without the browser around it, and it works on a laptop and on a phone.</p>
    <a class="btn primary" href="/tools/second-screen-presenter/app/" style="padding:15px 28px;font-size:1rem">Open presenter</a>
    <p class="help" style="margin-top:14px">Best in Chrome or Edge on a computer. Nothing is uploaded. <a href="/tools/second-screen-presenter/contact/">Contact the builder</a></p>
  </div>
</div>'''

SECTIONS = '''
<section class="block prose"><h2>What the workspace looks like</h2>
<ul>
<li><b>Library (left).</b> Tabs for Songs, Scripture, Media, Capture and Countdown. Find something and add it to the service. Songs open a pop-up for typing new lyrics, and one Song background button sets the picture behind every song.</li>
<li><b>Service (next to it).</b> Your running order. Drag items up and down, or open the three dots on any item (or right-click it) to edit the words, set a start time, change the slide speed, duplicate, move or remove it. A song goes on the screen with one click. Everything else, such as Bible passages, photos, videos and PDFs, shows on a double click, so nothing appears by accident.</li>
<li><b>Preview and Live (right).</b> Two small screens. Preview shows what you have selected, Live shows what the audience sees right now. Small round buttons record the screen, show how to go live online, and open a three-dots menu with the rest, such as Check first mode, which keeps even songs in Preview until you press Go live.</li>
<li><b>Slides (below them).</b> Every slide or PDF page as a thumbnail. Verses, choruses and bridges are colour-coded. Next and Back, Black and Logo sit under the screens.</li>
</ul></section>
<section class="block prose"><h2>A service that runs by itself</h2>
<ul>
<li><b>Start times.</b> Give any item a start time, for example the countdown at 9:00 and the first song at 9:10. Press Run automatically and the presenter shows each item on the screen when its time arrives, even if nobody is at the computer.</li>
<li><b>Slide speed.</b> Each song, passage or photo set can move on by itself after a number of seconds you choose, or wait for you.</li>
<li><b>Or by hand.</b> Turn automatic mode off at any time and click through the service yourself.</li>
</ul></section>
<section class="block prose"><h2>Songs and Bible, ready for church</h2>
<ul>
<li><b>Songs.</b> Press New song, type or paste the lyrics, leave a blank line between slides, and label sections such as Verse 1, Chorus and Bridge. You see the slides as you type. Search your saved songs by title or by any line of the lyrics.</li>
<li><b>Scripture.</b> Type a book and the app suggests every match, so J brings up John, James, Jeremiah and the other books that start with J. Tap the chapter, then tap one verse or several to show them together, then press Show. A full-width Search with words button finds a verse from a few words you remember.</li>
<li><b>Bible versions.</b> Your favourite versions sit in a bar at the bottom, up to six at a time. The plus button searches a free catalogue of more than a thousand translations in many languages. Press Add and it is downloaded once and kept on your computer.</li>
<li><b>Scripture look.</b> Three icons under the Holy Bible title set how many verses go on one slide, the text and slide colours, and the background picture.</li>
<li><b>Voice search.</b> Press the microphone and say a passage such as "John 3 16". It finds the passage and adds it to your service.</li>
</ul></section>
<section class="block prose"><h2>Media, cameras and links</h2>
<ul>
<li><b>Media.</b> Photos, videos, PDFs and YouTube, Vimeo or Google Slides links, sorted into All, Photos, Videos and PDFs. Press the plus to add files in bulk. They are kept on your computer, so they are still there next time. A PDF opens page by page, so you can step through it with Next and Back or a clicker.</li>
<li><b>Capture.</b> Show a camera, or a capture card connected to another laptop or a video mixer, or share your screen or any window. A running camera can also be the background behind a song or Bible verse.</li>
<li><b>Countdown.</b> Count down for a set time or to a start time, with your own words and a message at zero.</li>
</ul></section>
<section class="block prose"><h2>Phone, stage display, recording and live streaming</h2>
<ul>
<li><b>Phone.</b> Scan the code and your phone shows what is on the TV screen right now, wherever you sit. The same page lets you move through the service, jump to any song section, and add songs and Bible passages from your Library.</li>
<li><b>Stage display.</b> A private screen for the worship leader with the words now, the next slide, the time and your messages.</li>
<li><b>Record.</b> The round red button saves a video of what is on the screen to your computer.</li>
<li><b>Go live online.</b> A web page cannot send video to YouTube, Facebook, Twitch or TikTok by itself. The broadcast button shows how to do it with the free program OBS Studio, which can show the TV screen exactly as it is, and links to each platform.</li>
</ul></section>
<section class="block prose"><h2>How to show things on a second screen</h2>
<ol>
<li><b>Connect the TV or projector.</b> Plug it into your laptop with HDMI and set it to <b>extend</b> your desktop, not mirror it. On Windows press Windows key + P and choose Extend. On a Mac open System Settings, Displays, and turn off mirroring.</li>
<li><b>Open the presenter.</b> Press Open presenter and choose Start in full screen. You can also install it as an app from the same screen.</li>
<li><b>Open the TV screen.</b> Press Open TV screen. In Chrome and Edge it can open straight on the TV once you allow the site to use your screens. Otherwise drag the window onto the TV. Click it once to make it full screen.</li>
<li><b>Build your service and show it.</b> Add songs, passages and media from the Library, then click a song or double-click anything else.</li>
</ol></section>
<section class="block prose"><h2>Tips for a smooth show</h2>
<ul>
<li>Click the TV screen once before you start. Browsers only allow sound after a click there, and the same click makes it full screen.</li>
<li>Video sound comes out of whatever your computer uses for sound. To hear it through the TV, pick the TV or HDMI as the sound output in your computer settings.</li>
<li>PowerPoint, Keynote and Word files must be saved as a PDF first. In PowerPoint choose File, Save as, and pick PDF.</li>
<li>Some websites refuse to be shown inside another page. For those, use Share a screen or window in the Capture tab and pick your Chrome window.</li>
<li>Your service list, songs, Media and Bible versions are saved in this browser. Cameras and screen shares need starting again next time.</li>
</ul></section>'''

PAGE = dict(
    title='Church Presenter: Bible Verses, Lyrics and Video on a TV',
    desc='Free presenter for churches and events. Show Bible verses, song lyrics, PDFs, photos, videos, cameras and countdowns on a TV or projector, with a stage display and phone remote.',
    h1='Second screen presenter', app='Second Screen Presenter',
    lead='A free presenter for church services and events. Show Bible verses, song lyrics, PDFs, photos, videos, a camera or a countdown on a TV or projector, while you control everything from your laptop or phone.',
    tool=TOOL, vendor=[], own=[], module=[], css=[],
    sections=SECTIONS,
    faq=[
        ('Is this free?', 'Yes. There is no sign-up, no watermark and no limit.'),
        ('Are my photos, videos and files uploaded?', 'No. They are opened in your browser and passed straight to the display window on the same computer.'),
        ('Which Bibles are included?', 'The King James Version, World English Bible, Berean Standard Bible and American Standard Version are ready to use. All four are in the public domain. The plus button in the Scripture tab searches a free catalogue of more than a thousand more translations in many languages and adds them to your bar of up to six. Modern translations such as the NIV, ESV and NKJV are copyrighted and need a licence, so they are not available.'),
        ('How does voice search work?', 'Press the microphone and say a passage. Your browser listens and turns the speech into text. Chrome and Edge do this with a speech service run by Google or Microsoft, so the audio of that one phrase is sent to them by the browser. Nothing else is sent. If you prefer, type the passage instead.'),
        ('Can I show a PowerPoint?', 'Save it as a PDF first (File, Save as, PDF in PowerPoint), then add the PDF in the Media tab. Each page becomes a slide you can step through. Keynote and Word files also work this way.'),
        ('Can I show a camera or another laptop?', 'Yes. In the Capture tab press Find cameras and start the one you want. A capture card, which is a small box that turns an HDMI cable into a camera for your computer, shows another laptop or a video mixer. You can also share a window or screen.'),
        ('Can it open Chrome for me?', 'A website cannot launch or control Chrome on your computer. Instead the Capture tab can share any Chrome window or screen you choose, and links to YouTube, Vimeo and Google Slides can be added in the Media tab.'),
        ('Can the service run by itself?', 'Yes. Give items a start time from their three-dots menu, then press Run automatically in the Service panel. Each item appears on the screen at its time, and songs and passages can move through their slides at a speed you set. Keep the presenter page open on the computer. You can switch back to clicking by hand at any time.'),
        ('Can I go live on YouTube, Facebook, Twitch or TikTok?', 'Not directly from a web page, because browsers cannot send live video to those services. The broadcast button shows how to use the free program OBS Studio to capture the TV screen window and stream it, with links to each platform. The red record button saves a video of the screen to your computer.'),
        ('How do I run it without the browser around it?', 'Press Open presenter and choose Start in full screen, or install it as an app from the same screen. Press Esc to leave full screen.'),
        ('Why is my TV showing the same thing as my laptop?', 'Your display is set to mirror. Set it to extend instead: Windows key + P then Extend on Windows, or turn off mirroring in Displays settings on a Mac.'),
        ('Why is there no sound?', 'Browsers block sound until you click the page. Click the TV screen once. If you still hear nothing, set your computer sound output to the TV or HDMI.'),
        ('How does the phone connect?', 'Scan the code with your phone. The free PeerJS service helps the phone find your computer, then the two talk directly. Both need internet. The phone shows a small live picture of the TV screen, lets you move through the service and add songs and Bible passages. Your original photos and videos are never sent to the phone.'),
        ('Can I use a presentation clicker?', 'Yes. Most clickers send Page Down and Page Up, which move to the next and previous slide.'),
        ('Are my songs saved?', 'Songs you save, your Media library, your song background and the Bible versions you add stay in this browser on this computer. Clearing your browser data removes them, so keep your lyrics somewhere safe too.'),
        ('Who made this and how can I reach them?', 'Evans Ademilua in Lagos, Nigeria. Use Contact the builder inside the presenter to send a message, ask for a feature or say thank you.'),
    ],
    related=['video-editor', 'video-compressor', 'image-to-pdf', 'screen-recorder', 'qr-code-generator'])
