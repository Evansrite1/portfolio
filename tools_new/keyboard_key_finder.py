INFO = dict(slug='keyboard-key-finder', kicker='Music', tile_title='Keyboard, key finder and song breakdown',
            tile_desc='Play a keyboard with 5 sounds, find the key of a song, and see where the bass, chords, lead line and beat play in any song you upload.',
            nav='Keyboard and song breakdown')

TOOL = '''<div id="kb-tool">
<div class="card kb-card">
  <h2 class="kb-h">Keyboard</h2>
  <div class="kb-bar">
    <div class="kb-sounds" role="radiogroup" aria-label="Sound">
      <button type="button" role="radio" aria-checked="true" data-sound="piano">Piano</button>
      <button type="button" role="radio" aria-checked="false" data-sound="epiano">Electric piano</button>
      <button type="button" role="radio" aria-checked="false" data-sound="organ">Organ</button>
      <button type="button" role="radio" aria-checked="false" data-sound="synth">Synth</button>
      <button type="button" role="radio" aria-checked="false" data-sound="strings">Strings</button>
    </div>
    <div class="kb-ctl">
      <label class="kb-vol">Volume <input type="range" id="kb-vol" min="0" max="100" value="70"></label>
      <div class="kb-oct" role="group" aria-label="Octave">
        <button type="button" class="btn" id="kb-oct-down" aria-label="Octave down">-</button>
        <span id="kb-oct-label">Octave 4</span>
        <button type="button" class="btn" id="kb-oct-up" aria-label="Octave up">+</button>
      </div>
      <button type="button" class="btn" id="kb-sustain" aria-pressed="false">Sustain</button>
      <label class="kb-chk"><input type="checkbox" id="kb-labels" checked> Show note names</label>
    </div>
  </div>
  <div class="kb-scroll"><div id="kb-keys" class="kb-keys" role="group" aria-label="Piano keys"></div></div>
  <p class="help" id="kb-hint">Click or tap the keys, or use your computer keyboard: A S D F G H J K L play the white keys and W E T Y U O P play the black keys. Z and X change the octave, Space is sustain.</p>
  <p class="help" id="kb-now" role="status" aria-live="polite"></p>

  <div class="kb-finder">
  <h2 class="kb-h">Song key finder</h2>
  <p class="help" style="margin-top:0">Pick where the music comes from. The tool listens and works out the key from the notes it hears. Keep it going for 10 to 20 seconds for a better answer.</p>
  <div class="kb-src">
    <button type="button" class="btn primary" id="kb-mic">Listen with microphone</button>
    <button type="button" class="btn" id="kb-tab">Listen to a browser tab</button>
    <button type="button" class="btn" id="kb-file-btn">Analyse an audio file</button>
    <input type="file" id="kb-file" accept="audio/*,video/*" hidden>
    <button type="button" class="btn" id="kb-stop" hidden>Stop</button>
    <button type="button" class="btn" id="kb-reset" disabled>Start again</button>
  </div>
  <div class="scan-drop kb-drop" id="kb-drop"><b>Or drop a song here</b><span class="help">MP3, WAV, M4A, OGG. It is read on your device and never uploaded.</span></div>
  <div class="kb-meter" aria-hidden="true"><i id="kb-level"></i></div>
  <p class="help" id="kb-status" role="status" aria-live="polite">Waiting. Choose a source above.</p>
  <div class="kb-result" id="kb-result" hidden>
    <div class="kb-big"><span class="kb-label">Key</span><b id="kb-key">-</b><span id="kb-rel"></span></div>
    <div class="kb-conf"><span>Confidence</span><div class="kb-bar2"><i id="kb-conf-bar"></i></div><b id="kb-conf-txt"></b></div>
    <div class="kb-alt" id="kb-alt"></div>
    <div class="kb-chroma" id="kb-chroma" aria-label="Notes heard"></div>
    <div class="btns"><button type="button" class="btn primary" id="kb-play-scale">Play this scale on the keyboard</button><button type="button" class="btn" id="kb-copy">Copy result</button></div>
  </div>
  </div>

  <div class="kb-finder">
  <h2 class="kb-h">Song breakdown</h2>
  <p class="help" style="margin-top:0">Drop in a song and see what plays when: the sections, the chords, the lead line (usually the voice), the bass and the beat. Press play and follow along. The keyboard above lights up with the chord, the bass note and the lead note you are hearing.</p>
  <div class="kb-src"><button type="button" class="btn primary" id="kb-bd-btn">Choose a song to break down</button><input type="file" id="kb-bd-file" accept="audio/*,video/*" hidden></div>
  <div class="scan-drop kb-drop" id="kb-bd-drop"><b>Or drop a song here</b><span class="help">MP3, WAV, M4A, OGG. It is read on your device and never uploaded. A 4 minute song takes about 10 to 30 seconds.</span></div>
  <div id="kb-bd-prog" hidden><i id="kb-bd-progi"></i></div>
  <p class="help" id="kb-bd-status" role="status" aria-live="polite">Waiting for a song.</p>
  <audio id="kb-bd-audio" preload="auto"></audio>
  <div id="kb-bd" hidden>
    <div class="kb-bd-top">
      <button type="button" class="btn primary" id="kb-bd-play">Play</button>
      <span id="kb-bd-time">0:00 / 0:00</span>
      <span id="kb-bd-sum"></span>
      <label>Zoom <input type="range" id="kb-bd-zoom" min="10" max="100" value="40"></label>
      <label><input type="checkbox" id="kb-bd-follow" checked> Follow</label>
    </div>
    <div class="kb-bd-now" id="kb-bd-now"></div>
    <div class="kb-bd-wrap">
      <div class="kb-bd-labels" id="kb-bd-labels"></div>
      <div class="kb-bd-scroll" id="kb-bd-scroll"><div id="kb-bd-content"><canvas id="kb-bd-cv" aria-label="Timeline of the song: sections, chords, lead line, bass, beat hits and loudness"></canvas><div id="kb-bd-playhead"></div></div></div>
    </div>
    <p class="kb-bd-legend"><span><i style="background:#6ea8ff"></i>Lead line</span><span><i style="background:#ffb347"></i>Bass</span><span><i style="background:#ffd9d6"></i>Chord notes on the keys</span><span>Chords: orange blocks are major, blue are minor</span></p>
    <div id="kb-bd-explain" aria-live="polite"><p>Press play to follow the song.</p></div>
  </div>
  </div>
</div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to use the keyboard</h2>
<ol>
<li><b>Pick a sound.</b> Piano, electric piano, organ, synth or strings. All five are made inside your browser, so there is nothing to download.</li>
<li><b>Play.</b> Click or tap the keys, slide across them for a glissando, or type on your computer keyboard. A S D F G H J K L are the white keys and W E T Y U O P are the black keys.</li>
<li><b>Change range.</b> Use the octave buttons or the Z and X keys. Hold Space or press Sustain to let notes ring.</li>
</ol></section>
<section class="block prose"><h2>How to find the key of a song</h2>
<ol>
<li><b>Play the song and press Listen with microphone.</b> The tool hears it through your microphone, so keep the speaker near and the room quiet.</li>
<li><b>Or listen to a tab.</b> On a computer in Chrome or Edge, choose a browser tab that is playing the song and tick Share tab audio. This is cleaner than a microphone.</li>
<li><b>Or drop in a file.</b> The whole song is analysed on your device in a few seconds.</li>
<li><b>Read the result.</b> You get the key, how sure the tool is, the next most likely keys, and the notes it heard. The scale lights up on the keyboard, and you can play it to check by ear.</li>
</ol></section>
<section class="block prose"><h2>How to break a song down and learn from it</h2>
<ol>
<li><b>Drop a song into Song breakdown.</b> It is analysed on your device. A 4 minute song takes about 10 to 30 seconds.</li>
<li><b>Read the timeline.</b> Sections show the shape of the song, such as verse and chorus. Chords show the harmony with its Roman numerals. The lead line is the most prominent melody, usually the voice. Bass shows the low notes, and beat hits show kick, snare and hi-hat style hits.</li>
<li><b>Press play.</b> A green line moves across the timeline. The box under the keyboard shows the section, chord, bass note and lead note right now, and the keyboard lights up with them. Click the timeline to jump to any part.</li>
<li><b>Read the notes under the timeline.</b> They explain the chord, what the bass is doing and how the lead note relates to the chord, so you learn why it sounds the way it does.</li>
</ol>
<p>Roman numerals are a way to name chords by their place in the key. In C major, C is I, F is IV and G is V. Lower case, like vi, means a minor chord. Many hit songs use a few of the same numerals in different orders.</p>
<p><b>What it can and cannot do.</b> This works by listening to the sound and finding the notes, not by separating the song into individual instruments. That means the bass and chords are usually right, the tempo and sections are good guides, and the lead line is the most prominent melody, which can be a guitar or a keyboard when they are louder than the voice. It cannot split a choir into soprano, alto and tenor. Use it as a map, and check against your ears.</p></section>
<section class="block prose"><h2>How the key finder works</h2>
<p>The tool turns the sound into a spectrum, picks out the strong peaks and groups them into the 12 notes of the scale, C to B, whatever octave they were played in. That gives a profile of how much each note was used. It then compares that profile with the typical profiles of all 24 major and minor keys and shows the closest match. This is the same idea used by DJ software and music apps.</p>
<p>A major key and its relative minor use exactly the same notes, for example C major and A minor. When the two are close, the tool shows both so you can pick by ear: the key that the song feels like it rests on is the right one.</p></section>
<section class="block prose"><h2>Tips for a better answer</h2>
<ul>
<li>Use a full-band section with chords, not only drums or a spoken intro.</li>
<li>Let it listen for at least 15 seconds. Songs that change key halfway give a mixed answer.</li>
<li>Music with a lot of distorted noise or very low bass can fool any key finder. Try a different part of the song.</li>
</ul></section>'''

