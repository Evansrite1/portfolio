INFO = dict(slug='video-converter', kicker='Video', tile_title='Video converter',
            tile_desc='Convert video between MP4, WebM, MKV and MOV, or save the audio as MP3 or WAV.', nav='Video converter')

TOOL = '''<div class="tool" id="cv-tool">
  <div class="card">
    <div class="scan-drop" id="cv-drop">
      <p style="margin:0 0 12px"><b>Drop a video here</b> or choose a file</p>
      <button type="button" class="btn primary" id="cv-pick">Choose video</button>
      <input type="file" id="cv-file" accept="video/*,audio/*,.mkv,.mov,.mp4,.webm" hidden aria-label="Choose a video file">
      <p class="help">MP4, MOV, MKV or WebM. Large files are fine. Best in Chrome or Edge on a computer.</p>
    </div>

    <div id="cv-controls" hidden>
      <div class="mt-file"><div class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-3v10l-6-3z"/></svg></div><div><b id="cv-name"></b><small id="cv-meta"></small></div></div>

      <div class="field"><label id="cv-fmt-l">Convert to</label>
        <div class="mt-opts three" id="cv-fmt" role="group" aria-labelledby="cv-fmt-l">
          <button type="button" aria-pressed="true" data-fmt="mp4"><b>MP4</b><small>works everywhere</small></button>
          <button type="button" aria-pressed="false" data-fmt="webm"><b>WebM</b><small>web video</small></button>
          <button type="button" aria-pressed="false" data-fmt="mkv"><b>MKV</b><small>flexible container</small></button>
          <button type="button" aria-pressed="false" data-fmt="mov"><b>MOV</b><small>Apple and editors</small></button>
          <button type="button" aria-pressed="false" data-fmt="mp3"><b>MP3</b><small>audio only</small></button>
          <button type="button" aria-pressed="false" data-fmt="wav"><b>WAV</b><small>audio, uncompressed</small></button>
        </div>
      </div>

      <div id="cv-video-opts">
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
      </div>

      <div class="field" id="cv-mp3-opts" hidden><label for="cv-kbps">MP3 bitrate</label>
        <select id="cv-kbps"><option value="128">128 kbps (small)</option><option value="192" selected>192 kbps (good)</option><option value="256">256 kbps (great)</option><option value="320">320 kbps (best)</option></select>
      </div>

      <div class="btns" style="margin-top:14px"><button type="button" class="btn primary" id="cv-go">Convert to MP4</button><button type="button" class="btn" id="cv-reset">Choose another</button></div>
    </div>
    <p class="help" id="cv-status" role="status"></p>
  </div>

  <div class="card preview" aria-live="polite">
    <div class="mt-stage" id="cv-stage" hidden><video id="cv-video" controls playsinline preload="metadata"></video></div>
    <div class="mt-stage" id="cv-rstage" hidden><video id="cv-result-preview" controls playsinline></video></div>
    <p class="help" id="cv-empty" style="text-align:center;margin-top:12px">Your video preview appears here</p>

    <div id="cv-progress" hidden style="margin-top:16px"><b id="cv-pl">Converting... 0%</b><div class="mt-bar" id="cv-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="cv-pb"></span></div><p class="help">Keep this tab open. Everything runs on your device.</p><div class="btns"><button type="button" class="btn" id="cv-stop">Stop</button></div></div>

    <div id="cv-result" hidden style="margin-top:16px">
      <div class="mt-res"><div><small>Before</small><b id="cv-before"></b></div><span class="save" id="cv-save"></span><div><small>After</small><b id="cv-after"></b></div></div>
      <p class="help" id="cv-note"></p>
      <div class="mt-parts" id="cv-parts"></div>
      <div class="btns" style="margin-top:12px"><button type="button" class="btn" id="cv-again">Convert another</button></div>
    </div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to convert a video</h2>
<ol>
<li><b>Add your video.</b> Drop it on the box or choose a file.</li>
<li><b>Pick the new format.</b> MP4 plays almost everywhere. WebM suits websites. MKV and MOV suit editors and players. Pick MP3 or WAV to keep only the sound.</li>
<li><b>Choose the quality.</b> High keeps the most detail, Balanced is a good default, Small makes the smallest file. You can also lower the resolution to 1080p, 720p or 480p.</li>
<li><b>Convert and download.</b> The tool shows the new size and lets you play the result before you save it.</li>
</ol></section>
<section class="block prose"><h2>Which format should I choose?</h2>
<ul>
<li><b>MP4:</b> the safest choice for phones, computers, TVs and social media.</li>
<li><b>WebM:</b> made for the web, with VP9 or AV1 video. Good for video on your own website.</li>
<li><b>MKV:</b> a flexible container that many players and editors accept.</li>
<li><b>MOV:</b> the format used by Apple devices and many editing programs.</li>
<li><b>MP3 or WAV:</b> audio only. MP3 is small, WAV is uncompressed.</li>
</ul></section>
<section class="block prose"><h2>What are Fast copy and the video codec?</h2>
<p>Fast copy moves the video into the new container without re-encoding it. It is quick and loses no quality, but it only works when the new container supports the video inside, and it ignores the resolution and codec you chose. Otherwise the tool re-encodes the video.</p>
<p>The codec is how the picture is compressed. H.264 is the default because it plays everywhere. VP9 usually makes smaller files for the web. AV1 can be smaller still but encodes slowly, and it is only shown when your browser can encode it.</p></section>
<section class="block prose"><h2>Tips for the best result</h2>
<ul>
<li>Use Chrome or Edge on a computer. Phones and older browsers may not be able to convert video.</li>
<li>Keep the tab open and let your computer stay awake while it works.</li>
<li>To make a video smaller, use the free video compressor, which lets you set an exact file size.</li>
<li>Only convert videos you made or have permission to use.</li>
</ul></section>'''

