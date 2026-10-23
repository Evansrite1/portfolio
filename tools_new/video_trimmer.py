INFO = dict(slug='video-trimmer', kicker='Video', tile_title='Video trimmer',
            tile_desc='Cut a video in seconds without re-encoding. Keep a selection or split it into two parts.', nav='Video trimmer')

TOOL = '''<div class="tool" id="vt-tool">
  <div class="card">
    <div class="scan-drop" id="vt-drop">
      <p style="margin:0 0 12px"><b>Drop a video here</b> or choose a file</p>
      <button type="button" class="btn primary" id="vt-pick">Choose video</button>
      <input type="file" id="vt-file" accept="video/*,.mkv,.mov,.mp4,.webm" hidden aria-label="Choose a video file">
      <p class="help">MP4, MOV, MKV or WebM. Large files are fine. Best in Chrome or Edge on a computer.</p>
    </div>

    <div id="vt-controls" hidden>
      <div class="mt-file"><div class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/></svg></div><div><b id="vt-name"></b><small id="vt-meta"></small></div></div>

      <div class="field"><label id="vt-mode-l">What do you want to do?</label>
        <div class="mt-opts two" id="vt-mode" role="group" aria-labelledby="vt-mode-l">
          <button type="button" aria-pressed="true" data-mode="keep"><b>Keep a selection</b><small>cut off the start and end</small></button>
          <button type="button" aria-pressed="false" data-mode="split"><b>Split into two parts</b><small>cut at one point</small></button>
        </div>
      </div>

      <div class="field" id="vt-keep-wrap">
        <div class="mt-line" id="vt-line"><div class="mt-sel" id="vt-sel"></div><div class="mt-head" id="vt-head"></div><button type="button" class="mt-handle" id="vt-h-start" role="slider" aria-label="Start of the selection" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"></button><button type="button" class="mt-handle" id="vt-h-end" role="slider" aria-label="End of the selection" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"></button></div>
        <div class="mt-times"><span id="vt-t-start">Start 0:00.0</span><span id="vt-len"></span><span id="vt-t-end"></span></div>
        <div class="mt-clip"><button type="button" class="btn" id="vt-set-start">Set start here</button><button type="button" class="btn" id="vt-set-end">Set end here</button></div>
        <p class="help">Drag the handles, or play the video and use the buttons. With a handle selected, the arrow keys move it by 0.1 seconds (hold Shift for 1 second).</p>
      </div>

      <div class="field" id="vt-split-wrap" hidden>
        <div class="mt-line" id="vt-line2"><div class="mt-head" id="vt-head2"></div><div class="mt-cut" id="vt-cutmark"></div></div>
        <div class="field" style="margin-top:12px"><label for="vt-cut">Split at <b id="vt-cut-v"></b></label><input type="range" id="vt-cut" min="0" max="100" step="0.1" value="50"></div>
        <div class="mt-clip"><button type="button" class="btn" id="vt-set-cut">Split at current position</button></div>
        <p class="help" id="vt-split-help">You get two videos: from the start to the split point, and from the split point to the end.</p>
      </div>

      <div class="mt-switch"><span><b>Exact cut (re-encode)</b><br><small class="help" style="margin:0" id="vt-exact-help">Off: instant and lossless, but cuts snap to the nearest keyframe before your point. On: frame accurate, but slower and it re-encodes the video.</small></span><input type="checkbox" id="vt-exact" aria-label="Exact cut with re-encode"></div>

      <div class="btns" style="margin-top:14px"><button type="button" class="btn primary" id="vt-go">Trim video</button><button type="button" class="btn" id="vt-reset">Choose another</button></div>
    </div>
    <p class="help" id="vt-status" role="status"></p>
  </div>

  <div class="card preview" aria-live="polite">
    <div class="mt-stage" id="vt-stage" hidden><video id="vt-video" controls playsinline preload="metadata"></video></div>
    <div class="mt-stage" id="vt-rstage" hidden><video id="vt-result-preview" controls playsinline></video></div>
    <p class="help" id="vt-empty" style="text-align:center;margin-top:12px">Your video preview appears here</p>

    <div id="vt-progress" hidden style="margin-top:16px"><b id="vt-pl">Working... 0%</b> <span class="help" id="vt-pt"></span><div class="mt-bar" id="vt-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="vt-pb"></span></div><p class="help">Keep this tab open. Everything runs on your device.</p><div class="btns"><button type="button" class="btn" id="vt-stop">Stop</button></div></div>

    <div id="vt-result" hidden style="margin-top:16px">
      <div class="mt-res"><div><small>Original</small><b id="vt-before"></b></div><span class="save" id="vt-save"></span><div><small>Result</small><b id="vt-after"></b></div></div>
      <p class="help" id="vt-note"></p>
      <div class="mt-parts" id="vt-parts"></div>
      <div class="btns" style="margin-top:12px"><button type="button" class="btn" id="vt-again">Trim another</button></div>
    </div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to trim a video</h2>
<ol>
<li><b>Add your video.</b> Drop it on the box or choose a file. Nothing is uploaded.</li>
<li><b>Choose Keep a selection or Split into two parts.</b> To remove the start and end, keep a selection. To make two files from one, split.</li>
<li><b>Set your points.</b> Drag the handles on the timeline, or play the video and press Set start here and Set end here.</li>
<li><b>Trim and download.</b> A lossless cut is almost instant. Save your trimmed MP4 (or the same type of file you added).</li>
</ol></section>
<section class="block prose"><h2>Lossless cut or exact cut?</h2>
<p>By default the tool copies the video as it is and does not re-encode it. That is fast, even for a very large file, and the picture quality does not change at all. The catch is that a video can only be cut cleanly at a keyframe, a full picture that the frames after it depend on. So a lossless cut snaps to the nearest keyframe before the point you chose, which can be a second or two earlier. The result tells you where the cut really starts.</p>
<p>If you need the cut on the exact frame, turn on <b>Exact cut (re-encode)</b>. The tool then re-encodes the video, which takes longer and slightly changes the picture quality, but starts exactly where you said.</p></section>
<section class="block prose"><h2>Split a video into two parts</h2>
<p>Choose Split into two parts, move the split point, and you get two separate videos: everything before the point, and everything after it. This helps with upload limits and with sharing a long recording in pieces. In lossless mode the split point snaps to a keyframe, and the second part starts exactly where the first one ends, so nothing is lost or repeated.</p></section>
<section class="block prose"><h2>Tips</h2>
<ul>
<li>Use Chrome or Edge on a computer. Phones and older browsers are not supported.</li>
<li>Keep the tab open until the download buttons appear.</li>
<li>The result keeps the same type of file as the original when it can (MP4, MOV, MKV or WebM).</li>
<li>To make a big video smaller as well, use the free video compressor.</li>
</ul></section>'''

