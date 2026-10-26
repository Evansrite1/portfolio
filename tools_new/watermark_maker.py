INFO = dict(slug='watermark-maker', kicker='Images', tile_title='Watermark maker',
            tile_desc='Add a text or logo watermark to one or many photos. Tile it or place it, then download a ZIP.',
            nav='Watermark maker')

TOOL = '''<div class="tool" id="wm-tool">
  <div class="card">
    <div class="scan-drop" id="wm-drop">
      <p style="margin:0 0 12px"><b>Drop images here</b>, paste them, or choose files</p>
      <button type="button" class="btn primary" id="wm-pickimg">Choose images</button>
      <input type="file" id="wm-file" accept="image/*" multiple hidden>
      <p class="help">PNG, JPG, WebP, GIF, BMP or AVIF. Add one or many. They are never uploaded.</p>
    </div>
    <div style="margin-top:18px">
      <div class="field"><label for="wm-mode">Watermark type</label><select id="wm-mode"><option value="text">Text</option><option value="logo">Logo or image</option></select></div>
      <div id="wm-text-box">
        <div class="field"><label for="wm-text">Text</label><input type="text" id="wm-text" value="Your name" maxlength="120" autocomplete="off"></div>
        <div class="row2">
          <div class="field"><label for="wm-font">Font</label><select id="wm-font"><option value="Arial, Helvetica, sans-serif">Arial</option><option value="Verdana, Geneva, sans-serif">Verdana</option><option value="'Trebuchet MS', sans-serif">Trebuchet</option><option value="Georgia, serif">Georgia</option><option value="'Times New Roman', Times, serif">Times</option><option value="'Courier New', monospace">Courier</option><option value="Impact, 'Arial Black', sans-serif">Impact</option><option value="'Brush Script MT', cursive">Script</option></select></div>
          <div class="field"><label for="wm-color">Color</label><input type="color" id="wm-color" value="#ffffff"></div>
        </div>
        <label class="check"><input type="checkbox" id="wm-bold" checked> Bold</label>
        <label class="check"><input type="checkbox" id="wm-outline" checked> Add an outline so it shows on any photo</label>
      </div>
      <div id="wm-logo-box" hidden>
        <div class="field"><label for="wm-logo">Logo file</label><input type="file" id="wm-logo" accept="image/*"><p class="help" id="wm-logo-name">A PNG with a transparent background works best.</p></div>
      </div>
      <div class="field"><label for="wm-size">Size: <b id="wm-size-v"></b> of the image width</label><input type="range" id="wm-size" min="2" max="80" value="8"></div>
      <div class="field"><label for="wm-opacity">Opacity: <b id="wm-opacity-v"></b></label><input type="range" id="wm-opacity" min="5" max="100" value="70"></div>
      <div class="field"><label for="wm-rot">Rotation: <b id="wm-rot-v"></b></label><input type="range" id="wm-rot" min="-180" max="180" value="0"></div>
      <div class="field"><label id="wm-pos-l">Position</label><div class="wm-seg" id="wm-pos" role="group" aria-labelledby="wm-pos-l"></div>
        <label class="check" style="margin-top:12px"><input type="checkbox" id="wm-tile"> Repeat across the whole image (tiled)</label></div>
      <div class="field" id="wm-margin-row"><label for="wm-margin">Margin from the edge: <b id="wm-margin-v"></b></label><input type="range" id="wm-margin" min="0" max="20" value="3"></div>
      <div class="field" id="wm-gap-row" hidden><label for="wm-gap">Space between copies: <b id="wm-gap-v"></b></label><input type="range" id="wm-gap" min="0" max="40" value="8"></div>
      <div class="row2">
        <div class="field"><label for="wm-out">Save as</label><select id="wm-out"><option value="image/png">PNG (sharpest)</option><option value="image/jpeg">JPG (smaller)</option></select></div>
        <div class="field" id="wm-q-row" hidden><label for="wm-q">JPG quality</label><input type="range" id="wm-q" min="40" max="100" value="92"></div>
      </div>
    </div>
    <p class="help" id="wm-status" role="status"></p>
  </div>
  <div class="card preview" aria-live="polite">
    <div class="wm-stage empty" id="wm-stage"><canvas id="wm-canvas" aria-label="Preview of the watermarked image"></canvas><div class="wm-empty">Your image appears here</div></div>
    <p class="help" id="wm-hint" style="text-align:center"></p>
    <div id="wm-files" hidden>
      <ul class="wm-list" id="wm-list"></ul>
    </div>
    <div class="btns"><button type="button" class="btn primary" id="wm-apply" disabled>Apply watermark</button><button type="button" class="btn" id="wm-zip" hidden disabled>Download all as ZIP</button><button type="button" class="btn" id="wm-clear">Clear all</button></div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to add a watermark to a photo</h2>
<ol>
<li><b>Add your photos.</b> Drop one or many images on the box, or paste them.</li>
<li><b>Choose text or a logo.</b> Type your name or brand, or upload a logo. A PNG logo with a transparent background looks best.</li>
<li><b>Style it.</b> Pick the font, color, size, opacity and rotation. The preview updates as you move the controls.</li>
<li><b>Place it.</b> Choose one of nine positions, or tile the watermark across the whole image.</li>
<li><b>Apply and download.</b> The same watermark is added to every image. Save them one by one, or as a single ZIP.</li>
</ol></section>
<section class="block prose"><h2>Tips for a watermark that works</h2>
<ul>
<li><b>Tile it to protect a photo.</b> A single mark in a corner is easy to crop out. A repeated, slightly see-through, rotated mark across the image is much harder to remove.</li>
<li><b>Use a corner mark for branding.</b> A small logo in the bottom right corner with 60 to 80% opacity looks professional and does not spoil the picture.</li>
<li><b>Keep it readable.</b> Turn on the outline for text so it shows on both light and dark areas.</li>
<li><b>Size is relative.</b> The size is a share of each image width, so a batch of photos in different sizes all get a watermark of the same look.</li>
<li><b>Save a copy.</b> Keep your original photos. A watermarked file is a new file and the original is never changed.</li>
</ul></section>
<section class="block prose"><h2>Common uses</h2>
<ul>
<li>Photographers marking proofs and portfolio pictures.</li>
<li>Shops adding a brand name to product photos.</li>
<li>Designers and artists crediting their work online.</li>
<li>Marking a document photo with a note such as "For verification only".</li>
</ul></section>'''