PAGE = dict(
    title='Online Piano Keyboard, Song Key Finder and Song Breakdown',
    desc='Free online keyboard with 5 sounds, a song key finder, and a song breakdown that shows the chords, bass, lead line, sections and tempo of any song you upload. Learn music by following along. Runs in your browser.',
    h1='Keyboard, key finder and song breakdown', app='Keyboard and Song Breakdown',
    lead='Play a keyboard with five sounds, find the key of a song, and drop in any song to see where the bass, chords, lead line and beat play, with plain-language notes on what you are hearing. It runs in your browser and nothing is uploaded.',
    tool=TOOL, vendor=[], own=['kbtool.js', 'kbbreak.js', 'kbbreakui.js'], css=['keyboard-key-finder.css', 'kb-breakdown.css'],
    sections=SECTIONS,
    faq=[
        ('Is it free?', 'Yes. There is no sign-up and no limit. It runs in your browser.'),
        ('What sounds does the keyboard have?', 'Piano, electric piano, organ, synth and strings. They are generated by your browser, so they load instantly and work offline once the page is open.'),
        ('How do I find the key of a song?', 'Press Listen with microphone while the song plays, or share a browser tab that is playing it, or drop in an audio file. After 10 to 20 seconds the tool shows the most likely key.'),
        ('How accurate is the key finder?', 'It is right most of the time for songs with clear chords and melody. It can be wrong for songs that change key, have heavy noise or very little harmony. A relative major and minor, such as C major and A minor, share the same notes and are the most common mix-up, so the tool shows both when they are close.'),
        ('Can it listen to Spotify or YouTube?', 'Yes. Open the song in another tab, press Listen to a browser tab, choose that tab and tick Share tab audio. This works in Chrome and Edge on a computer. On a phone, use the microphone.'),
        ('Is my audio uploaded?', 'No. The microphone, the tab audio and the files are all analysed on your own device.'),
        ('Why does the microphone need permission?', 'Your browser asks before any page can listen. The tool only listens while you have it running, and the stop button turns the microphone off.'),
        ('Does it work on a phone?', 'The keyboard works with touch, and the microphone key finder works on most phones. Listening to a tab is a computer feature.'),
        ('What is the song breakdown?', 'It listens to a song you upload and draws a timeline: the sections, the chords, the lead line, the bass notes and the beat. When you press play, the keyboard lights up with the chord, bass note and lead note you are hearing, and the tool explains them in plain words.'),
        ('Can it separate the singer from the instruments?', 'Not exactly. It finds the most prominent melody and shows it as the lead line, which is usually the voice. It does not split a song into separate audio tracks, and it cannot separate soprano, alto and tenor parts of a choir.'),
        ('How accurate is the song breakdown?', 'The tempo, key, bass notes and chords are usually right for songs with clear instruments. Sections and the lead line are good guides but can be wrong, especially in busy mixes or songs that change tempo. It is a learning map, so check it against your ears.'),
        ('Are my songs uploaded?', 'No. The song is read and analysed on your own device, and nothing is sent to a server.'),
        ('What does the confidence mean?', 'It shows how much better the top answer matches than the next different key. A low value means the music fits more than one key, so listen longer or try another part of the song.'),
    ],
    related=['audio-mastering', 'video-editor', 'second-screen-presenter', 'screen-recorder', 'video-converter'])
