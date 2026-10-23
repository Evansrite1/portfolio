INFO = dict(slug='color-picker', kicker='Design', tile_title='Color picker',
            tile_desc='Pick a color, copy HEX, RGB, HSL and CMYK, pull a palette from a photo, check contrast.',
            nav='Color picker')

TOOL = '''<div id="cp-tool">
<div class="tool">
  <div class="card">
    <h2 class="cp-h">Pick a color</h2>
    <div class="cp-svwrap"><canvas id="cp-sv" width="560" height="400" role="slider" aria-label="Saturation and brightness. Use the arrow keys." aria-valuemin="0" aria-valuemax="100" aria-valuenow="68" tabindex="0"></canvas><div id="cp-cursor"></div></div>
    <input type="range" id="cp-hue" min="0" max="360" value="3" aria-label="Hue">
    <div class="cp-top">
      <div class="field"><label for="cp-hex">Type a color: hex, rgb(), hsl() or a name</label><input type="text" id="cp-hex" value="#ff5b52" autocomplete="off" spellcheck="false"></div>
      <div class="field"><label for="cp-native">System picker</label><input type="color" id="cp-native" value="#ff5b52"></div>
    </div>
    <div class="btns" style="margin-top:0"><button type="button" class="btn" id="cp-eye" hidden>Pick from anywhere on screen</button></div>
    <p class="help" id="cp-status" role="status"></p>
  </div>
  <div class="card preview">
    <h2 class="cp-h">Your color</h2>
    <div id="cp-swatch"><span id="cp-ink">Preview</span></div>
    <p class="cp-name" id="cp-name"></p>
    <div class="cp-vals">
      <div class="cp-val"><b>HEX</b><code id="cp-v-hex"></code><button type="button" class="btn" id="cp-copy-hex" aria-label="Copy HEX">Copy</button></div>
      <div class="cp-val"><b>RGB</b><code id="cp-v-rgb"></code><button type="button" class="btn" id="cp-copy-rgb" aria-label="Copy RGB">Copy</button></div>
      <div class="cp-val"><b>HSL</b><code id="cp-v-hsl"></code><button type="button" class="btn" id="cp-copy-hsl" aria-label="Copy HSL">Copy</button></div>
      <div class="cp-val"><b>HSV</b><code id="cp-v-hsv"></code><button type="button" class="btn" id="cp-copy-hsv" aria-label="Copy HSV">Copy</button></div>
      <div class="cp-val"><b>CMYK</b><code id="cp-v-cmyk"></code><button type="button" class="btn" id="cp-copy-cmyk" aria-label="Copy CMYK">Copy</button></div>
    </div>
    <div class="btns"><button type="button" class="btn primary" id="cp-save">Save this color</button></div>
  </div>
</div>

<div class="tool">
  <div class="card">
    <h2 class="cp-h">Pick from an image</h2>
    <div class="scan-drop" id="cp-drop">
      <p style="margin:0 0 12px"><b>Drop an image here</b>, paste it, or choose a file</p>
      <button type="button" class="btn primary" id="cp-img-pick">Choose image</button>
      <input type="file" id="cp-img-file" accept="image/*" hidden>
      <p class="help">The image stays in your browser and is never uploaded.</p>
    </div>
    <div class="cp-img-box" id="cp-img-box" hidden>
      <canvas id="cp-img" aria-label="Your image. Click a pixel to pick its color."></canvas>
      <p class="help" id="cp-img-help" style="text-align:center"></p>
      <div class="field"><label for="cp-pal-n">Palette size</label><select id="cp-pal-n"><option value="4">4 colors</option><option value="6" selected>6 colors</option><option value="8">8 colors</option><option value="10">10 colors</option></select></div>
      <div class="cp-row" id="cp-palette"></div>
      <div class="btns"><button type="button" class="btn" id="cp-pal-save" hidden>Save the whole palette</button></div>
    </div>
  </div>
  <div class="card">
    <h2 class="cp-h">Contrast checker</h2>
    <div class="cp-pair">
      <div class="field"><label for="cp-fg-hex">Text color</label><input type="text" id="cp-fg-hex" autocomplete="off" spellcheck="false"><input type="color" id="cp-fg-c" aria-label="Text color picker" style="margin-top:6px"></div>
      <div class="field"><label for="cp-bg-hex">Background color</label><input type="text" id="cp-bg-hex" autocomplete="off" spellcheck="false"><input type="color" id="cp-bg-c" aria-label="Background color picker" style="margin-top:6px"></div>
    </div>
    <div class="btns" style="margin-top:0"><button type="button" class="btn" id="cp-use-fg">Use my color as text</button><button type="button" class="btn" id="cp-use-bg">Use my color as background</button><button type="button" class="btn" id="cp-swap">Swap</button></div>
    <p id="cp-ratio" aria-live="polite"></p>
    <div class="cp-pills">
      <div class="cp-pr"><span>Normal text, AA (4.5:1)</span><span id="cp-aa" class="cp-pill"></span></div>
      <div class="cp-pr"><span>Normal text, AAA (7:1)</span><span id="cp-aaa" class="cp-pill"></span></div>
      <div class="cp-pr"><span>Large text, AA (3:1)</span><span id="cp-aal" class="cp-pill"></span></div>
      <div class="cp-pr"><span>Large text, AAA (4.5:1)</span><span id="cp-aaal" class="cp-pill"></span></div>
      <div class="cp-pr"><span>Buttons and icons (3:1)</span><span id="cp-ui" class="cp-pill"></span></div>
    </div>
    <div id="cp-sample"><b>Sample heading</b>The quick brown fox jumps over the lazy dog.</div>
  </div>
</div>

<div class="tool">
  <div class="card">
    <h2 class="cp-h">Shades, tints and harmonies</h2>
    <h3 class="cp-h3">Tints (mixed with white)</h3><div class="cp-row" id="cp-tints"></div>
    <h3 class="cp-h3">Shades (mixed with black)</h3><div class="cp-row" id="cp-shades"></div>
    <h3 class="cp-h3">Complementary</h3><div class="cp-row" id="cp-h-comp"></div>
    <h3 class="cp-h3">Analogous</h3><div class="cp-row" id="cp-h-ana"></div>
    <h3 class="cp-h3">Triadic</h3><div class="cp-row" id="cp-h-tri"></div>
    <h3 class="cp-h3">Split complementary</h3><div class="cp-row" id="cp-h-split"></div>
    <p class="help">Click any swatch to make it your color.</p>
  </div>
  <div class="card">
    <h2 class="cp-h">Saved colors</h2>
    <p class="help" id="cp-saved-empty" style="margin-top:0">Colors you save appear here and are kept in this browser.</p>
    <div class="cp-row" id="cp-saved"></div>
    <div class="btns"><button type="button" class="btn primary" id="cp-copy-css" disabled>Copy as CSS variables</button><button type="button" class="btn" id="cp-copy-list" disabled>Copy hex list</button><button type="button" class="btn" id="cp-clear-saved" disabled>Clear</button></div>
  </div>
</div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to pick a color</h2>
<ol>
<li><b>Choose a hue.</b> Move the rainbow slider, then click in the large square to set how bright and how strong the color is.</li>
<li><b>Or start from something you have.</b> Type a hex code, an rgb() or hsl() value or a name such as tomato. Load a photo and click any pixel, or use the screen eyedropper in browsers that support it.</li>
<li><b>Copy the value you need.</b> HEX, RGB, HSL, HSV and CMYK are shown together, each with a copy button.</li>
<li><b>Save it.</b> Keep the colors you like and copy them all as CSS variables.</li>
</ol></section>
<section class="block prose"><h2>Get a color palette from an image</h2>
<p>Load a logo, a product photo or a screenshot and the tool finds its main colors using median cut, a standard way to reduce an image to a few representative colors. The most common color comes first. Click a swatch to use it, or save the whole palette.</p></section>
<section class="block prose"><h2>Check that your text is readable</h2>
<p>The contrast checker follows the WCAG guidelines. Normal text needs a ratio of at least 4.5 to 1 for level AA and 7 to 1 for level AAA. Large text, which is 24 pixels or 19 pixels bold and above, needs 3 to 1 for AA and 4.5 to 1 for AAA. Buttons, icons and form borders need 3 to 1. Black on white scores 21 to 1, the highest possible.</p></section>
<section class="block prose"><h2>Build a color scheme</h2>
<ul>
<li><b>Complementary.</b> The color opposite on the wheel. Strong contrast, good for a call to action button.</li>
<li><b>Analogous.</b> Neighbors on the wheel. Calm and harmonious.</li>
<li><b>Triadic.</b> Three colors evenly spaced. Lively but balanced.</li>
<li><b>Split complementary.</b> A color plus the two neighbors of its opposite. Contrast with less tension.</li>
<li><b>Shades and tints.</b> Darker and lighter versions of one color, useful for hover states and backgrounds.</li>
</ul></section>'''

