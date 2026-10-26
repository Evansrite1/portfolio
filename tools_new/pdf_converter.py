INFO = dict(slug='pdf-converter', kicker='PDF', tile_title='PDF converter',
            tile_desc='Turn Word, Excel, PowerPoint, images and text into PDF, or PDF into JPG, Word, Excel and more. Merge, split and compress.',
            nav='PDF converter')

def _fmt(code, label, name, pressed=False):
    return '<button type="button" data-fmt="%s" data-label="%s" aria-pressed="%s">%s</button>' % (code, label, 'true' if pressed else 'false', name)

TOOL = '''<div class="tool pdf-tool pc-tool" id="pc-tool" data-mode="to">
  <div class="card">
    <div class="pc-tabs" id="pc-tabs" role="tablist" aria-label="What do you want to do?">
      <button type="button" role="tab" data-mode="to" aria-selected="true" aria-controls="pc-to"><b>To PDF</b><small>Files into a PDF</small></button>
      <button type="button" role="tab" data-mode="from" aria-selected="false" aria-controls="pc-from" tabindex="-1"><b>From PDF</b><small>PDF into other files</small></button>
      <button type="button" role="tab" data-mode="edit" aria-selected="false" aria-controls="pc-edit" tabindex="-1"><b>Edit PDF</b><small>Merge, split, compress</small></button>
    </div>

    <div class="scan-drop pc-drop" id="pc-drop">
      <button type="button" class="pc-plus" id="pc-plus" aria-label="Add files"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
      <p class="pc-drop-t"><b id="pc-drop-title">Drop files here to turn them into a PDF</b></p>
      <button type="button" class="btn" id="pc-pick">Choose files</button>
      <input type="file" id="pc-file" multiple hidden aria-label="Choose files">
      <p class="help" id="pc-drop-help"></p>
      <p class="help pc-private">Your files stay on your device. Everything happens in this browser tab and nothing is uploaded.</p>
    </div>

    <div id="pc-to" role="tabpanel" aria-label="To PDF">
      <div id="pc-to-work" hidden>
        <div class="pdf-bar">
          <p class="pdf-count" id="pc-to-count"></p>
          <div class="btns"><button type="button" class="btn" id="pc-to-add">+ Add files</button><button type="button" class="btn" id="pc-to-clear">Clear all</button></div>
        </div>
        <ul class="pdf-list" id="pc-to-list" aria-label="Files, in PDF order"></ul>

        <div class="pdf-opts">
          <div class="field"><label for="pc-size">Page size</label><select id="pc-size"><option value="a4">A4</option><option value="letter">US Letter</option><option value="fit">Fit to content</option></select></div>
          <div class="field"><label for="pc-orient">Orientation</label><select id="pc-orient"><option value="auto">Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div>
          <div class="field"><label for="pc-margin">Margin</label><select id="pc-margin"><option value="small">Small</option><option value="none">None or very small</option><option value="big">Big</option></select></div>
          <div class="field" id="pc-o-img"><label for="pc-quality">Image quality</label><select id="pc-quality"><option value="original">Original</option><option value="high">High</option><option value="medium">Medium (smaller PDF)</option><option value="small">Small (smallest PDF)</option></select></div>
          <div class="field" id="pc-o-doc"><label for="pc-tsize">Text size</label><select id="pc-tsize"><option value="normal">Normal</option><option value="small">Small</option><option value="large">Large</option></select></div>
        </div>
        <label class="check" id="pc-o-combine"><input type="checkbox" id="pc-combine" checked> Combine everything into one PDF (untick to get one PDF per file)</label>
        <p class="help">Fit to content makes each image page the shape of its picture and keeps the page size of Word files. PowerPoint slides always keep their slide shape. Auto orientation turns pages sideways for wide pictures and wide tables.</p>

        <div class="btns pc-go"><button type="button" class="btn primary" id="pc-to-go">Create PDF</button></div>
      </div>
    </div>

    <div id="pc-from" role="tabpanel" aria-label="From PDF" hidden>
      <div id="pc-from-work" hidden>
        <div class="pdf-bar">
          <p class="pdf-count" id="pc-from-count"></p>
          <div class="btns"><button type="button" class="btn" id="pc-from-add">+ Add PDFs</button><button type="button" class="btn" id="pc-from-clear">Clear all</button></div>
        </div>
        <ul class="pdf-list" id="pc-from-list" aria-label="PDF files to convert"></ul>

        <p class="pc-lab" id="pc-fmt-lab">Convert to</p>
        <div class="pc-fmt" id="pc-fmt" role="group" aria-labelledby="pc-fmt-lab">
          ''' + _fmt('jpg', 'JPG', 'JPG images', True) + _fmt('png', 'PNG', 'PNG images') + _fmt('docx', 'Word', 'Word (.docx)') + _fmt('xlsx', 'Excel', 'Excel (.xlsx)') + _fmt('csv', 'CSV', 'CSV') + _fmt('pptx', 'PowerPoint', 'PowerPoint (.pptx)') + _fmt('txt', 'text', 'Text (.txt)') + _fmt('html', 'HTML', 'HTML web page') + '''
        </div>
        <p class="help" id="pc-fmt-note"></p>

        <div class="pdf-opts">
          <div class="field"><label for="pc-pages">Pages</label><input type="text" id="pc-pages" placeholder="All pages, or for example 1-3, 5" autocomplete="off" spellcheck="false"></div>
          <div class="field" id="pc-o-dpi"><label for="pc-dpi">Resolution</label><select id="pc-dpi"><option value="72">72 DPI (screen, small files)</option><option value="150" selected>150 DPI (good for most uses)</option><option value="200">200 DPI</option><option value="300">300 DPI (print, large files)</option></select></div>
          <div class="field" id="pc-o-jq"><label for="pc-jq">JPG quality</label><select id="pc-jq"><option value="0.92">High</option><option value="0.8">Medium</option><option value="0.6">Low (smallest files)</option></select></div>
        </div>
        <label class="check" id="pc-o-sheets"><input type="checkbox" id="pc-sheets" checked> One sheet for each page</label>
        <label class="check" id="pc-o-breaks"><input type="checkbox" id="pc-breaks" checked> Keep page breaks</label>

        <div class="btns pc-go"><button type="button" class="btn primary" id="pc-from-go">Convert to JPG</button></div>
      </div>
    </div>

    <div id="pc-edit" role="tabpanel" aria-label="Edit PDF" hidden>
      <div id="pc-edit-work" hidden>
        <div class="pdf-bar">
          <ul class="pc-files" id="pc-edit-files" aria-label="Files added"></ul>
          <div class="btns"><button type="button" class="btn" id="pc-edit-add">+ Add PDFs</button><button type="button" class="btn" id="pc-edit-clear">Clear all</button></div>
        </div>
        <div class="pc-toolbar" role="group" aria-label="Page tools">
          <button type="button" class="btn" id="pc-e-all">Select all</button><button type="button" class="btn" id="pc-e-none">Select none</button><button type="button" class="btn" id="pc-e-rl">Rotate left</button><button type="button" class="btn" id="pc-e-rr">Rotate right</button><button type="button" class="btn" id="pc-e-del">Remove selected</button><button type="button" class="btn" id="pc-e-rev">Reverse order</button><button type="button" class="btn" id="pc-e-reset">Start over</button>
        </div>
        <p class="pdf-count" id="pc-selcount" aria-live="polite"></p>
        <ul class="pdf-grid pc-grid" id="pc-grid" aria-label="Pages, in order"></ul>

        <div class="pdf-opts">
          <div class="field"><label for="pc-split">Save as</label><select id="pc-split"><option value="one">One PDF</option><option value="every">Split every N pages</option><option value="ranges">Split by page ranges</option><option value="single">One PDF per page</option></select></div>
          <div class="field" id="pc-o-n"><label for="pc-n">Pages in each file</label><input type="number" id="pc-n" value="2" min="1" step="1" inputmode="numeric"></div>
          <div class="field" id="pc-o-ranges"><label for="pc-ranges">Ranges, one file each</label><input type="text" id="pc-ranges" placeholder="for example 1-3, 4-6, 7-" autocomplete="off" spellcheck="false"></div>
          <div class="field"><label for="pc-comp">Make it smaller</label><select id="pc-comp"><option value="none">No, keep as is</option><option value="images">Shrink pictures (keeps text)</option><option value="flatten">Turn pages into pictures (best for scans)</option></select></div>
          <div class="field" id="pc-o-cq"><label for="pc-cq">Strength</label><select id="pc-cq"><option value="medium">Medium</option><option value="light">Light (best quality)</option><option value="strong">Strong (smallest file)</option></select></div>
        </div>
        <p class="help">Page numbers in ranges follow the order shown above. Shrink pictures recompresses the photos inside the PDF and leaves text and drawings alone. Turn pages into pictures redraws every page as a JPEG, which makes scans much smaller but means the text can no longer be selected.</p>

        <div class="btns pc-go"><button type="button" class="btn primary" id="pc-edit-go">Save PDF</button></div>
      </div>
    </div>

    <div class="pdf-progress" id="pc-prog" hidden><span id="pc-pb"></span></div>
    <p class="help" id="pc-status" role="status" aria-live="polite"></p>
    <div class="pdf-result" id="pc-result" hidden></div>
  </div>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to use the PDF converter</h2>
<ol>
<li><b>Pick what you want to do.</b> To PDF turns your files into a PDF. From PDF turns a PDF into pictures, Word, Excel, PowerPoint, text or a web page. Edit PDF merges, splits, rotates, reorders, deletes and compresses pages.</li>
<li><b>Add your files.</b> Drop them on the box, press the plus button, or paste images. You can add more at any time.</li>
<li><b>Put them in order and choose the options.</b> Drag files or pages, or use the arrow buttons. Pick the page size, the format or how to split.</li>
<li><b>Press the main button and download.</b> One result downloads as one file. Several results download together as a ZIP.</li>
</ol></section>
<section class="block prose"><h2>What you can turn into a PDF</h2>
<ul>
<li><b>Images:</b> JPG, PNG, WebP, GIF, BMP, SVG and iPhone HEIC photos. Add many and they become one PDF, one picture per page, with the page size and margin you choose.</li>
<li><b>Word (.docx):</b> paragraphs, headings, bold and italic text, bullet and numbered lists, tables and pictures.</li>
<li><b>Excel (.xlsx) and CSV:</b> every sheet becomes a table, with the header row repeated on each new page.</li>
<li><b>PowerPoint (.pptx):</b> one page per slide, with the text and pictures where they sit on the slide.</li>
<li><b>Text, Markdown and HTML:</b> plain text keeps its lines. Markdown and HTML keep headings, lists, quotes, code blocks and tables.</li>
<li><b>PDF files:</b> added PDFs are merged in, page for page, without any loss.</li>
</ul></section>
<section class="block prose"><h2>What a PDF can become</h2>
<ul>
<li><b>JPG or PNG:</b> every page as a picture, at 72 to 300 DPI.</li>
<li><b>Word:</b> an editable .docx with the text of each page as headings and paragraphs.</li>
<li><b>Excel or CSV:</b> rows and columns rebuilt from where the text sits on the page. Simple tables such as statements and price lists come out well.</li>
<li><b>PowerPoint:</b> one slide per page, each slide a picture of the page, ready to present.</li>
<li><b>Text or HTML:</b> the words of the document, easy to copy, search or put on a website.</li>
</ul></section>
<section class="block prose"><h2>Honest limits</h2>
<ul>
<li>Word, PowerPoint and HTML files are rebuilt with a simple layout, not drawn by Microsoft Office or a full browser engine. Text, headings, lists, tables and pictures come through. Columns, text boxes, headers and footers, exact fonts, charts, SmartArt and slide animations do not.</li>
<li>The built-in font covers English and other Latin languages, Greek and Cyrillic. Characters it does not have, such as Chinese, Arabic or emoji, are shown as a question mark and the tool tells you when that happens.</li>
<li>Scanned PDFs are pictures of pages. They have no text to extract, so Word, Excel and text output need OCR, which this tool does not do. You can still turn them into JPG or PNG, or make them smaller.</li>
<li>Getting text out of a PDF follows where words sit on the page. Pages with two or more columns may come out line by line across the columns.</li>
<li>Old .doc, .xls and .ppt files need to be saved as .docx, .xlsx or .pptx first. Password protected PDFs must be unlocked first.</li>
<li>Very large files are limited by your device memory, because everything runs on your own computer or phone.</li>
</ul></section>'''

