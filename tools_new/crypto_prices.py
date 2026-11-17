INFO = dict(slug='crypto-prices', kicker='Money', tile_title='Crypto price tracker',
            tile_desc='Live prices for the top 100 cryptocurrencies and any coin you search, in 18 currencies, with 24 hour and 7 day changes, charts and a watchlist.', nav='Crypto prices')

TOOL = ('<div class="tool" id="cr" style="grid-template-columns:1fr"><div class="card">'
        '<div class="row" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end"><div style="flex:1;min-width:200px"><label for="cr-q" class="gm-label" style="margin-top:0">Search a coin</label><input type="text" id="cr-q" placeholder="Bitcoin, ETH, solana..." autocomplete="off"></div>'
        '<div><label for="cr-cur" class="gm-label" style="margin-top:0">Show prices in</label><select id="cr-cur"></select></div>'
        '<div class="seg-row" style="margin:0"><button type="button" class="chip" data-ct="top">Top coins</button><button type="button" class="chip" data-ct="watch">My watchlist</button></div>'
        '<button type="button" class="btn" id="cr-refresh">Refresh <span id="cr-count" class="help" style="margin:0">60s</span></button></div>'
        '<p class="help" id="cr-status" role="status" style="margin-top:10px"></p>'
        '<div class="cr-tablewrap"><table id="cr-table"></table></div>'
        '<p class="help">Prices from <a href="https://www.coingecko.com/" rel="noopener">CoinGecko</a>. For information only, not financial advice. Crypto prices can move fast and you can lose money.</p></div></div>')

SECTIONS = '''<section class="block prose"><h2>Track crypto prices</h2>
<p>See the live price, the change over the last hour, day and week, the market cap and a 7 day chart for the top 100 cryptocurrencies. Type any coin name or symbol to find one outside the top 100. Press the star next to a coin to add it to your watchlist, and click a column heading to sort.</p>
<p>Choose the currency you want the prices in, from US dollars to naira, cedi, rand, rupees, dirhams and more. The page refreshes by itself every minute while it is open. Your watchlist and settings stay in your browser.</p>
<p>This tool shows prices and does not give advice. It cannot buy, sell or hold any coins.</p></section>'''

PAGE = dict(
    title='Crypto Price Tracker: Live Bitcoin, Ethereum and Top 100 Coin Prices',
    desc='Free live crypto prices for the top 100 coins and any coin you search, in USD, EUR, NGN and more. 24 hour and 7 day change, charts, market cap and a watchlist.',
    h1='Crypto price tracker', app='Crypto Price Tracker', lead='Live prices for the top 100 cryptocurrencies and any coin you search, with 7 day charts and a watchlist.',
    tool=TOOL, vendor=[], own=['crypto.js'], module=[], css=['games.css'], sections=SECTIONS,
    faq=[('Where do the prices come from?', 'From the free CoinGecko price service, which averages prices across many exchanges.'),
         ('How often do prices update?', 'Every minute while the page is open. You can also press Refresh.'),
         ('Can I see prices in naira?', 'Yes. Choose NGN, or one of 17 other currencies, in the Show prices in list.'),
         ('Is this financial advice?', 'No. It only shows prices. Crypto is risky and you can lose money.')],
    related=['currency-calculator', 'weather', 'invoice-receipt-generator', 'quiz-live'])