PAGE = dict(
    title='Color Picker: HEX, RGB, HSL, CMYK, Palette and Contrast',
    desc='Free color picker with HEX, RGB, HSL, HSV and CMYK values, screen eyedropper, palette from an image, contrast checker, shades and harmonies. Runs in your browser.',
    h1='Color picker', app='Color Picker',
    lead='Pick any color and copy it as HEX, RGB, HSL, HSV or CMYK. Pull a palette from a photo, check text contrast, and build shades and matching colors. It runs in your browser and nothing is uploaded.',
    tool=TOOL, vendor=[], own=['cptool.js'], css=['color-picker.css'],
    sections=SECTIONS,
    faq=[
        ('Is this color picker free?', 'Yes. There is no sign-up and no limit. It runs in your browser.'),
        ('How do I get the HEX code of a color?', 'Pick the color or type it in, and the HEX code is shown in the values panel with a Copy button.'),
        ('How do I find a color from an image?', 'Load the image in the Pick from an image section and click the pixel you want. The tool also builds a palette of the main colors in the picture.'),
        ('What is the screen eyedropper?', 'In Chrome and Edge on a computer, a button lets you pick a color from anywhere on your screen, even outside the browser. If your browser does not support it, the button is hidden and the image picker still works.'),
        ('What contrast ratio do I need?', 'For normal text, 4.5 to 1 passes WCAG level AA and 7 to 1 passes AAA. Large text needs 3 to 1 for AA. Black on white is 21 to 1.'),
        ('What is the difference between HEX, RGB, HSL and CMYK?', 'HEX and RGB describe a color as amounts of red, green and blue and are used on screens and in CSS. HSL describes hue, saturation and lightness, which is easier to adjust by hand. CMYK is for print. The CMYK shown here is a simple calculation and a printer may give a slightly different result.'),
        ('Are my saved colors private?', 'Yes. They are stored only in your own browser. Nothing is sent to a server, and clearing your browser data removes them.'),
    ],
    related=['image-converter', 'watermark-maker', 'remove-background', 'qr-code-generator', 'qr-code-scanner'])
