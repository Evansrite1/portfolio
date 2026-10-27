INFO = dict(slug='keyboard-key-finder', kicker='Music', tile_title='Keyboard and song key finder',
            tile_desc='Play a keyboard with 5 sounds, and let the tool listen to a song and tell you its key.',
            nav='Keyboard and key finder')

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
<section class="block prose"><h2>How it works</h2>
<p>The tool turns the sound into a spectrum, picks out the strong peaks and groups them into the 12 notes of the scale, C to B, whatever octave they were played in. That gives a profile of how much each note was used. It then compares that profile with the typical profiles of all 24 major and minor keys and shows the closest match. This is the same idea used by DJ software and music apps.</p>
<p>A major key and its relative minor use exactly the same notes, for example C major and A minor. When the two are close, the tool shows both so you can pick by ear: the key that the song feels like it rests on is the right one.</p></section>
<section class="block prose"><h2>Tips for a better answer</h2>
<ul>
<li>Use a full-band section with chords, not only drums or a spoken intro.</li>
<li>Let it listen for at least 15 seconds. Songs that change key halfway give a mixed answer.</li>
<li>Music with a lot of distorted noise or very low bass can fool any key finder. Try a different part of the song.</li>
</ul></section>'''

PAGE = dict(
    title='Online Piano Keyboard with 5 Sounds and Song Key Finder',
    desc='Free online keyboard with piano, electric piano, organ, synth and strings, plus a key finder that listens to a song, or an audio file, and tells you its key. Runs in your browser.',
    h1='Keyboard and song key finder', app='Keyboard and Key Finder',
    lead='Play a keyboard with five sounds, and let the tool listen to a song to find out what key it is in. The scale lights up on the keys so you can play along. It runs in your browser and nothing is uploaded.',
    tool=TOOL, vendor=[], own=['kbtool.js'], css=['keyboard-key-finder.css'],
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
        ('What does the confidence mean?', 'It shows how much better the top answer matches than the next different key. A low value means the music fits more than one key, so listen longer or try another part of the song.'),
    ],
    related=['audio-mastering', 'video-editor', 'second-screen-presenter', 'screen-recorder', 'video-converter'])
