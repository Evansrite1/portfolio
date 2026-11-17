INFO = dict(slug='weather', kicker='Everyday', tile_title='Weather',
            tile_desc='The weather for almost any place in the world: now, the next 24 hours and 7 days, from a free weather service. Search a place or use your location.', nav='Weather')

TOOL = ('<div class="tool" id="wx" style="grid-template-columns:1fr"><div class="card">'
        '<div class="row" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start"><div class="pick-wrap" style="flex:1;min-width:220px"><label for="wx-q" class="gm-label" style="margin-top:0">Search a city, town or place</label>'
        '<input type="text" id="wx-q" autocomplete="off" placeholder="For example Lagos, Kuwait City, London" role="combobox" aria-expanded="false" aria-controls="wx-list"><ul class="pick-list" id="wx-list" role="listbox" hidden></ul></div>'
        '<div style="padding-top:22px"><button type="button" class="btn" id="wx-loc">Use my location</button></div>'
        '<div style="padding-top:22px"><div class="seg-row" style="margin:0"><button type="button" class="chip" data-wu="metric">C and km/h</button><button type="button" class="chip" data-wu="imperial">F and mph</button></div></div></div>'
        '<div class="seg-row" id="wx-saved" style="margin-top:10px"></div></div>'
        '<div class="card"><div id="wx-out" aria-live="polite"></div><div class="btns" style="margin-top:12px"><button type="button" class="btn" id="wx-fav" hidden>Add to favourites</button></div>'
        '<p class="help">Weather data by <a href="https://open-meteo.com/" rel="noopener">Open-Meteo</a>, free and without a sign-up. Forecasts can change.</p></div></div>')

SECTIONS = '''<section class="block prose"><h2>Weather for almost any place</h2>
<p>Type the name of a city, town or village and pick it from the list. You get the temperature now and how it feels, the wind, humidity, cloud cover, pressure and UV index, sunrise and sunset, the next 24 hours hour by hour, and a 7 day forecast with the chance of rain.</p>
<p>Press <b>Use my location</b> to see your own weather, switch between Celsius with km/h and Fahrenheit with mph, and add places to your favourites. Your favourites and your last places are kept in your browser only.</p></section>'''

PAGE = dict(
    title='Weather: Current Weather and 7 Day Forecast for Any City',
    desc='Free weather for almost any place: temperature now, the next 24 hours and a 7 day forecast with rain chance, wind, UV and sunrise. Search a city or use your location.',
    h1='Weather', app='Weather', lead='The weather for almost any place in the world, from a free weather service. Search a place or use your location.',
    tool=TOOL, vendor=[], own=['weather.js'], module=[], css=['games.css'], sections=SECTIONS,
    faq=[('Where does the weather data come from?', 'From Open-Meteo, a free open weather service that combines national weather models. No account or key is needed.'),
         ('Can I see the weather where I am?', 'Yes. Press Use my location and allow your browser to share it. Your position is only used to ask for the weather and is not stored.'),
         ('Can I switch to Fahrenheit?', 'Yes. Choose F and mph above the weather.'), ('How accurate is it?', 'It is a forecast: the next hours are usually reliable, and later days are less certain.')],
    related=['crypto-prices', 'currency-calculator', 'business-card', 'snake'])
