INFO = dict(slug='image-converter', kicker='Images', tile_title='Image converter and compressor',
            tile_desc='Convert HEIC, PNG, WebP, AVIF and more to JPG, PNG or WebP. Shrink images in batches.',
            nav='Image converter')

TOOL = '''<div class="tool" id="ic-tool">
  <div class="card">
    <div class="scan-drop" id="ic-drop">
      <p style="margin:0 0 12px"><b>Drop images here</b>, paste them, or choose files</p>
      <button type="button" class="btn primary" id="ic-pick">Choose images</button>
      <input type="file" id="ic-file" accept="image/*,.heic,.heif,.avif,.svg,.bmp" multiple hidden>
      <p class="help">PNG, JPG, WebP, GIF, BMP, SVG, AVIF and HEIC. Add as many as you like. They are never uploaded.</p>
    </div>
    <div style="margin-top:18px">
      <div class="row2">
        <div class="field"><label for="ic-fmt">Convert to</label><select id="ic-fmt"><option value="same">Same format as the original</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP (small, works on the web)</option></select></div>
        <div class="field"><label for="ic-q">Quality: <b id="ic-qv"></b></label><input type="range" id="ic-q" min="10" max="100" step="1" value="80"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="ic-maxw">Max width (pixels, optional)</label><input type="number" id="ic-maxw" min="1" max="20000" placeholder="No limit" inputmode="numeric"></div>
        <div class="field"><label for="ic-maxh">Max height (pixels, optional)</label><input type="number" id="ic-maxh" min="1" max="20000" placeholder="No limit" inputmode="numeric"></div>
      </div>
      <div class="field" id="ic-bg-note"><label for="ic-bg">Background for transparent areas in JPG</label><input type="color" id="ic-bg" value="#ffffff"><p class="help">JPG cannot be transparent, so see-through parts are filled with this color.</p></div>
      <p class="help">Smaller numbers make smaller files. Lower the quality or set a max width to compress more. Aspect ratio is always kept and photos are never enlarged.</p>
    </div>
    <p class="help" id="ic-status" role="status"></p>
  </div>
  <div class="card preview" aria-live="polite">
    <p class="help" style="margin:0" id="ic-empty">Your converted images appear here.</p>
    <div id="ic-results" hidden>
      <p class="ic-total" id="ic-total"></p>
      <ul class="ic-list" id="ic-list"></ul>
      <div class="btns"><button type="button" class="btn primary" id="ic-zip" disabled>Download all as ZIP</button><button type="button" class="btn" id="ic-clear">Clear all</button></div>
    </div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to convert or compress images</h2>
<ol>
<li><b>Add your images.</b> Drop them on the box, paste them, or choose files. HEIC photos from an iPhone work too.</li>
<li><b>Pick a format.</b> Choose JPG, PNG or WebP, or keep the original format to simply compress.</li>
<li><b>Set the quality and size.</b> The default of 80% keeps photos sharp and cuts the file size a lot. Set a max width to shrink big photos further.</li>
<li><b>Check the sizes.</b> Each file shows its size before and after, and the total saved.</li>
<li><b>Download.</b> Save one file, or get everything in a single ZIP.</li>
</ol></section>
<section class="block prose"><h2>Common conversions</h2>
<ul>
<li><b>HEIC to JPG.</b> iPhone photos are saved as HEIC, which many sites, Windows apps and forms reject. Convert them to JPG here.</li>
<li><b>PNG to JPG.</b> Photos saved as PNG are often huge. JPG is far smaller. Transparent areas are filled with the color you choose.</li>
<li><b>WebP to PNG or JPG.</b> Save images from the web in a format every app opens.</li>
<li><b>JPG or PNG to WebP.</b> WebP is usually much smaller than both, which makes web pages load faster.</li>
<li><b>SVG to PNG.</b> Turn a vector logo into a PNG. It is drawn at a size of at least 1000 pixels on its long side unless you set a max size.</li>
<li><b>Compress an image.</b> Keep the same format, lower the quality a little and set a max width.</li>
</ul></section>
<section class="block prose"><h2>Which format should I choose?</h2>
<ul>
<li><b>JPG</b> for photos. Small and opens everywhere. No transparency.</li>
<li><b>PNG</b> for logos, screenshots and anything with sharp edges or transparency. Lossless, so the quality slider does nothing. Only a smaller size makes the file smaller.</li>
<li><b>WebP</b> for websites. Smaller than JPG and PNG, with transparency.</li>
<li><b>AVIF</b> is smaller still, but only some browsers can save it. It appears in the list only if yours can.</li>
</ul>
<p>Animated GIFs are converted using their first frame only.</p></section>'''

PAGE = dict(
    title='Image Converter and Compressor: HEIC to JPG, PNG, WebP',
    desc='Convert and compress images online, free. HEIC to JPG, PNG to JPG, WebP to PNG, AVIF and more. Batch, resize, see the size saved. Nothing is uploaded.',
    h1='Image converter and compressor', app='Image Converter and Compressor',
    lead='Convert HEIC, PNG, JPG, WebP, GIF, BMP, SVG and AVIF images to JPG, PNG or WebP, and shrink their file size. Work on many images at once. Everything runs in your browser and nothing is uploaded.',
    tool=TOOL, vendor=['fflate/fflate.min.js'], own=['imgconv.js'], css=['image-converter.css'],
    sections=SECTIONS,
    faq=[
        ('Is this image converter free?', 'Yes. There is no sign-up, no watermark and no limit on how many images you convert.'),
        ('Are my images uploaded?', 'No. The conversion happens in your browser on your own device. Your images are never sent to a server.'),
        ('How do I convert HEIC to JPG?', 'Add your HEIC or HEIF photos, choose JPG as the format and download them. The HEIC converter loads only when you add a HEIC file.'),
        ('How do I compress an image without losing quality?', 'Keep the same format or choose JPG or WebP, and leave the quality around 80%. Photos usually look the same and the file gets much smaller. Setting a max width also helps a lot for very large photos.'),
        ('Why does the quality slider do nothing for PNG?', 'PNG is a lossless format, so there is no quality setting. To make a PNG smaller, reduce its width and height, or convert it to WebP or JPG.'),
        ('What happens to transparent areas when I save a JPG?', 'JPG cannot be transparent, so those areas are filled with the background color you choose. White is the default. Choose PNG or WebP to keep transparency.'),
        ('Why is AVIF missing from the format list?', 'Only some browsers can save AVIF images. If yours cannot, the option is hidden. You can still add AVIF files and convert them to other formats.'),
    ],
    related=['remove-background', 'watermark-maker', 'image-to-pdf', 'color-picker', 'video-compressor'])
