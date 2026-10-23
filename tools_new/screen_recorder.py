INFO = dict(slug='screen-recorder', kicker='Video', tile_title='Screen recorder',
            tile_desc='Record your screen, a window or a tab with sound and a webcam circle. Save WebM or MP4.', nav='Screen recorder')

TOOL = '''<div class="tool" id="sr-tool">
  <div class="card">
    <p class="sr-note" id="sr-unsupported" role="alert" hidden></p>
    <div id="sr-setup">
      <p class="help" style="margin:0 0 14px">Press Start recording, then choose a whole screen, a window or a browser tab in the box your browser shows. Computers only. Nothing is uploaded.</p>
      <label class="check"><input type="checkbox" id="sr-sys" checked> Record computer or tab audio</label>
      <label class="check"><input type="checkbox" id="sr-mic"> Record my microphone</label>
      <label class="check"><input type="checkbox" id="sr-cam"> Show my webcam as a circle</label>
      <div class="field" id="sr-corner-f" hidden><label for="sr-corner">Webcam circle position</label>
        <select id="sr-corner"><option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option><option value="tl">Top left</option></select></div>
      <div class="row2">
        <div class="field"><label for="sr-res">Resolution</label><select id="sr-res"><option value="0">Best available</option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option></select></div>
        <div class="field"><label for="sr-fps">Frame rate</label><select id="sr-fps"><option value="15">15 fps</option><option value="24">24 fps</option><option value="30" selected>30 fps</option><option value="60">60 fps</option></select></div>
      </div>
      <p class="help">If you tick audio, also tick Share audio in the browser box. The browser decides the final size, so a window smaller than the chosen resolution stays that size.</p>
      <div class="btns"><button type="button" class="btn primary" id="sr-start">Start recording</button></div>
    </div>
    <div id="sr-controls" hidden>
      <p class="sr-time" id="sr-time" role="timer" aria-live="off">0:00</p>
      <div class="btns"><button type="button" class="btn" id="sr-pause">Pause</button><button type="button" class="btn primary" id="sr-stop">Stop recording</button></div>
      <p class="help">Use Stop recording here, or the Stop sharing button your browser shows.</p>
    </div>
    <p class="help" id="sr-status" role="status" aria-live="polite" style="margin-top:12px"></p>
  </div>

  <div class="card preview">
    <div class="sr-stage" id="sr-stage" hidden><video id="sr-live" muted playsinline aria-label="Live preview of what is being recorded"></video><div class="sr-count" id="sr-count" hidden aria-live="assertive">3</div><div class="sr-recdot" id="sr-rec" hidden><i></i>REC</div></div>
    <p class="help" id="sr-empty" style="text-align:center;margin:10px 0">Your recording appears here</p>
    <div class="sr-result" id="sr-result" hidden>
      <video id="sr-result-video" controls playsinline aria-label="Your recording"></video>
      <p class="sr-meta" id="sr-meta"></p>
      <div class="btns"><button type="button" class="btn primary" id="sr-dl">Download WebM</button><button type="button" class="btn primary" id="sr-dl-mp4" hidden>Download MP4</button><button type="button" class="btn" id="sr-convert">Convert to MP4</button><button type="button" class="btn" id="sr-again">Record again</button></div>
      <div id="sr-convprog" hidden style="margin-top:14px"><b id="sr-cpl">Converting to MP4... 0%</b><div class="sr-bar"><span id="sr-cpb"></span></div><div class="btns"><button type="button" class="btn" id="sr-cstop">Stop</button></div></div>
    </div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to record your screen</h2>
<ol>
<li><b>Choose your options.</b> Tick computer or tab audio, your microphone, or a webcam circle. Pick a resolution and frame rate.</li>
<li><b>Press Start recording.</b> Your browser asks what to share: the whole screen, one window or one browser tab. Choose one and tick Share audio if you want sound.</li>
<li><b>Wait for the 3 second countdown.</b> Recording starts when it ends. You can pause and resume, and the timer only counts recorded time.</li>
<li><b>Stop and save.</b> Watch the preview, then download the WebM or convert it to MP4 and download that.</li>
</ol></section>
<section class="block prose"><h2>WebM or MP4?</h2>
<p>Browsers record to WebM or, in newer versions, to MP4. A recording made this way often has no duration written into the file, so some players show no length and will not let you skip around. The Convert to MP4 button rewrites the recording in your browser as an MP4 with the correct length. MP4 opens in almost every phone, video editor and chat app.</p></section>
<section class="block prose"><h2>Record with your voice and your face</h2>
<ul>
<li><b>Microphone.</b> Your voice is mixed with the computer or tab audio into one audio track.</li>
<li><b>Webcam circle.</b> Your camera is drawn as a circle in the corner you choose and recorded together with the screen, which suits tutorials and presentations.</li>
<li><b>Which audio can be captured.</b> Tab audio works in Chrome and Edge. Whole screen audio works on Windows and ChromeOS. On a Mac, share a Chrome tab to capture its sound, or use the microphone.</li>
</ul></section>
<section class="block prose"><h2>Tips for a clean recording</h2>
<ul>
<li>Close notifications and private tabs before you start, because the recording shows everything on the shared screen.</li>
<li>Use 30 fps for talks and tutorials. Use 60 fps only for games or animation, as the file is bigger.</li>
<li>Use headphones when you record the microphone and computer audio together, so the speakers do not feed back into the mic.</li>
<li>Long recordings use memory in the tab. For hours of video, record in parts.</li>
</ul></section>'''

PAGE = dict(
    title='Free Screen Recorder Online: Record Screen, No Download',
    desc='Record your screen, a window or a browser tab with sound and a webcam circle. Free, in your browser. Save as WebM or convert to MP4. Nothing is uploaded, no watermark.',
    h1='Free online screen recorder', app='Free Screen Recorder',
    lead='Record your whole screen, one window or one browser tab, with computer sound, your microphone and an optional webcam circle. Save it as WebM or MP4. The recording stays on your computer.',
    tool=TOOL, vendor=[], own=[], module=['srtool.js'], css=['screen-recorder.css'],
    sections=SECTIONS,
    faq=[
        ('Is this screen recorder free?', 'Yes. There is no sign-up, no watermark and no time limit set by the tool.'),
        ('Is my recording uploaded anywhere?', 'No. The recording is made and kept in your browser. It leaves your computer only when you download it.'),
        ('Can I record with sound?', 'Yes. Tick computer or tab audio and tick Share audio in the browser box, and tick the microphone option to add your voice. Both are mixed into one track. Which audio your browser can share depends on the browser and system.'),
        ('Can I add my webcam to the recording?', 'Yes. Tick Show my webcam as a circle and choose a corner. The camera is drawn into the recording itself.'),
        ('How do I get an MP4 instead of WebM?', 'Stop the recording, then press Convert to MP4. The conversion runs in your browser and also writes the correct video length into the file.'),
        ('Does it work on a phone?', 'No. Browsers on phones do not allow web pages to record the screen. Use a laptop or desktop computer with Chrome, Edge or Firefox.'),
        ('Why does the recording have no length in some players?', 'The browser writes a WebM recording as a stream, so the total length is often missing. Convert to MP4 to fix it.')
    ],
    related=['video-compressor', 'video-trimmer', 'video-to-mp3', 'video-converter', 'audio-editor'])
