INFO = dict(slug='video-converter', kicker='Video', tile_title='Video converter',
            tile_desc='Video to anything and anything to video: MP4, WebM, MOV, MKV, MP3, WAV, M4A, OGG and GIF, or turn a song into a video.', nav='Video converter')

TOOL = '''<div class="tool" id="cv-tool">
  <div class="card">
    <div class="scan-drop" id="cv-drop">
      <p style="margin:0 0 12px"><b>Drop a video, audio file or GIF here</b> or choose a file</p>
      <button type="button" class="btn primary" id="cv-pick">Choose file</button>
      <input type="file" id="cv-file" accept="video/*,audio/*,image/gif,.mkv,.mov,.mp4,.webm,.m4a,.wav,.mp3,.ogg,.opus,.flac,.aac,.gif" hidden aria-label="Choose a video, audio or GIF file">
      <p class="help">Video: MP4, MOV, MKV, WebM. Audio: MP3, WAV, M4A, OGG, FLAC. Also animated GIF. Your file stays on your device. Best in Chrome or Edge on a computer.</p>
    </div>

    <div id="cv-controls" hidden>
      <div class="mt-file"><div class="ico" id="cv-ico"></div><div><b id="cv-name"></b><small id="cv-meta"></small></div></div>

      <div class="field"><label id="cv-t-l">Convert to</label>
        <div id="cv-targets" role="group" aria-labelledby="cv-t-l"></div>
      </div>

      <div id="cv-p-video" hidden>
        <div class="field"><label id="cv-pre-l">Made for</label>
          <div class="mt-opts cv-auto" id="cv-preset" role="group" aria-labelledby="cv-pre-l"></div>
        </div>
        <details class="opts" id="cv-more">
          <summary>More settings</summary>
          <div class="field"><label id="cv-q-l">Quality</label>
            <div class="mt-opts" id="cv-q" role="group" aria-labelledby="cv-q-l">
              <button type="button" aria-pressed="false" data-q="high"><b>High</b><small>larger file</small></button>
              <button type="button" aria-pressed="true" data-q="balanced"><b>Balanced</b><small>good size</small></button>
              <button type="button" aria-pressed="false" data-q="small"><b>Small</b><small>smallest file</small></button>
              <button type="button" aria-pressed="false" data-q="copy"><b>Fast copy</b><small>no re-encode</small></button>
            </div>
            <p class="help" id="cv-q-help"></p>
          </div>
          <div class="row2">
            <div class="field"><label for="cv-res">Resolution</label><select id="cv-res"></select></div>
            <div class="field"><label for="cv-codec">Video codec</label><select id="cv-codec"></select></div>
          </div>
        </details>
      </div>

      <div id="cv-p-gifin" hidden>
        <div class="field"><label for="cv-rep">Play the GIF</label>
          <select id="cv-rep"><option value="1">Once</option><option value="2">2 times</option><option value="3" selected>3 times</option><option value="5">5 times</option><option value="10">10 times</option></select>
          <p class="help">A GIF loops forever, a video plays once. Repeat a short GIF so the video is long enough to enjoy. See-through parts become white.</p>
        </div>
      </div>

      <div id="cv-p-audio" hidden>
        <div class="field"><label id="cv-br-l">Bitrate</label>
          <div class="mt-opts" id="cv-br" role="group" aria-labelledby="cv-br-l"></div>
          <p class="help">Higher means better sound and a bigger file. It cannot add detail the original does not have.</p>
        </div>
      </div>

      <div id="cv-p-cover" hidden>
        <div class="field"><label id="cv-cpre-l">Made for</label>
          <div class="mt-opts" id="cv-cpreset" role="group" aria-labelledby="cv-cpre-l"></div>
        </div>
        <div class="field"><label id="cv-size-l">Video size</label>
          <div class="mt-opts three" id="cv-size" role="group" aria-labelledby="cv-size-l"></div>
        </div>
        <div class="field"><label id="cv-bg-l">Background</label>
          <div class="mt-opts two" id="cv-bg" role="group" aria-labelledby="cv-bg-l">
            <button type="button" aria-pressed="true" data-bg="color"><b>Plain colour</b><small>with the title</small></button>
            <button type="button" aria-pressed="false" data-bg="image"><b>Picture</b><small>cover art or photo</small></button>
          </div>
        </div>
        <div id="cv-imgbox" hidden>
          <div class="btns"><button type="button" class="btn" id="cv-imgpick">Choose picture</button><span class="help" id="cv-imgname">No picture chosen yet</span></div>
          <input type="file" id="cv-img" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden aria-label="Choose a cover picture">
          <div class="field" style="margin-top:12px"><label for="cv-fit">Picture fit</label>
            <select id="cv-fit"><option value="cover">Fill the frame (edges may be cut)</option><option value="contain">Show the whole picture</option></select>
          </div>
        </div>
        <div class="field"><label for="cv-title">Title text</label><input type="text" id="cv-title" maxlength="120" autocomplete="off" placeholder="Song or episode name">
          <p class="help">Shown on the video. Leave it empty for no text.</p></div>
        <div class="row2">
          <div class="field"><label for="cv-color">Background colour</label><input type="color" id="cv-color" value="#14213d"></div>
          <div class="field"><label for="cv-tcolor">Text and bar colour</label><input type="color" id="cv-tcolor" value="#ffffff"></div>
        </div>
        <label class="check"><input type="checkbox" id="cv-wave" checked> Add moving sound bars that follow the audio</label>
      </div>

      <div id="cv-p-gif" hidden>
        <div class="row2">
          <div class="field"><label for="cv-gw">GIF width</label><select id="cv-gw"></select></div>
          <div class="field"><label for="cv-gfps">Frames per second</label><select id="cv-gfps"></select></div>
        </div>
        <p class="help">GIFs have no sound and get large quickly. Keep them short: up to 30 seconds. Use Trim below to pick the part you want.</p>
      </div>

      <details class="opts" id="cv-trim">
        <summary>Trim (optional)</summary>
        <div class="mt-time">
          <div class="field"><label for="cv-start">Start</label><input type="text" id="cv-start" inputmode="decimal" placeholder="0:00" autocomplete="off"></div>
          <div class="field"><label for="cv-end">End</label><input type="text" id="cv-end" inputmode="decimal" placeholder="" autocomplete="off"></div>
        </div>
        <div class="mt-clip"><button type="button" class="btn" id="cv-set-start">Set start here</button><button type="button" class="btn" id="cv-set-end">Set end here</button></div>
        <p class="help">Leave both empty to convert everything. Type times like 1:30 or 75.5, or play the file and use the buttons.</p>
      </details>

      <div class="btns" style="margin-top:14px"><button type="button" class="btn primary" id="cv-go">Convert</button><button type="button" class="btn" id="cv-reset">Choose another</button></div>
    </div>
    <p class="help" id="cv-status" role="status"></p>
  </div>

  <div class="card preview" aria-live="polite">
    <div class="mt-stage" id="cv-stage" hidden><video id="cv-video" controls playsinline preload="metadata"></video></div>
    <div id="cv-astage" hidden><audio id="cv-audio" class="mt-audio" controls preload="metadata"></audio></div>
    <div class="cv-pic" id="cv-gstage" hidden><img id="cv-gimg" alt="Your GIF"></div>
    <div class="cv-cover" id="cv-cstage" hidden><canvas id="cv-canvas" width="1080" height="1080" aria-label="Preview of the video picture"></canvas><p class="help">Preview of your video picture</p></div>
    <p class="help" id="cv-empty" style="text-align:center;margin-top:12px">Your file preview appears here</p>

    <div id="cv-progress" hidden style="margin-top:16px"><b id="cv-pl">Converting... 0%</b><div class="mt-bar" id="cv-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="cv-pb"></span></div><p class="help">Keep this tab open. Everything runs on your device.</p><div class="btns"><button type="button" class="btn" id="cv-stop">Stop</button></div></div>

    <div id="cv-result" hidden style="margin-top:16px">
      <div class="mt-res"><div><small>Before</small><b id="cv-before"></b></div><span class="save" id="cv-save"></span><div><small>After</small><b id="cv-after"></b></div></div>
      <div class="mt-stage" id="cv-rvstage" hidden><video id="cv-rvideo" controls playsinline></video></div>
      <audio id="cv-raudio" class="mt-audio" controls hidden></audio>
      <div class="cv-pic" id="cv-rgstage" hidden><img id="cv-rimg" alt="Your new GIF"></div>
      <p class="help" id="cv-note"></p>
      <div class="mt-parts" id="cv-parts" style="margin-top:12px"></div>
      <div class="btns" style="margin-top:12px"><button type="button" class="btn" id="cv-again">Convert another file</button><button type="button" class="btn" id="cv-other">Same file, other format</button></div>
    </div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to convert a file</h2>
<ol>
<li><b>Add your file.</b> Drop a video, an audio file or a GIF on the box, or choose a file. The tool checks what is inside and only shows the outputs that make sense.</li>
<li><b>Pick what you want.</b> Choose a video format, an audio format such as MP3, a GIF, or a video made from your song.</li>
<li><b>Choose where it is going.</b> Pick WhatsApp, Instagram, YouTube or Smaller file and the right settings are set for you. Open More settings if you want to choose the quality, resolution and codec yourself.</li>
<li><b>Trim if you want only part of it (optional).</b> Type a start and end time, or play the file and press Set start here and Set end here.</li>
<li><b>Convert and download.</b> The tool shows the new size, lets you play the result, and lets you save it.</li>
</ol></section>
<section class="block prose"><h2>What you can convert</h2>
<ul>
<li><b>Video to video:</b> MP4, WebM, MOV and MKV, with a choice of resolution, quality and codec.</li>
<li><b>Video to MP3 and other audio:</b> pull the sound out of a video and save it as MP3, WAV, M4A (AAC) or OGG (Opus).</li>
<li><b>Audio to audio:</b> turn WAV, FLAC, M4A or OGG into MP3, or MP3 into WAV, and so on.</li>
<li><b>MP3 to video:</b> make an MP4 from a song, podcast or voice note, with your cover picture or a plain colour and the title, and moving sound bars if you like. Sizes are 1080 x 1080, 1920 x 1080 and 1080 x 1920.</li>
<li><b>Video to GIF:</b> make a short looping GIF from part of a video.</li>
<li><b>GIF to MP4:</b> turn an animated GIF into a small MP4 that plays on WhatsApp, Instagram and every phone.</li>
</ul></section>
<section class="block prose"><h2>How to convert a video to MP3</h2>
<ol>
<li>Drop your video on the box.</li>
<li>Under Convert to, pick <b>MP3</b>.</li>
<li>Pick a bitrate. 192 kbps is a good balance. Use 320 kbps for the best quality, or 128 kbps for the smallest file.</li>
<li>Trim it if you only want part of the sound, then press Convert and download your MP3.</li>
</ol></section>
<section class="block prose"><h2>Which bitrate should I choose for MP3?</h2>
<ul>
<li><b>128 kbps:</b> small files, fine for speech, podcasts and lectures.</li>
<li><b>192 kbps:</b> a good all round choice for music and everyday use.</li>
<li><b>256 kbps:</b> high quality music that is still easy to share.</li>
<li><b>320 kbps:</b> the highest MP3 quality, with the largest file.</li>
</ul>
<p>A higher bitrate cannot add detail that is missing from the original sound. If the video has low quality audio, 320 kbps only makes a bigger file.</p></section>
<section class="block prose"><h2>How to turn an MP3 into a video</h2>
<ol>
<li>Drop your MP3, WAV, M4A, OGG or FLAC file on the box and pick <b>MP4 video</b>.</li>
<li>Choose where it is going: WhatsApp and Smaller file make a square video, Instagram makes a tall video for Reels, YouTube makes a wide video.</li>
<li>Choose a picture, such as your cover art, or keep a plain colour with the title text.</li>
<li>Leave the moving sound bars on if you want the picture to move with the sound, then press Make the video.</li>
</ol></section>
<section class="block prose"><h2>Which format should I choose?</h2>
<ul>
<li><b>MP4:</b> the safest choice for phones, computers, TVs and social media.</li>
<li><b>WebM:</b> made for the web, with VP9 or AV1 video. Good for video on your own website.</li>
<li><b>MOV:</b> the format used by Apple devices and many editing programs.</li>
<li><b>MKV:</b> a flexible container that many players and editors accept.</li>
<li><b>MP3:</b> small audio that plays everywhere. <b>WAV</b> is uncompressed and large, good for editing. <b>M4A</b> uses AAC and suits iPhone and Apple Music. <b>OGG</b> uses Opus and makes very small files.</li>
<li><b>GIF:</b> short, silent and loops. For anything longer than a few seconds, MP4 is much smaller.</li>
</ul></section>
<section class="block prose"><h2>What are Fast copy and the video codec?</h2>
<p>Fast copy moves the video into the new container without re-encoding it. It is quick and loses no quality, but it only works when the new container supports the video inside, and it ignores the resolution and codec you chose. Otherwise the tool re-encodes the video.</p>
<p>The codec is how the picture is compressed. H.264 is the default because it plays everywhere. VP9 usually makes smaller files for the web. AV1 can be smaller still but encodes slowly, and it is only shown when your browser can encode it.</p></section>
<section class="block prose"><h2>Common uses</h2>
<ul>
<li>Save a lecture, interview or talk as MP3 to listen to on the go.</li>
<li>Post a song or podcast episode on YouTube, Instagram or WhatsApp as a video with your cover art.</li>
<li>Turn a screen recording into an MP4 that plays everywhere, or a short GIF for a chat or a help page.</li>
<li>Make a GIF small enough to send by turning it into an MP4.</li>
<li>Convert a WAV recording to MP3 to make it easy to email.</li>
</ul>
<p>Use Chrome or Edge on a computer for the best speed, and keep the tab open while it works. To make a video smaller to an exact size, use the free video compressor. Only convert files you made or have permission to use.</p></section>'''