PAGE = dict(
    title='Video Converter: MP4, WebM, MKV, MOV and MP3, Free Online',
    desc='Convert video between MP4, WebM, MKV and MOV online, free, or extract MP3 and WAV audio. Choose resolution, quality and codec. Runs in your browser, nothing is uploaded.',
    h1='Free video converter', app='Free Video Converter',
    lead='Convert a video to MP4, WebM, MKV or MOV, or save just the audio as MP3 or WAV. Choose the resolution, quality and codec. It all runs in your browser, so your video is never uploaded.',
    tool=TOOL, vendor=[], own=[], module=['convtool.js'], css=['media-tools.css'],
    sections=SECTIONS,
    faq=[
        ('Is this video converter free?', 'Yes. There is no sign-up, no watermark and no limit on how many videos you convert.'),
        ('Is my video uploaded to a server?', 'No. The conversion runs inside your browser on your own computer, so the video never leaves your device.'),
        ('Which formats can I convert between?', 'You can add MP4, MOV, MKV and WebM videos and convert them to MP4, WebM, MKV or MOV. You can also save the audio as MP3 or WAV.'),
        ('What does Fast copy mean?', 'It moves the video into the new container without re-encoding it, so it is quick and keeps the quality. It only works when the new container supports the video codec, and it ignores the resolution and codec settings.'),
        ('Which video codec should I use?', 'Use H.264 for the widest support. VP9 is good for the web and often smaller. AV1 is shown only if your browser can encode it, and it is slow.'),
        ('Why does conversion take a few minutes?', 'Your own computer does the work, so a long HD video takes a while. Chrome and Edge on a computer with a graphics card are fastest.'),
        ('Which browsers work?', 'Use Chrome, Edge or another up to date Chromium browser on a computer. Browsers without video encoding support show a message instead.')],
    related=['video-compressor', 'video-trimmer', 'video-to-mp3', 'screen-recorder', 'image-converter'])
