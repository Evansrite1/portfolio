INFO = dict(slug='merge-pdf', kicker='PDF', tile_title='Merge PDF',
            tile_desc='Combine several PDFs into one. Reorder files and pick page ranges. Nothing is uploaded.', nav='Merge PDF')

TOOL = '''<div class="tool pdf-tool" id="mp-tool">
  <div class="card">
    <div class="scan-drop" id="mp-drop">
      <p style="margin:0 0 12px"><b>Drop PDF files here</b> or choose files</p>
      <button type="button" class="btn primary" id="mp-pick">Choose PDFs</button>
      <input type="file" id="mp-file" accept="application/pdf,.pdf" multiple hidden aria-label="Choose PDF files">
      <p class="help">Add two or more PDFs. Password protected files must be unlocked first.</p>
    </div>

    <div id="mp-work" hidden style="margin-top:20px">
      <div class="pdf-bar">
        <p class="pdf-count" id="mp-count"></p>
        <div class="btns"><button type="button" class="btn" id="mp-add">Add more PDFs</button><button type="button" class="btn" id="mp-clear">Clear all</button></div>
      </div>
      <ul class="pdf-list" id="mp-list" aria-label="PDF files, in merge order"></ul>
      <p class="help">To use only some pages of a file, type them in its Pages box, for example 1-3, 5. Leave it empty to use every page.</p>
      <div class="btns" style="margin-top:16px"><button type="button" class="btn primary" id="mp-go">Merge PDFs</button></div>
      <div class="pdf-progress" id="mp-prog" hidden><span id="mp-pb"></span></div>
    </div>
    <p class="help" id="mp-status" role="status" aria-live="polite"></p>
    <div class="pdf-result" id="mp-result" hidden></div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to merge PDF files</h2>
<ol>
<li><b>Add your PDFs.</b> Drop two or more files on the box, or choose them. Each file shows its page count and a picture of its first page.</li>
<li><b>Set the order.</b> Drag files up or down, or use the arrow buttons. The merged PDF follows the list from top to bottom.</li>
<li><b>Pick pages (optional).</b> Type a page range such as 1-3, 5 in the Pages box of any file to use only those pages.</li>
<li><b>Merge and download.</b> Press Merge PDFs, check the page count and save the new file.</li>
</ol></section>
<section class="block prose"><h2>Merge only the pages you need</h2>
<p>You do not have to merge whole files. Type 1-3, 5 to take pages 1, 2, 3 and 5, or 4- to take everything from page 4 to the end. Pages are merged in the order you type them, so 5, 1-2 puts page 5 first. Add the same file twice if you want to use different parts of it in different places.</p></section>
<section class="block prose"><h2>Tips and common uses</h2>
<ul>
<li>Combine a cover letter, CV and certificates into one application file.</li>
<li>Join invoices or statements from several months into a single document.</li>
<li>If a file says it is password protected, open it in your PDF viewer, save a copy without the password, and add that copy.</li>
<li>Pages keep their original size and rotation. Bookmarks and interactive form fields from the source files may not carry over.</li>
</ul></section>'''

PAGE = dict(
    title='Merge PDF: Combine PDF Files into One, Free and Private',
    desc='Merge PDF files online, free. Add several PDFs, drag to reorder, choose page ranges per file and get one PDF. Runs in your browser, nothing is uploaded.',
    h1='Merge PDF files', app='Merge PDF',
    lead='Combine several PDFs into one. Reorder the files, use only the pages you want from each, and download the result. Everything runs in your browser, so your files are never uploaded.',
    tool=TOOL, vendor=['pdf-lib/pdf-lib.min.js'], own=[], module=['mergepdf.js'], css=['pdf-tools.css'],
    sections=SECTIONS,
    faq=[
        ('Is this PDF merger free?', 'Yes. There is no sign-up, no watermark and no limit on how many PDFs you merge.'),
        ('Are my PDFs uploaded to a server?', 'No. The files are merged inside your browser on your own device, so they never leave it. That makes it safe for private documents.'),
        ('How do I change the order of the files?', 'Drag a file up or down in the list, or press the up and down arrows on it. The merged PDF follows the list from top to bottom.'),
        ('Can I merge only some pages of a file?', 'Yes. Type a range such as 1-3, 5 in the Pages box of that file. Leave the box empty to use every page.'),
        ('Why does it say my PDF is password protected?', 'The file is encrypted, and this tool cannot read pages without the password. Open it in a PDF viewer, save or print a copy without the password, and add that copy instead.'),
        ('What happens with a damaged PDF?', 'The tool tells you which file could not be read and does not add it. The other files are not affected, so you can carry on without it.'),
        ('Is there a limit on file size?', 'There is no fixed limit. Very large PDFs depend on your device memory, because the work happens on your own computer. If a merge fails, try fewer files at a time.'),
    ],
    related=['split-pdf', 'image-to-pdf', 'invoice-generator', 'receipt-generator', 'image-converter'])
