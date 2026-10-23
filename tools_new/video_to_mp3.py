INFO = dict(slug='video-to-mp3', kicker='Audio', tile_title='Video to MP3',
            tile_desc='Pull the sound out of any video and save it as MP3 or WAV. Choose the bitrate, trim if you like.', nav='Video to MP3')

TOOL = '''<div class="tool" id="m3-tool">
  <div class="card">
    <div class="scan-drop" id="m3-drop">
      <p style="margin:0 0 12px"><b>Drop a video or audio file here</b> or choose a file</p>
      <button type="button" class="btn primary" id="m3-pick">Choose file</button>
      <input type="file" id="m3-file" accept="video/*,audio/*,.mkv,.mov,.mp4,.webm,.m4a,.wav,.mp3,.ogg,.flac,.aac" hidden aria-label="Choose a video or audio file">
      <p class="help">MP4, MOV, MKV, WebM, or audio like WAV, M4A and OGG. Large files are fine. Best in Chrome or Edge on a computer.</p>
    </div>

    <div id="m3-controls" hidden>
      <div class="mt-file"><div class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><div><b id="m3-name"></b><small id="m3-meta"></small></div></div>

      <div class="field"><label id="m3-fmt-l">Output format</label>
        <div class="mt-opts two" id="m3-fmt" role="group" aria-labelledby="m3-fmt-l">
          <button type="button" aria-pressed="true" data-fmt="mp3"><b>MP3</b><small>small, plays everywhere</small></button>
          <button type="button" aria-pressed="false" data-fmt="wav"><b>WAV</b><small>uncompressed, large</small></button>
        </div>
      </div>

      <div class="field" id="m3-br-wrap"><label id="m3-br-l">MP3 bitrate</label>
        <div class="mt-opts" id="m3-br" role="group" aria-labelledby="m3-br-l">
          <button type="button" aria-pressed="false" data-kbps="128"><b>128</b><small>kbps, small</small></button>
          <button type="button" aria-pressed="true" data-kbps="192"><b>192</b><small>kbps, good</small></button>
          <button type="button" aria-pressed="false" data-kbps="256"><b>256</b><small>kbps, great</small></button>
          <button type="button" aria-pressed="false" data-kbps="320"><b>320</b><small>kbps, best</small></button>
        </div>
      </div>

      <div class="field"><label>Trim (optional)</label>
        <div class="mt-time">
          <div class="field"><label for="m3-start">Start</label><input type="text" id="m3-start" inputmode="decimal" placeholder="0:00" autocomplete="off"></div>
          <div class="field"><label for="m3-end">End</label><input type="text" id="m3-end" inputmode="decimal" placeholder="" autocomplete="off"></div>
        </div>
        <div class="mt-clip"><button type="button" class="btn" id="m3-set-start">Set start here</button><button type="button" class="btn" id="m3-set-end">Set end here</button></div>
        <p class="help">Leave both empty to convert everything. You can type times like 1:30 or 75.5, or play the file and use the buttons.</p>
      </div>

      <div class="btns" style="margin-top:14px"><button type="button" class="btn primary" id="m3-go">Convert to MP3</button><button type="button" class="btn" id="m3-reset">Choose another</button></div>
    </div>
    <p class="help" id="m3-status" role="status"></p>
  </div>

  <div class="card preview" aria-live="polite">
    <div id="m3-playwrap" hidden><audio id="m3-player" class="mt-audio" controls preload="metadata"></audio></div>
    <p class="help" id="m3-empty" style="text-align:center;margin-top:12px">Your file appears here</p>

    <div id="m3-progress" hidden style="margin-top:16px"><b id="m3-pl">Working... 0%</b><div class="mt-bar" id="m3-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="m3-pb"></span></div><p class="help">Keep this tab open. Everything runs on your device.</p><div class="btns"><button type="button" class="btn" id="m3-stop">Stop</button></div></div>

    <div id="m3-result" hidden style="margin-top:16px">
      <div class="mt-res"><div><small>Length</small><b id="m3-dur"></b></div><span class="save" id="m3-fmtout"></span><div><small>File size</small><b id="m3-size"></b></div></div>
      <audio id="m3-result-player" class="mt-audio" controls></audio>
      <div class="mt-parts" id="m3-parts" style="margin-top:12px"></div>
      <div class="btns" style="margin-top:12px"><button type="button" class="btn" id="m3-again">Convert another</button></div>
    </div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to convert a video to MP3</h2>
<ol>
<li><b>Add your file.</b> Drop a video on the box or choose a file. Audio files like WAV and M4A work too.</li>
<li><b>Pick MP3 or WAV and a bitrate.</b> 192 kbps is a good balance. Use 320 kbps for the best quality, or 128 kbps for the smallest file.</li>
<li><b>Trim if you want only part of it (optional).</b> Type a start and end time, or play the file and press Set start here and Set end here.</li>
<li><b>Convert and download.</b> The tool shows the length and size of your MP3, plays it back, and lets you save it.</li>
</ol></section>
<section class="block prose"><h2>Which bitrate should I choose?</h2>
<ul>
<li><b>128 kbps:</b> small files, fine for speech, podcasts and lectures.</li>
<li><b>192 kbps:</b> a good all round choice for music and everyday use.</li>
<li><b>256 kbps:</b> high quality music that is still easy to share.</li>
<li><b>320 kbps:</b> the highest MP3 quality, with the largest file.</li>
</ul>
<p>A higher bitrate cannot add detail that is missing from the original sound. If the video has low quality audio, 320 kbps only makes a bigger file.</p></section>
<section class="block prose"><h2>MP3 or WAV?</h2>
<p>MP3 is small and plays on every phone, computer and car stereo. WAV is uncompressed, so the file is much larger, but it is a good choice when you plan to edit the audio further in another program.</p></section>
<section class="block prose"><h2>Common uses</h2>
<ul>
<li>Save a lecture, interview or talk as audio to listen to on the go.</li>
<li>Pull the music or voice track out of your own video clip.</li>
<li>Turn a screen recording or meeting recording into a small audio file.</li>
<li>Convert a WAV recording to MP3 to make it easy to email.</li>
</ul>
<p>Only convert audio from videos you made or have permission to use.</p></section>'''