PAGE = dict(
    title='Video Converter and Video to MP3: Free Online, No Upload',
    desc='Free online video converter: video to MP4, WebM, MOV, MKV, GIF, or video to MP3, WAV, M4A and OGG. Turn an MP3 into a video with a cover picture. Runs in your browser, nothing is uploaded.',
    h1='Free video converter', app='Free Video Converter',
    lead='Video to anything and anything to video. Convert video to MP4, WebM, MOV or MKV, save the sound as MP3, WAV, M4A or OGG, make a GIF, or turn a song into a video with your cover picture. It all runs in your browser, so your file is never uploaded.',
    tool=TOOL, vendor=[], own=[], module=['convtool.js'], css=['media-tools.css', 'converter.css'],
    sections=SECTIONS,
    faq=[
        ('Is this video converter free?', 'Yes. There is no sign-up, no watermark and no limit on how many files you convert.'),
        ('Is my file uploaded to a server?', 'No. The conversion runs inside your browser on your own computer, so the file never leaves your device.'),
        ('How do I convert a video to MP3?', 'Drop the video on the box, pick MP3 under Convert to, choose a bitrate and press Convert. You can trim the start and end first if you only want part of the sound.'),
        ('Which video and audio files can I convert?', 'Videos in MP4, MOV, MKV and WebM, audio files in MP3, WAV, M4A, OGG and FLAC, and animated GIFs. If your browser cannot read the sound or picture inside a file, the tool tells you.'),
        ('What bitrate should I pick for MP3?', 'Use 192 kbps for a good balance of quality and size, 128 kbps for speech and the smallest file, and 320 kbps for the best quality.'),
        ('Can I save only part of the audio or video?', 'Yes. Open Trim, type a start and end time, or play the file and press Set start here and Set end here. Leave them empty to convert the whole file.'),
        ('Can I save the audio as WAV instead?', 'Yes. Choose WAV for an uncompressed file that is easy to edit in other programs. WAV files are much larger than MP3.'),
        ('Can I turn an MP3 into a video for YouTube or Instagram?', 'Yes. Drop the MP3, pick MP4 video, choose YouTube (1920 x 1080), Instagram (1080 x 1920) or a square video, and add your cover picture or a plain colour with the title. You can add moving sound bars too.'),
        ('Can I make a GIF from a video?', 'Yes. Pick GIF, choose the width and frames per second, and trim the part you want. GIFs can be up to 30 seconds long. GIFs have no sound.'),
        ('What does Fast copy mean?', 'It moves the video into the new container without re-encoding it, so it is quick and keeps the quality. It only works when the new container supports the video codec, and it ignores the resolution and codec settings.'),
        ('Which video codec should I use?', 'Use H.264 for the widest support. VP9 is good for the web and often smaller. AV1 is shown only if your browser can encode it, and it is slow.'),
        ('Why does conversion take a few minutes?', 'Your own computer does the work, so a long HD video takes a while. Chrome and Edge on a computer with a graphics card are fastest.'),
        ('Which browsers work?', 'Use Chrome, Edge or another up to date Chromium browser on a computer. Browsers without video encoding support show a message instead. GIF to MP4 also needs Chrome or Edge.')],
    related=['video-compressor', 'video-trimmer', 'video-editor', 'screen-recorder', 'audio-mastering', 'image-converter'])
