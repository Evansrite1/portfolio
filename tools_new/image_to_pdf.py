INFO = dict(slug='image-to-pdf', kicker='PDF', tile_title='Image to PDF',
            tile_desc='Turn JPG, PNG and WebP images into one PDF. Reorder, rotate, pick page size.', nav='Image to PDF')

TOOL = '''<div class="tool pdf-tool" id="ip-tool">
  <div class="card">
    <div class="scan-drop" id="ip-drop">
      <p style="margin:0 0 12px"><b>Drop images here</b> or choose files</p>
      <button type="button" class="btn primary" id="ip-pick">Choose images</button>
      <input type="file" id="ip-file" accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif" multiple hidden aria-label="Choose images">
      <p class="help">JPG, PNG, WebP, GIF, BMP or AVIF. Add as many as you like. You can also paste images.</p>
    </div>

    <div id="ip-work" hidden style="margin-top:20px">
      <div class="pdf-bar">
        <p class="pdf-count" id="ip-count"></p>
        <div class="btns"><button type="button" class="btn" id="ip-add">Add more images</button><button type="button" class="btn" id="ip-clear">Clear all</button></div>
      </div>
      <ul class="pdf-list" id="ip-list" aria-label="Images, in page order"></ul>

      <div class="pdf-opts">
        <div class="field"><label for="ip-size">Page size</label><select id="ip-size"><option value="a4">A4</option><option value="letter">US Letter</option><option value="fit">Fit to image</option></select></div>
        <div class="field"><label for="ip-orient">Orientation</label><select id="ip-orient"><option value="auto">Auto (match each image)</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div>
        <div class="field"><label for="ip-margin">Margin</label><select id="ip-margin"><option value="none">None</option><option value="small">Small</option><option value="big">Big</option></select></div>
        <div class="field"><label for="ip-quality">Image quality</label><select id="ip-quality"><option value="original">Original (no recompression)</option><option value="high">High</option><option value="medium">Medium (smaller PDF)</option><option value="small">Small (smallest PDF)</option></select></div>
      </div>
      <p class="help">Original keeps JPG and PNG files exactly as they are. The other choices recompress every image as a JPEG and limit its size to make the PDF smaller.</p>

      <div class="btns" style="margin-top:16px"><button type="button" class="btn primary" id="ip-go">Create PDF</button></div>
      <div class="pdf-progress" id="ip-prog" hidden><span id="ip-pb"></span></div>
    </div>
    <p class="help" id="ip-status" role="status" aria-live="polite"></p>
    <div class="pdf-result" id="ip-result" hidden></div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to turn images into a PDF</h2>
<ol>
<li><b>Add your images.</b> Drop JPG, PNG or WebP files on the box, choose them, or paste them. You can add more at any time.</li>
<li><b>Put them in order.</b> Drag an image up or down, or use the arrow buttons. Rotate any image by 90 degrees, or remove it.</li>
<li><b>Choose the page.</b> Pick A4, US Letter or Fit to image, then the orientation and margin.</li>
<li><b>Create and download.</b> Press Create PDF. The page count and file size are shown before you save.</li>
</ol></section>
<section class="block prose"><h2>Keep the quality, or make the PDF smaller</h2>
<p>With Original quality, JPG and PNG files go into the PDF exactly as they are, so nothing is recompressed and the picture stays sharp. Other formats such as WebP, GIF, BMP and AVIF are converted to JPEG first, because PDF cannot store them directly.</p>
<p>If the PDF is too big to email or upload, choose Medium or Small. Every image is then recompressed as a JPEG and reduced to a sensible size, which usually cuts a PDF of phone photos to a fraction of its size.</p></section>
<section class="block prose"><h2>Common uses</h2>
<ul>
<li>Combine photos of receipts, forms or ID pages into one document to send.</li>
<li>Turn scanned pages or phone photos of paper into a single PDF.</li>
<li>Make a simple photo album or portfolio PDF in the order you choose.</li>
<li>Put screenshots into one file for a report or a support ticket.</li>
</ul></section>'''

PAGE = dict(
    title='Image to PDF: Combine JPG, PNG, WebP into One PDF, Free',
    desc='Convert images to one PDF online, free. Add JPG, PNG or WebP, reorder, rotate, pick A4, Letter or fit to image. Runs in your browser, nothing is uploaded.',
    h1='Image to PDF converter', app='Image to PDF',
    lead='Combine JPG, PNG and WebP images into one PDF. Put them in order, rotate them and pick the page size. Everything runs in your browser, so your images are never uploaded.',
    tool=TOOL, vendor=['pdf-lib/pdf-lib.min.js'], own=[], module=['imgpdf.js'], css=['pdf-tools.css'],
    sections=SECTIONS,
    faq=[
        ('Is this image to PDF converter free?', 'Yes. There is no sign-up, no watermark and no limit on how many PDFs you make.'),
        ('Are my images uploaded anywhere?', 'No. The PDF is built inside your browser on your own device, so your images never leave it.'),
        ('Which image formats can I use?', 'JPG, PNG and WebP work, and so do GIF, BMP and AVIF if your browser can open them. JPG and PNG go in unchanged. The other formats are converted to JPEG first.'),
        ('Will the PDF lose image quality?', 'Not with the Original setting. JPG and PNG images are placed in the PDF without recompression. Choose High, Medium or Small only if you want a smaller file.'),
        ('Can I change the order of the pages?', 'Yes. Drag the images in the list, or use the up and down buttons on each one. The page order in the PDF follows the list.'),
        ('What page sizes are available?', 'A4, US Letter, or Fit to image, where each page takes the exact shape of its picture. You can also set portrait, landscape or automatic orientation, and a margin.'),
        ('Can I rotate a sideways photo?', 'Yes. Press the rotate button on an image to turn it 90 degrees each time. Photos taken with a phone that carry rotation information are turned the right way up for you.'),
    ],
    related=['merge-pdf', 'split-pdf', 'image-converter', 'remove-background', 'watermark-maker'])
