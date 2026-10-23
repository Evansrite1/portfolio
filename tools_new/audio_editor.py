INFO = dict(slug='audio-editor', kicker='Audio', tile_title='Audio editor and recorder',
            tile_desc='Multi-track audio editor. Import stems, edit, record over them and export WAV, MP3 or a ZIP.', nav='Audio editor')

TOOL = r'''<div class="tool ae-tool" id="ae-tool">
  <p class="ae-desk">Built for a computer with Chrome or Edge. Phones can open it, but editing is much easier with a mouse and keyboard.</p>

  <div class="card">
    <div class="scan-drop ae-drop" id="ae-drop">
      <p style="margin:0 0 12px"><b>Drop audio files here</b> or choose them. Each file becomes its own track.</p>
      <div class="btns"><button type="button" class="btn primary" id="ae-pick">Add audio files</button></div>
      <input type="file" id="ae-file" accept="audio/*,video/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.oga,.opus,.aif,.aiff,.aifc,.mp4,.webm" multiple aria-label="Choose audio files">
      <p class="help">WAV, MP3, M4A, AAC, FLAC, OGG, Opus and AIFF. Audio from a video file also works. Files are read in your browser and never uploaded.</p>
    </div>
    <p class="ae-note">Audacity project files (.aup3) and Reaper project files (.rpp) cannot be opened, because they only describe a project. Export your tracks from Audacity or Reaper as WAV stems, then add those WAV files here.</p>

    <div class="ae-clipbar-t" style="margin-top:20px">Transport</div>
    <div class="ae-bar" role="toolbar" aria-label="Transport and zoom">
      <button type="button" class="btn" id="ae-home" title="Go to start (Home)">Start</button>
      <button type="button" class="btn primary" id="ae-play" title="Play or pause (Space)">Play</button>
      <button type="button" class="btn" id="ae-stop" title="Stop">Stop</button>
      <button type="button" class="btn rec" id="ae-rec2" title="Record a new track (R)">Record</button>
      <button type="button" class="btn" id="ae-loop" aria-pressed="false" title="Loop the whole project (L)">Loop</button>
      <span class="ae-time" id="ae-time" aria-live="off">00:00.000 <small>/ 00:00.000</small></span>
      <span class="sep"></span>
      <button type="button" class="btn" id="ae-zout" aria-label="Zoom out">Zoom out</button>
      <button type="button" class="btn" id="ae-zin" aria-label="Zoom in">Zoom in</button>
      <button type="button" class="btn" id="ae-fit" title="Fit the whole project in view">Fit</button>
      <label class="check"><input type="checkbox" id="ae-follow" checked> Follow playhead</label>
      <span class="grow"></span>
      <button type="button" class="btn" id="ae-undo" disabled>Undo</button>
      <button type="button" class="btn" id="ae-redo" disabled>Redo</button>
      <button type="button" class="btn" id="ae-clear" disabled>Clear all</button>
    </div>

    <div class="ae-timeline" id="ae-timeline">
      <div class="ae-heads" id="ae-heads"><div class="spacer">Tracks</div></div>
      <div class="ae-scroll" id="ae-scroll"><div class="ae-inner" id="ae-inner"><canvas class="ae-canvas" id="ae-canvas" tabindex="0" role="application" aria-label="Timeline. Click to place the playhead. Drag a clip to move it. Drag a clip edge to trim it. Press Space to play, S to split, Delete to remove the selected clip."></canvas></div></div>
    </div>

    <div class="ae-clipbar-t">Selected clip</div>
    <div class="ae-clipbar" id="ae-clipbar" role="group" aria-label="Edit the selected clip">
      <button type="button" class="btn" id="ae-split" title="Split at the playhead (S)" disabled>Split at playhead</button>
      <button type="button" class="btn" id="ae-dup" disabled>Duplicate</button>
      <button type="button" class="btn" id="ae-del" title="Delete (Delete key)" disabled>Delete clip</button>
      <button type="button" class="btn" id="ae-rev" disabled>Reverse</button>
      <button type="button" class="btn" id="ae-norm" title="Raise or lower the clip so its loudest point is about -0.2 dB" disabled>Normalize</button>
      <div class="f"><label for="ae-gain">Gain (dB)</label><input type="number" id="ae-gain" step="0.5" min="-60" max="24" value="0" disabled></div>
      <div class="f"><label for="ae-fin">Fade in (s)</label><input type="number" id="ae-fin" step="0.1" min="0" value="0" disabled></div>
      <div class="f"><label for="ae-fout">Fade out (s)</label><input type="number" id="ae-fout" step="0.1" min="0" value="0" disabled></div>
    </div>
    <p class="ae-kb"><kbd>Space</kbd> play or pause &nbsp; <kbd>S</kbd> split &nbsp; <kbd>Delete</kbd> remove clip &nbsp; <kbd>R</kbd> record &nbsp; <kbd>L</kbd> loop &nbsp; <kbd>Home</kbd> start &nbsp; <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo &nbsp; <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo &nbsp; Ctrl and mouse wheel zooms. Drag a clip to move it, drag its edges to trim.</p>
    <p class="ae-status" id="ae-status" role="status"></p>
    <p class="ae-error" id="ae-error" role="alert"></p>
  </div>

  <div class="ae-two">
    <div class="card" id="ae-reccard">
      <h2 class="ae-h">Record a new track</h2>
      <p class="ae-warn">Use headphones when you record over other tracks. Speakers will leak the playback into the microphone.</p>
      <div class="field"><label for="ae-dev">Input device</label>
        <select id="ae-dev"><option value="">Default input</option></select>
        <p class="help"><button type="button" class="btn" id="ae-find" style="padding:6px 12px;font-size:.78rem">Allow microphone and find inputs</button> <span id="ae-chinfo"></span></p>
      </div>
      <div class="row2">
        <div class="field"><label for="ae-mode">Recording type</label><select id="ae-mode"><option value="mono">Mono</option><option value="stereo">Stereo</option></select></div>
        <div class="field"><label for="ae-count">Count-in</label><select id="ae-count"><option value="0">No count-in</option><option value="2">2 beeps</option><option value="3">3 beeps</option><option value="4">4 beeps</option></select></div>
      </div>
      <label class="check" id="ae-multi-row" hidden><input type="checkbox" id="ae-multi"> Record each input channel to its own track</label>
      <div class="field"><label for="ae-lat">Latency compensation (ms)</label>
        <div class="row2"><input type="number" id="ae-lat" value="0" min="0" max="1000" step="1"><button type="button" class="btn" id="ae-lat-est">Use browser estimate</button></div>
        <p class="help">New recordings are moved earlier by this amount so they line up with the other tracks. Typical values are 20 to 120 ms. Record a click, then adjust until it sits on the beat.</p>
      </div>
      <label class="check"><input type="checkbox" id="ae-ec"> Echo cancellation (leave off for music)</label>
      <label class="check"><input type="checkbox" id="ae-ns"> Noise suppression (leave off for music)</label>
      <label class="check"><input type="checkbox" id="ae-agc"> Automatic gain control (leave off for music)</label>
      <label class="check"><input type="checkbox" id="ae-mon"> Hear myself while recording (headphones only)</label>
      <div><b style="font-size:.82rem">Input level</b><div class="ae-meter" id="ae-meter" aria-hidden="true"></div><p class="help" id="ae-meter-t">Press Test input to see the level.</p></div>
      <div class="btns">
        <button type="button" class="btn primary ae-rec-btn" id="ae-rec">Record</button>
        <button type="button" class="btn" id="ae-test">Test input</button>
      </div>
      <p class="help">Recording starts at the playhead and plays the other tracks while you record. Stop adds the take as a new track.</p>
    </div>

    <div class="card" id="ae-expcard">
      <h2 class="ae-h">Export</h2>
      <div class="row2">
        <div class="field"><label for="ae-fmt">Format</label><select id="ae-fmt"><option value="wav16">WAV, 16-bit</option><option value="wav24">WAV, 24-bit</option><option value="mp3">MP3</option></select></div>
        <div class="field"><label for="ae-sr">Sample rate</label><select id="ae-sr"><option value="44100">44.1 kHz</option><option value="48000">48 kHz</option></select></div>
      </div>
      <div class="field" id="ae-br-row" hidden><label for="ae-br">MP3 quality</label><select id="ae-br"><option value="128">128 kbps</option><option value="192" selected>192 kbps</option><option value="256">256 kbps</option><option value="320">320 kbps</option></select></div>
      <label class="check"><input type="checkbox" id="ae-limit" checked> Turn the mix down if it would clip</label>
      <div class="btns">
        <button type="button" class="btn primary" id="ae-exp-mix">Export mixdown</button>
        <button type="button" class="btn" id="ae-exp-trk">Export selected track</button>
        <button type="button" class="btn" id="ae-exp-zip">Download all tracks as ZIP</button>
      </div>
      <progress id="ae-prog" max="100" value="0" hidden aria-label="Export progress"></progress>
      <p class="ae-last" id="ae-last" role="status"></p>
      <p class="help">The mixdown follows mute and solo. Single tracks and the ZIP include every track at its volume and pan, even if muted, and all have the same length so they line up in any editor. Export is faster than real time.</p>
    </div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to record multi-track audio in your browser</h2>
<ol>
<li><b>Put on headphones.</b> If you record over other tracks with speakers, the microphone hears the playback.</li>
<li><b>Add a backing track (optional).</b> Drop a WAV or MP3 of the beat, guitar or guide vocal onto the page. It becomes track 1.</li>
<li><b>Choose your input.</b> Press Allow microphone and find inputs, pick the microphone or audio interface, and choose Mono or Stereo. Press Test input and speak to check the level meter.</li>
<li><b>Place the playhead and press Record.</b> Recording starts at the playhead, the other tracks play along, and a new track is added when you stop. Use the count-in if you want a few beeps first.</li>
<li><b>Fix the timing if needed.</b> If the new take sits slightly late against the backing track, raise the latency compensation and record again.</li>
<li><b>Export.</b> Download a mixdown as WAV or MP3, or every track as its own file in a ZIP.</li>
</ol>
<p>Echo cancellation, noise suppression and automatic gain control are off by default because they damage music. Turn them on only for voice calls or very noisy rooms.</p></section>
<section class="block prose"><h2>Open audio from Audacity, Reaper and other editors</h2>
<p>This tool cannot open Audacity project files (.aup3) or Reaper project files (.rpp), because those files hold the project layout and not the sound itself. What does work is exporting your tracks as audio files and adding them here.</p>
<ul>
<li><b>Audacity:</b> choose File, Export, Export Multiple, pick WAV, and split by tracks. You get one WAV per track.</li>
<li><b>Reaper:</b> choose File, Render, set the source to Stems (selected tracks), pick WAV, and render.</li>
<li><b>Any other editor or recorder:</b> export each track as WAV, MP3, M4A, FLAC or OGG. Drop all the files in together.</li>
</ul>
<p>Each file becomes a track that starts at zero. If your stems all start at the same moment, as stems from a render do, they line up automatically. From there you can trim, split, fade, move, set volume and pan, record new parts and export a new mix.</p></section>
<section class="block prose"><h2>What you can do with it</h2>
<ul>
<li><b>Edit:</b> move clips in time, drag the edges to trim, split at the playhead, add fade in and fade out, reverse, change gain and normalize.</li>
<li><b>Mix:</b> set volume and pan for each track, mute and solo, rename and colour tracks.</li>
<li><b>Record:</b> overdub on top of other tracks with latency compensation, a level meter and an optional count-in. With a multi-channel audio interface that your browser exposes, you can record each input channel to its own track.</li>
<li><b>Export:</b> WAV in 16 or 24 bit, MP3, a single track, or all tracks as a ZIP of WAV files, at 44.1 or 48 kHz.</li>
</ul>
<p>Everything happens on your own computer. Your audio is not uploaded, so it works for private demos and unreleased songs.</p></section>
<section class="block prose"><h2>Tips for a clean result</h2>
<ul>
<li>Keep recording levels so the meter peaks below the red zone. You can raise the volume later but you cannot repair clipping.</li>
<li>Record at the same sample rate you plan to export, usually 48 kHz for video and 44.1 kHz for music.</li>
<li>Use short fades of 5 to 20 ms at cut points to avoid clicks.</li>
<li>Save your work by exporting. The page does not keep your project when you close it, so export a ZIP of tracks before you leave.</li>
<li>Use Chrome or Edge on a computer. Very long projects use a lot of memory, so keep sessions to a reasonable length.</li>
</ul></section>'''