PAGE = dict(
    title='Watermark Maker: Add a Text or Logo Watermark to Photos',
    desc='Add a text or logo watermark to one or many photos, free. Choose font, color, opacity, rotation and position, or tile it. Download PNG or JPG, or a ZIP.',
    h1='Watermark maker', app='Watermark Maker',
    lead='Add your name, brand or logo to a photo, or to a whole batch at once. Place it in a corner or repeat it across the image. Everything runs in your browser and your images are never uploaded.',
    tool=TOOL, vendor=['fflate/fflate.min.js'], own=['wmtool.js'], css=['watermark-maker.css'],
    sections=SECTIONS,
    faq=[
        ('Is this watermark maker free?', 'Yes. There is no sign-up, no limit on images and no watermark of ours added to your pictures.'),
        ('Are my photos uploaded?', 'No. The watermark is drawn in your browser on your own device. Your images are never sent to a server.'),
        ('Can I watermark many photos at once?', 'Yes. Add all the images, set the watermark once, press Apply to all, then download each file or a ZIP of everything.'),
        ('Can I use my logo instead of text?', 'Yes. Choose Logo or image as the type and upload your file. A PNG with a transparent background works best, and you can set its size, opacity and rotation.'),
        ('How do I make a watermark harder to remove?', 'Turn on the repeat option, rotate the mark a little, and use a medium opacity. A mark that covers the whole picture is much harder to crop or edit out than one in a corner.'),
        ('Will it change the size of my photo?', 'No. The output has the same width and height as the original. Choose PNG for the sharpest result or JPG for a smaller file.'),
        ('Does it change the original file?', 'No. Your original stays as it is. You download new files with -watermarked added to the name.'),
    ],
    related=['image-converter', 'remove-background', 'color-picker', 'pdf-converter', 'qr-code-generator'])
