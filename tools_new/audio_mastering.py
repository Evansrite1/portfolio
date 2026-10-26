INFO = dict(slug='audio-mastering', kicker='Audio', tile_title='Audio mastering',
            tile_desc='A free music workstation in your browser: unlimited tracks, MIDI, plugins, spectral repair, noise removal and loudness mastering.',
            nav='Audio mastering', pos=2)

TOOL = '''<div class="tool" id="am-tool" style="grid-template-columns:1fr">
  <div class="card" style="text-align:center;padding:34px 20px">
    <h2 style="margin:0 0 8px">Open the studio</h2>
    <p class="help" style="max-width:60ch;margin:0 auto 20px">A full-screen workstation like the desktop programs. Tracks on the left, your project on a timeline, a mixer, a piano roll, a spectral editor and a mastering panel at the bottom. It opens on its own without the browser around it.</p>
    <a class="btn primary" href="/tools/audio-mastering/app/" style="padding:13px 24px;font-size:1rem">Open audio mastering</a>
    <p class="help" style="margin-top:14px">Best in Chrome or Edge on a computer with headphones. Your audio never leaves your computer. <a href="/tools/second-screen-presenter/contact/">Contact the builder</a></p>
  </div>
</div>'''

SECTIONS = '''
<section class="block prose"><h2>What you can do</h2>
<ul>
<li><b>Unlimited tracks.</b> Add as many audio and MIDI tracks as your computer can play. Drop WAV, MP3, M4A, FLAC, OGG or a video and each file becomes a track.</li>
<li><b>Non-destructive editing.</b> Move, trim, split, duplicate, fade and reverse clips. Your original recordings are never changed, so every edit can be undone.</li>
<li><b>Record.</b> Pick your microphone or audio interface, arm a track and record while the other tracks play. A metronome keeps you in time.</li>
<li><b>MIDI and instruments.</b> Draw notes in the piano roll, play them on built-in synth, piano, bass, pad and drum instruments, record from a USB MIDI keyboard, and import or export MIDI files.</li>
<li><b>Plugins.</b> Every track and the master have a plugin rack: EQ, compressor, gate, limiter, reverb, delay, chorus, filter, distortion, de-esser and stereo width.</li>
<li><b>Tempo.</b> Set the BPM and time signature, snap to the beat grid, and stretch a clip faster or slower without changing its pitch.</li>
</ul></section>
<section class="block prose"><h2>Repair and mastering</h2>
<ul>
<li><b>Spectral frequency display.</b> See your audio as a picture of frequencies over time, then draw a box around a cough, a phone ring or a squeak and turn it down.</li>
<li><b>Noise and hum removal.</b> Learn the noise from a quiet part and remove it, remove 50 Hz or 60 Hz mains hum, and fix clicks.</li>
<li><b>Loudness mastering.</b> Measure the loudness of your mix in LUFS and export it at the right level for Spotify, YouTube, Apple Music, podcasts or clubs, with a limiter so it never clips.</li>
<li><b>Export.</b> WAV at 16 or 24 bit, MP3 up to 320 kbps, and MIDI files.</li>
</ul></section>
<section class="block prose"><h2>How to start</h2>
<ol>
<li>Press <b>Open audio mastering</b> and choose Start in full screen.</li>
<li>Drop your audio files onto the page, or add a MIDI track and draw some notes.</li>
<li>Press Space to play. Use the mixer and plugins to shape the sound.</li>
<li>Open the Mastering tab, pick a loudness target and export.</li>
</ol></section>'''

PAGE = dict(
    title='Free Online Audio Mastering and Music Workstation',
    desc='Free audio mastering and multi-track music workstation in your browser. Unlimited tracks, MIDI, plugins, spectral repair, noise and hum removal, LUFS loudness and WAV or MP3 export. Nothing is uploaded.',
    h1='Audio mastering', app='Audio Mastering',
    lead='A free music workstation in your browser. Record and edit unlimited tracks, write MIDI, add plugins, repair noise in a spectral editor and master your mix to the right loudness. Nothing is uploaded.',
    tool=TOOL, vendor=[], own=[], module=[], css=[],
    sections=SECTIONS,
    faq=[
        ('Is it free?', 'Yes. There is no sign-up, no watermark and no limit on tracks.'),
        ('Is my audio uploaded?', 'No. Everything is processed in your browser on your own computer. Your project is saved in this browser so it is still there next time.'),
        ('Can I use my VST or AU plugins?', 'No. VST and AU plugins are programs installed on your computer, and a web page is not allowed to run them. The built-in plugins cover the everyday needs: EQ, compression, reverb, delay, limiting and more.'),
        ('Can I use a MIDI keyboard?', 'Yes, in Chrome and Edge. Plug in a USB MIDI keyboard, allow MIDI access when asked, arm a MIDI track and play.'),
        ('What is LUFS?', 'LUFS measures how loud a mix sounds to people, not just its peaks. Streaming services turn songs up or down to a set LUFS level, so mastering to that level keeps your song sounding as you intended.'),
        ('Can it remove background noise?', 'Yes. Select a part with only noise, press Learn noise, then Reduce noise. It also removes mains hum and clicks.'),
        ('Can I open Reaper, Audacity or FL Studio projects?', 'No. Export your tracks from those programs as WAV files and drop them in. MIDI files from any program can be imported.'),
        ('Who made this?', 'Evans Ademilua in Lagos, Nigeria. Use Contact the builder to send a message or ask for a feature.'),
    ],
    related=['video-editor', 'video-converter', 'screen-recorder', 'second-screen-presenter'])