PAGE = dict(
    title='Free Online Audio Editor and Multitrack Recorder',
    desc='Edit and record multi-track audio in your browser. Import WAV and MP3 stems, trim, mix, record over them, export WAV, MP3 or a ZIP. Free, nothing is uploaded.',
    h1='Free online audio editor and multitrack recorder', app='Free Audio Editor and Multitrack Recorder',
    lead='Add audio files from Audacity, Reaper or anywhere else, edit them on a timeline, record new tracks over them and export a mix. It all runs in your browser, so your audio is never uploaded.',
    tool=TOOL, vendor=['fflate/fflate.min.js'], own=[], module=['audioeditor.js'], css=['audio-editor.css'],
    sections=SECTIONS,
    faq=[
        ('Is this audio editor free?', 'Yes. There is no sign-up, no watermark and no limit on how many files you edit or export.'),
        ('Are my recordings and files uploaded?', 'No. Files are decoded, edited, recorded and exported inside your browser on your own computer. Nothing is sent to a server.'),
        ('Can I open an Audacity or Reaper project?', 'No. Project files (.aup3 and .rpp) only describe a project, so this tool cannot read them. Export your tracks from Audacity or Reaper as WAV stems and add those files here instead.'),
        ('Can I record several tracks at once?', 'You can record one input at a time while the other tracks play. If your audio interface shows more than two channels to the browser, you can record each channel to its own track. Browsers and operating systems often expose only two channels, so this depends on your device and drivers.'),
        ('Why is my recording slightly late?', 'Sound takes a moment to travel through your audio hardware and browser. Use the latency compensation setting to shift new recordings earlier so they line up, and wear headphones.'),
        ('Which file formats can I add and export?', 'You can add WAV, MP3, M4A, AAC, FLAC, OGG, Opus and AIFF files, plus the audio from many video files. You can export WAV in 16 or 24 bit, MP3, or a ZIP of one file per track.'),
        ('Does it save my project?', 'No. Close the page and the project is gone. Export a ZIP of your tracks to keep your work, then add those files again later.'),
    ],
    related=['video-to-mp3', 'screen-recorder', 'video-trimmer', 'video-converter', 'video-compressor'])
