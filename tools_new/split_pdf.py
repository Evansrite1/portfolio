INFO = dict(slug='split-pdf', kicker='PDF', tile_title='Split PDF',
            tile_desc='Extract, delete or rotate pages, or split a PDF by ranges or every N pages. Private.', nav='Split PDF')

TOOL = '''<div class="tool pdf-tool" id="sp-tool">
  <div class="card">
    <div class="scan-drop" id="sp-drop">
      <p style="margin:0 0 12px"><b>Drop a PDF here</b> or choose a file</p>
      <button type="button" class="btn primary" id="sp-pick">Choose PDF</button>
      <input type="file" id="sp-file" accept="application/pdf,.pdf" hidden aria-label="Choose a PDF file">
      <p class="help">One PDF at a time. Password protected files must be unlocked first.</p>
    </div>

    <div id="sp-work" hidden>
      <div class="pdf-file"><div><b id="sp-name"></b><small id="sp-meta"></small></div><button type="button" class="btn" id="sp-another">Choose another PDF</button></div>

      <div class="pdf-modes" id="sp-modes" role="group" aria-label="What do you want to do?">
        <button type="button" data-mode="extract" aria-pressed="true">Extract pages</button>
        <button type="button" data-mode="ranges" aria-pressed="false">Split by ranges</button>
        <button type="button" data-mode="every" aria-pressed="false">Every N pages</button>
        <button type="button" data-mode="single" aria-pressed="false">Single pages</button>
        <button type="button" data-mode="delete" aria-pressed="false">Delete pages</button>
        <button type="button" data-mode="rotate" aria-pressed="false">Rotate pages</button>
      </div>

      <div class="pdf-panel" id="sp-p-pick">
        <div class="field"><label for="sp-sel" id="sp-sel-lab">Pages to extract</label><input type="text" id="sp-sel" placeholder="for example 1-3, 5" autocomplete="off" spellcheck="false" aria-describedby="sp-selmsg"><p class="help err" id="sp-selmsg" role="status"></p></div>
        <div class="row-inline">
          <button type="button" class="btn" id="sp-all">Select all</button><button type="button" class="btn" id="sp-none">Clear</button><button type="button" class="btn" id="sp-inv">Invert</button><button type="button" class="btn" id="sp-odd">Odd pages</button><button type="button" class="btn" id="sp-even">Even pages</button>
        </div>
        <p class="help">Click the pages below to select them, or type page numbers. Hold Shift and click to select a run of pages. Pages keep their original order.</p>
      </div>
      <div class="pdf-panel" id="sp-p-ranges" hidden>
        <div class="field"><label for="sp-ranges">Ranges, one file each</label><input type="text" id="sp-ranges" placeholder="for example 1-3, 4-6, 7-" autocomplete="off" spellcheck="false"><p class="help">Separate the ranges with commas. Each range becomes its own PDF. 7- means page 7 to the end.</p></div>
      </div>
      <div class="pdf-panel" id="sp-p-every" hidden>
        <div class="field"><label for="sp-n">Pages in each file</label><input type="number" id="sp-n" value="1" min="1" step="1" inputmode="numeric"><p class="help">A 10 page PDF split every 3 pages gives files with 3, 3, 3 and 1 pages.</p></div>
      </div>
      <div class="pdf-panel" id="sp-p-single" hidden>
        <p class="help" style="margin:0">Every page becomes its own PDF. All of them download together as a ZIP.</p>
      </div>
      <div class="pdf-panel" id="sp-p-rotate" hidden>
        <div class="row-inline">
          <button type="button" class="btn" id="sp-rl">Rotate selected left</button><button type="button" class="btn" id="sp-rr">Rotate selected right</button><button type="button" class="btn" id="sp-rall">Rotate all right</button><button type="button" class="btn" id="sp-rreset">Reset rotation</button>
        </div>
        <p class="help">Click pages to select them, then rotate. Rotation is applied to every file you create.</p>
      </div>

      <p class="pdf-count" id="sp-selcount" aria-live="polite"></p>
      <ul class="pdf-grid" id="sp-grid" aria-label="Pages"></ul>

      <p class="help" id="sp-hint"></p>
      <div class="btns" style="margin-top:10px"><button type="button" class="btn primary" id="sp-go">Extract pages</button></div>
      <div class="pdf-progress" id="sp-prog" hidden><span id="sp-pb"></span></div>
    </div>
    <p class="help" id="sp-status" role="status" aria-live="polite"></p>
    <div class="pdf-result" id="sp-result" hidden></div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to split a PDF</h2>
<ol>
<li><b>Add your PDF.</b> Drop it on the box or choose it. Every page appears as a thumbnail.</li>
<li><b>Choose what to do.</b> Extract pages, split by ranges, split every N pages, split into single pages, delete pages or rotate pages.</li>
<li><b>Pick the pages.</b> Click thumbnails, or type ranges such as 1-3, 5.</li>
<li><b>Create and download.</b> One result downloads as a PDF. Several results download together as a ZIP.</li>
</ol></section>
<section class="block prose"><h2>Ways to split a PDF</h2>
<ul>
<li><b>Extract pages</b> keeps only the pages you select and saves them as one new PDF.</li>
<li><b>Split by ranges</b> makes one PDF for each range you type. 1-3, 4-6, 7- gives three files.</li>
<li><b>Every N pages</b> cuts the document into equal parts, handy for upload limits.</li>
<li><b>Single pages</b> turns every page into its own PDF.</li>
<li><b>Delete pages</b> removes the pages you select and keeps the rest.</li>
<li><b>Rotate pages</b> turns selected pages by 90 degrees. Rotation also applies to files made in the other modes.</li>
</ul></section>
<section class="block prose"><h2>Tips</h2>
<ul>
<li>Large PDFs are fine. Thumbnails are drawn only as you scroll, so even a document with hundreds of pages opens quickly.</li>
<li>If the file asks for a password, open it in your PDF viewer, save a copy without the password, and use that copy.</li>
<li>Extracted pages keep their original order. To change the order of pages, split them out and then put them together with the Merge PDF tool.</li>
</ul></section>'''

