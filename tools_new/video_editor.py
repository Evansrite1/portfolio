INFO = dict(slug='video-editor', kicker='Video', tile_title='Video editor',
            tile_desc='Cut, add text, music and filters, and export an MP4. Works on your phone. Nothing is uploaded.',
            nav='Video editor', pos=0)

TOOL = '''<div class="tool" id="ve-tool" style="grid-template-columns:1fr">
  <div class="card" style="text-align:center;padding:34px 20px">
    <h2 style="margin:0 0 8px">Open the editor</h2>
    <p class="help" style="max-width:52ch;margin:0 auto 20px">Add your video, photos or music, edit on a simple timeline, and save the finished MP4. It works on a computer and on a phone, and your files never leave your device.</p>
    <a class="btn primary" href="/tools/video-editor/app/" style="padding:15px 28px;font-size:1rem">Start editing</a>
    <p class="help" style="margin-top:14px">Best in Chrome or Edge, on a computer or an Android phone.</p>
  </div>
</div>'''

SECTIONS = '''
<section class="block prose"><h2>What you can do</h2>
<ul>
<li><b>Cut and arrange.</b> Trim the ends of a clip, split it at any point, delete the parts you do not want, and put clips in the order you like.</li>
<li><b>Add text.</b> Titles and captions in several styles, with your own font, colour, size and position.</li>
<li><b>Add sound.</b> Put in your own music, record a voiceover, and set the volume of every clip.</li>
<li><b>Change the look.</b> Filters, brightness, contrast, colour, warmth, dark edges and zoom.</li>
<li><b>Change the speed.</b> Slow a clip down to a quarter speed or speed it up to four times.</li>
<li><b>Pick the size.</b> YouTube (16:9), TikTok and Reels (9:16), square (1:1) or Instagram post (4:5), with blurred sides or black bars.</li>
<li><b>Add video details.</b> Title, description, who made it, date, copyright, tags and place are saved inside the MP4 file. Private details such as the camera model and GPS place of the original are left out unless you choose to keep them.</li>
<li><b>Save an MP4.</b> Pick 1080p or 720p and a quality level. The editor shows the expected file size before you start.</li>
</ul></section>
<section class="block prose"><h2>How to make a video</h2>
<ol>
<li><b>Add your files.</b> Choose videos, photos or music from your device, or drop them on the page.</li>
<li><b>Edit on the timeline.</b> Tap a clip to select it. Use Split, Delete, Copy, Earlier and Later, and drag the white ends of a clip to trim it.</li>
<li><b>Use the tools at the bottom.</b> Text, Sound, Filters, Adjust, Speed, Size and Details each open a short panel.</li>
<li><b>Export.</b> Tap Export, pick the quality, wait for it to finish and download your MP4.</li>
</ol></section>
<section class="block prose"><h2>What to know before you start</h2>
<ul>
<li>Everything is made on your own device, so a long or high resolution video takes a few minutes to export. Keep the tab open while it works.</li>
<li>Very large projects need a computer with plenty of memory. Full HD with a handful of clips is comfortable.</li>
<li>Your project is not saved if you close the tab, so export before you leave.</li>
<li>Videos in formats your browser cannot play, such as some iPhone HEVC files on older computers, cannot be opened. Use the <a href="/tools/video-converter/">video converter</a> first.</li>
</ul></section>'''

PAGE = dict(
    title='Free Online Video Editor: Cut, Text, Music, No Upload',
    desc='A free online video editor that works on your phone or computer. Trim, split, add text, music and filters, change speed and size, add video details and export an MP4. Nothing is uploaded.',
    h1='Free online video editor', app='Free Online Video Editor',
    lead='Cut your video, add text and music, pick a filter and save an MP4, on your phone or your computer. Simple to use, and your files never leave your device.',
    tool=TOOL, vendor=[], own=[], module=[], css=[],
    sections=SECTIONS,
    faq=[
        ('Is this video editor free?', 'Yes. There is no sign-up, no watermark and no limit on how many videos you make.'),
        ('Are my videos uploaded?', 'No. Your files are opened and edited on your own device and the finished video is made there too, so nothing is sent to a server.'),
        ('Does it work on a phone?', 'Yes. The editor is built for phones as well as computers. Use Chrome or Edge, or another current Chromium browser, on an Android phone or a computer. Other browsers may not be able to export.'),
        ('Can I put my own music in the video?', 'Yes. Add an audio file from your device or record a voiceover. The editor does not include a music library, so use tracks you have the rights to.'),
        ('What does the video details panel do?', 'It saves a title, description, author, date, copyright, tags and place inside the MP4 file, plus a cover picture. Copyright, tags and place are stored together in the comment field.'),
        ('Why does exporting take a while?', 'Your own device does the work, so a long or high resolution video takes a few minutes. A faster computer with a graphics card is quicker.'),
        ('What file types can I use?', 'MP4, MOV, WebM and other video your browser can play, plus JPG, PNG and WebP photos and MP3, WAV and M4A audio. The finished video is saved as MP4.'),
    ],
    related=['video-trimmer', 'video-compressor', 'video-converter', 'video-to-mp3', 'screen-recorder', 'audio-editor'])
