INFO = dict(slug='currency-calculator', kicker='Money', tile_title='Currency calculator',
            tile_desc='Convert between about 160 currencies with live reference rates, a margin option and a pinned table.', nav='Currency calculator')


def picker(id_, label, ph):
    return ('<div class="field"><label for="%s">%s</label><div class="fx-pick">'
            '<input type="text" id="%s" role="combobox" aria-expanded="false" aria-controls="%s-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="%s">'
            '<ul class="fx-list" id="%s-list" role="listbox" aria-label="%s" hidden></ul></div></div>') % (id_, label, id_, id_, ph, id_, label)


TOOL = '''<div class="tool" id="fx-tool">
  <div class="card">
    <div class="field"><label for="fx-amount">Amount</label><input type="text" id="fx-amount" inputmode="decimal" autocomplete="off" value="1000" aria-describedby="fx-err"><p class="warn" id="fx-err" role="alert"></p></div>
    <div class="fx-swaprow">
      ''' + picker('fx-from', 'From', 'Type a currency or country') + '''
      <button type="button" class="btn fx-swap" id="fx-swap" aria-label="Swap the two currencies">Swap</button>
      ''' + picker('fx-to', 'To', 'Type a currency or country') + '''
    </div>
    <div class="field"><label for="fx-fee">Bank or exchange margin, percent (optional)</label><input type="text" id="fx-fee" inputmode="decimal" autocomplete="off" placeholder="0" style="max-width:160px">
      <p class="help">Banks, card companies and exchange offices usually give you a worse rate than the reference rate. Enter their margin to see about what you would really receive.</p></div>
    <div class="btns" style="margin-top:6px"><button type="button" class="btn" id="fx-refresh">Refresh rates</button></div>
  </div>

  <div class="card preview" aria-live="polite">
    <p class="fx-result" id="fx-result">-</p>
    <p class="fx-rateline" id="fx-rateline"></p>
    <div class="btns"><button type="button" class="btn primary" id="fx-copy" disabled>Copy result</button></div>
    <p class="fx-src" id="fx-src" role="status">Loading exchange rates...</p>
  </div>
</div>
<div class="card" style="margin:0 0 10px" id="fx-table-card">
  <h2 style="font-size:1.2rem;margin:0 0 4px">Your amount in other currencies</h2>
  <p class="help" style="margin:0 0 8px">The amount above, converted from <b id="fx-table-from">USD</b>. Your list is saved in this browser.</p>
  <table class="fx-table"><thead><tr><th scope="col">Currency</th><th scope="col" class="num">Amount</th><th scope="col" class="num">Rate</th><th scope="col"><span class="sr-only" style="position:absolute;left:-999px">Remove</span></th></tr></thead><tbody id="fx-rows"></tbody></table>
  <div class="fx-pinrow">''' + picker('fx-pin', 'Add a currency to the table', 'Type a currency or country') + '''<button type="button" class="btn" id="fx-pin-add" style="margin-bottom:0">Add</button></div>
  <p class="help" id="fx-pin-help"></p>
</div>'''

SECTIONS = '''<section class="block prose"><h2>How to convert currency</h2>
<ol>
<li><b>Type the amount</b> and choose the currency you have and the currency you want. Type a name, a code or a country to search the list.</li>
<li><b>Read the result.</b> It updates as you type, with the rate used and the time the rates were published.</li>
<li><b>Add the margin (optional).</b> If you are paying by card or using a bank or exchange office, enter their margin in percent to see about what you would actually get or pay.</li>
<li><b>Use the table.</b> Your amount is also shown in your pinned currencies, such as naira, dollars, euros, pounds, Kenyan shillings, cedis, rand, dirhams and Kuwaiti dinar. Add or remove currencies to suit you.</li>
</ol></section>
<section class="block prose"><h2>What these rates are</h2>
<p>The rates on this page are mid-market reference rates, the midpoint between buying and selling prices on the international currency market. They are downloaded when you open the page from the free rate service named under the result, and they update about once a day. They are good for planning, pricing and checking a quote.</p>
<p>They are not the rate you will be given. A bank, a card company, a transfer service or an exchange office adds a margin or a fee. For some currencies, such as the Nigerian naira, the street or parallel market rate can also differ from the official reference rate. Always check the rate you are offered before you send or exchange money.</p></section>
<section class="block prose"><h2>Privacy</h2>
<p>The only thing that leaves your browser is the request for the exchange-rate list, which is the same for everyone. The amount you type, the currencies you choose and your pinned list stay in your browser. The last rates are saved in your browser so the page still works for a short while without a connection.</p></section>
<section class="block prose"><h2>Common uses</h2>
<ul>
<li>Pricing a product or invoice in a customer's currency.</li>
<li>Checking an online price or a quote from abroad.</li>
<li>Planning a trip or a transfer to family.</li>
<li>Working out how much a bank or card margin costs on a large amount.</li>
</ul>
<p class="help">Rates by <a href="https://www.exchangerate-api.com" rel="noopener">Exchange Rate API</a>.</p></section>'''

PAGE = dict(
    title='Currency Converter: Live Exchange Rates, 160 Currencies',
    desc='Free currency calculator with about 160 currencies, live mid-market rates, a bank margin option and a table of your favourite currencies. Naira, dollar, euro, pound and more.',
    h1='Free currency calculator', app='Free Currency Calculator',
    lead='Convert between about 160 currencies using reference exchange rates, see the rate and when it was published, and add a bank or exchange margin to estimate what you would really get.',
    tool=TOOL, vendor=[], own=['fxtool.js'], module=[], css=['currency-calculator.css'],
    sections=SECTIONS,
    faq=[
        ('Where do the exchange rates come from?', 'From the free open.er-api.com service by Exchange Rate API, downloaded in your browser when the page opens. If that is unreachable, the page tries a second free source. The name of the source and the time the rates were published are shown under every result.'),
        ('Are these the rates my bank will give me?', 'No. These are mid-market reference rates. Banks, card companies and exchange offices add a margin or fee. Use the margin box to estimate that cost.'),
        ('Why is the naira rate different from what I see on the street?', 'The reference rate follows the official and international market. The street or parallel market rate for the Nigerian naira, or for any currency with a gap between official and informal markets, can be different. Check the rate you are offered.'),
        ('Does it work offline?', 'Partly. The page saves the last downloaded rates in your browser and uses them if the download fails. If there are no saved rates it uses an approximate table copied on 23 October 2026 and clearly says so, and those numbers can be far out of date.'),
        ('How often do the rates update?', 'The main source publishes new rates about once a day, and the page shows the exact time of the rates it is using. Press Refresh rates to download them again.'),
        ('What leaves my browser when I use the calculator?', 'Only the request for the list of rates. Your amount, your chosen currencies and your pinned list stay in your browser.'),
        ('Can I change the currencies in the table?', 'Yes. Remove any row with the x button and add others with the search box under the table. The list is saved in your browser.')
    ],
    related=['invoice-generator', 'receipt-generator', 'whatsapp-link-generator', 'qr-code-generator'])