PAGE = dict(
    title='Split PDF: Extract, Delete or Separate PDF Pages, Free',
    desc='Split a PDF online, free. Extract pages, split by ranges, every N pages or into single pages, delete or rotate pages. Runs in your browser, nothing is uploaded.',
    h1='Split PDF', app='Split PDF',
    lead='Pull pages out of a PDF, split it into several files, delete pages or rotate them. Pick pages by clicking thumbnails. Everything runs in your browser, so your file is never uploaded.',
    tool=TOOL, vendor=['pdf-lib/pdf-lib.min.js', 'fflate/fflate.min.js'], own=[], module=['splitpdf.js'], css=['pdf-tools.css'],
    sections=SECTIONS,
    faq=[
        ('Is this PDF splitter free?', 'Yes. There is no sign-up, no watermark and no limit on how many PDFs you split.'),
        ('Is my PDF uploaded to a server?', 'No. The file is split inside your browser on your own device, so it never leaves it. That makes it safe for private documents.'),
        ('How do I extract certain pages from a PDF?', 'Choose Extract pages, click the thumbnails of the pages you want or type a range such as 1-3, 5, then press Extract pages. You get one new PDF with only those pages.'),
        ('How do I split a PDF into several files?', 'Use Split by ranges to type the parts you want, Every N pages to cut it into equal parts, or Single pages for one file per page. Several files download together as one ZIP.'),
        ('Can I delete pages from a PDF?', 'Yes. Choose Delete pages, select the pages to remove and save. The rest of the document is kept in order.'),
        ('Can I rotate pages?', 'Yes. Choose Rotate pages, select pages and turn them left or right, or rotate every page at once. The rotated PDF is saved as a new file and your original is not changed.'),
        ('Why can I not open my PDF?', 'The tool tells you if the file is password protected or damaged. For a password protected file, save a copy without the password in your PDF viewer first, then use that copy.'),
    ],
    related=['merge-pdf', 'image-to-pdf', 'invoice-generator', 'receipt-generator', 'image-converter'])