PAGE = dict(
    title='Free PDF Converter: Word, Excel, JPG to PDF and PDF to Word, JPG',
    desc='Convert files to PDF and PDF to other formats, free. Word, Excel, PowerPoint, JPG, PNG, HEIC, text to PDF. PDF to JPG, Word, Excel, CSV, PowerPoint. Merge, split, compress. Runs in your browser.',
    h1='Free PDF converter', app='PDF converter',
    lead='Turn Word, Excel, PowerPoint, images and text into a PDF, or turn a PDF into pictures, Word, Excel, PowerPoint or text. Merge, split, rotate and compress PDFs too. Everything runs in your browser, so your files are never uploaded.',
    tool=TOOL, vendor=['pdf-lib/pdf-lib.min.js', 'fflate/fflate.min.js'], own=[], module=['pdfconv.js'], css=['pdf-tools.css'],
    sections=SECTIONS,
    faq=[
        ('Is this PDF converter free?', 'Yes. There is no sign-up, no watermark and no limit on how many files you convert.'),
        ('Are my files uploaded to a server?', 'No. Every conversion runs inside your browser on your own device, so your files never leave it. That makes it safe for private documents.'),
        ('How do I convert Word to PDF?', 'Choose To PDF, add your .docx file and press Create PDF. Text, headings, lists, tables and pictures are kept. Complex layouts such as columns, text boxes and headers may not look exactly like Word.'),
        ('How do I convert JPG or iPhone photos to PDF?', 'Choose To PDF and add your JPG, PNG or HEIC photos. Put them in order, pick A4, US Letter or Fit to content, and press Create PDF. All the photos go into one PDF.'),
        ('How do I convert a PDF to Word or Excel?', 'Choose From PDF, add the PDF, pick Word or Excel and press Convert. The text of each page is extracted. Excel columns are rebuilt from where the text sits, which works best for simple tables.'),
        ('Why is my PDF to Word file empty?', 'The PDF is probably a scan, which is a picture of a page with no real text in it. Reading that needs OCR, which this tool does not do. You can still convert it to JPG or PNG.'),
        ('How do I convert a PDF to JPG?', 'Choose From PDF, add the PDF, pick JPG images, choose the resolution and press Convert. Every page becomes a picture, and several pictures download together as a ZIP.'),
        ('Can I merge, split or compress a PDF?', 'Yes. Choose Edit PDF and add one or more PDFs. Drag pages to reorder, rotate or remove them, then save as one PDF, split it into several, or make it smaller.'),
        ('Can I convert PowerPoint to PDF?', 'Yes. Add a .pptx file in To PDF. Each slide becomes one page with its text and pictures. Theme effects, charts and animations are not drawn.'),
        ('Does it work on a phone?', 'Yes. It works in current versions of Chrome, Safari, Edge and Firefox on phones, tablets and computers. Large files are faster on a computer.'),
    ],
    related=['image-converter', 'invoice-generator', 'receipt-generator', 'watermark-maker', 'qr-code-generator'])