PAGE = dict(
    title='Video to MP3 Converter: Extract Audio Online, Free',
    desc='Convert a video to MP3 online, free. Extract the audio from MP4, MOV, MKV or WebM, choose 128 to 320 kbps, trim it, or save WAV. Runs in your browser, nothing is uploaded.',
    h1='Free video to MP3 converter', app='Free Video to MP3 Converter',
    lead='Pull the sound out of any video and save it as an MP3 or WAV file. Choose the bitrate and trim the start and end if you like. It runs in your browser, so your file is never uploaded.',
    tool=TOOL, vendor=[], own=[], module=['mp3tool.js'], css=['media-tools.css'],
    sections=SECTIONS,
    faq=[
        ('Is this video to MP3 converter free?', 'Yes. There is no sign-up, no watermark and no limit on how many files you convert.'),
        ('Is my video uploaded to a server?', 'No. The audio is extracted inside your browser using your own computer, so the file never leaves your device.'),
        ('Which video and audio files can I convert?', 'MP4, MOV, MKV and WebM videos, and audio files such as WAV, M4A, OGG, FLAC and MP3. If your browser cannot read the audio inside a file, the tool tells you.'),
        ('What bitrate should I pick for MP3?', 'Use 192 kbps for a good balance of quality and size, 128 kbps for speech and the smallest file, and 320 kbps for the best quality.'),
        ('Can I save only part of the audio?', 'Yes. Type a start and end time, or play the file and press Set start here and Set end here. Leave them empty to convert the whole file.'),
        ('Can I save the audio as WAV instead?', 'Yes. Choose WAV for an uncompressed file that is easy to edit in other programs. WAV files are much larger than MP3.'),
        ('Which browsers work?', 'Use Chrome, Edge or another up to date Chromium browser on a computer. Older browsers and some phones cannot do the conversion and will show a message.')],
    related=['video-converter', 'video-trimmer', 'video-compressor', 'audio-editor', 'screen-recorder'])
