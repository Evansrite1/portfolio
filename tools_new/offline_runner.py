INFO = dict(slug='offline-runner', kicker='Games', tile_title='Offline runner',
            tile_desc='The jump-and-duck runner you get when the internet drops, but you design it: your runner, the world, the speed, the jump and the obstacles.', nav='Offline runner')


def sel(id_, label, opts):
    return '<span class="gm-label">%s</span><select id="%s" aria-label="%s">%s</select>' % (label, id_, label, ''.join('<option value="%s">%s</option>' % (v, t) for v, t in opts))


def chk(id_, label):
    return '<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="%s"> %s</label>' % (id_, label)


TOOL = ('<div class="tool" id="runner" style="grid-template-columns:1fr"><div class="card"><div class="gm-stats"><div><b id="rn-score">0</b><span>Distance</span></div><div><b id="rn-best">0</b><span>Best</span></div></div>'
        '<canvas id="rn-cv" width="800" height="260" aria-label="Runner game"></canvas><p class="gm-msg" id="rn-msg" role="status" aria-live="polite"></p>'
        '<div class="btns" style="justify-content:center;margin-top:8px"><button type="button" class="btn primary" id="rn-jump">Jump</button><button type="button" class="btn" id="rn-duck">Hold to duck</button><button type="button" class="btn" id="rn-new">Restart</button></div></div>'
        '<div class="card gm-card"><h2 style="margin:0 0 6px;font-size:1.1rem">Design your game</h2><div class="gm-row2"><div>' +
        sel('rn-shape', 'Your runner', [('block', 'Block'), ('round', 'Round'), ('triangle', 'Triangle'), ('rocket', 'Rocket')]) + '</div><div><span class="gm-label">Runner colour</span><input type="color" id="rn-color" aria-label="Runner colour"></div><div>'
        '<span class="gm-label">Name above your runner</span><input type="text" id="rn-name" maxlength="14" aria-label="Runner name"></div><div>' +
        sel('rn-theme', 'World', [('day', 'Day'), ('night', 'Night'), ('desert', 'Desert'), ('neon', 'Neon'), ('forest', 'Forest')]) + '</div><div>' +
        sel('rn-start', 'Starting speed', [('easy', 'Easy'), ('normal', 'Normal'), ('fast', 'Fast'), ('crazy', 'Crazy')]) + '</div><div>' + sel('rn-accel', 'How fast it speeds up', [('none', 'Never'), ('gentle', 'Gently'), ('steady', 'Steadily'), ('wild', 'Wildly')]) + '</div><div>'
        '<span class="gm-label">Jump height</span><input type="range" id="rn-jumph" min="10" max="100" aria-label="Jump height"></div><div><span class="gm-label">Gravity</span><input type="range" id="rn-grav" min="0" max="100" aria-label="Gravity"></div></div>'
        '<div style="margin-top:10px">' + chk('rn-pillars', 'Pillars to jump over') + chk('rn-flyers', 'Flyers to duck under') + chk('rn-coins', 'Coins to collect') + chk('rn-sound', 'Sound') + '</div>'
        '<div class="btns" style="margin-top:10px"><button type="button" class="btn" id="rn-reset">Put everything back</button></div>'
        '<p class="help">Space or Up to jump. Down to duck, and in the air Down makes you fall faster. On a phone, tap the game to jump and hold Hold to duck. Your design and best distance are saved in your browser.</p></div></div>')

SECTIONS = '''<section class="block prose"><h2>About this game</h2>
<p>You may know the little runner game that shows up in some browsers when the internet is down. This is an original game in the same spirit, and you can change almost everything: the shape, colour and name of your runner, the world it runs through, how fast it starts and how quickly it speeds up, how high you jump, how strong gravity is, and which obstacles and coins appear.</p>
<p>Jump over pillars, duck under flyers, grab coins for bonus distance and see how far you can go. It runs in your browser, even with no connection once the page has loaded.</p></section>'''

PAGE = dict(
    title='Offline Runner Game: Customize Your Runner, World and Speed',
    desc='A jump-and-duck runner game you can customize: your runner, the world, speed, jump height, obstacles and coins. Free, works offline once loaded, saves your best distance.',
    h1='Offline runner', app='Offline Runner Game', lead='The jump-and-duck runner, but you design it: your runner, the world, the speed, the jump and the obstacles.',
    tool=TOOL, vendor=[], own=['runner.js'], module=[], css=['games.css'], sections=SECTIONS,
    faq=[('Is this the Chrome dinosaur game?', 'No. It is an original game in the same spirit, drawn with simple shapes, and it has settings the browser game does not have.'),
         ('How do I play on a phone?', 'Tap the game to jump and hold the Hold to duck button to duck.'),
         ('Does it work without internet?', 'Yes, once the page has loaded. That is what makes it handy when your connection drops.'), ('Is my design saved?', 'Yes, in your own browser. Press Put everything back to reset.')],
    related=['snake', 'tic-tac-toe', 'quiz-live', 'color-picker'])