PAGE = dict(
    title='Video Trimmer: Cut and Trim Video Online, Free, No Upload',
    desc='Trim or split a video online, free. Instant lossless cuts with no re-encoding, or an exact frame cut. Keep a selection or cut into two parts. Runs in your browser, nothing is uploaded.',
    h1='Free video trimmer', app='Free Video Trimmer',
    lead='Cut the start and end off a video, or split it into two parts. The default cut is lossless and almost instant, with no re-encoding. It all runs in your browser, so your video is never uploaded.',
    tool=TOOL, vendor=[], own=[], module=['trimtool.js'], css=['media-tools.css'],
    sections=SECTIONS,
    faq=[
        ('Is this video trimmer free?', 'Yes. There is no sign-up, no watermark and no limit on how many videos you trim.'),
        ('Is my video uploaded to a server?', 'No. The cut happens inside your browser on your own computer, so the video never leaves your device.'),
        ('Why is the lossless cut so fast?', 'It does not re-encode the video. It copies the existing data for the part you keep, so even a large file is cut in seconds and the picture quality stays exactly the same.'),
        ('Why does my cut start a little earlier than I chose?', 'A video can only be cut without re-encoding at a keyframe. The lossless cut starts at the nearest keyframe before your start point. If you need the exact frame, turn on Exact cut (re-encode).'),
        ('What does Exact cut (re-encode) do?', 'It decodes and re-encodes the video so the cut lands on the exact frame you chose. It takes longer and the video is compressed again, so it is slightly different from the original.'),
        ('Can I split a video into two parts?', 'Yes. Choose Split into two parts and move the split point. You get two files, one before the point and one after it.'),
        ('Which files and browsers work?', 'You can add MP4, MOV, MKV and WebM videos. Use Chrome, Edge or another up to date Chromium browser on a computer. The result keeps the same file type when possible.')],
    related=['video-compressor', 'video-converter', 'video-to-mp3', 'screen-recorder', 'remove-background'])
