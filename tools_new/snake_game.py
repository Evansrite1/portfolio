INFO = dict(slug='snake', kicker='Games', tile_title='Snake',
            tile_desc='The classic snake game with four speeds, three board sizes, walls or wrap-around, your own colour and a saved high score. Works with arrows, WASD or a swipe.', nav='Snake')


def sel(id_, label, opts):
    return '<span class="gm-label">%s</span><select id="%s" aria-label="%s">%s</select>' % (label, id_, label, ''.join('<option value="%s">%s</option>' % (v, t) for v, t in opts))


TOOL = ('<div class="tool" id="snake"><div class="card"><div class="gm-stats"><div><b id="sn-score">0</b><span>Score</span></div><div><b id="sn-best">0</b><span>Best</span></div></div>'
        '<canvas id="sn-cv" width="450" height="450" aria-label="Snake game board"></canvas>'
        '<p class="gm-msg" id="sn-msg" role="status" aria-live="polite"></p>'
        '<div class="sn-pad"><button type="button" class="btn u" data-sd="up" aria-label="Up">Up</button><button type="button" class="btn l" data-sd="left" aria-label="Left">Left</button><button type="button" class="btn d" data-sd="down" aria-label="Down">Down</button><button type="button" class="btn r" data-sd="right" aria-label="Right">Right</button></div>'
        '<div class="btns" style="margin-top:12px;justify-content:center"><button type="button" class="btn primary" id="sn-new">New game</button><button type="button" class="btn" id="sn-pause">Pause</button></div></div>'
        '<div class="card gm-card"><h2 style="margin:0 0 6px;font-size:1.1rem">Make it yours</h2><div class="gm-row2"><div>' +
        sel('sn-speed', 'Speed', [('slow', 'Slow'), ('normal', 'Normal'), ('fast', 'Fast'), ('insane', 'Insane')]) + '</div><div>' + sel('sn-size', 'Board size', [('small', 'Small'), ('medium', 'Medium'), ('large', 'Large')]) + '</div><div>' +
        sel('sn-walls', 'Walls', [('solid', 'Solid walls'), ('wrap', 'Wrap around')]) + '</div><div>' + sel('sn-theme', 'World', [('dark', 'Dark'), ('light', 'Light'), ('forest', 'Forest'), ('ocean', 'Ocean')]) + '</div><div>' +
        '<span class="gm-label">Snake colour</span><input type="color" id="sn-skin" aria-label="Snake colour"></div><div>' + sel('sn-sound', 'Sound', [('on', 'On'), ('off', 'Off')]) + '</div></div>'
        '<p class="help">Arrow keys or W A S D to steer. Space pauses. On a phone, swipe on the board or use the buttons. Your settings and best score are saved in your browser.</p></div></div>')

SECTIONS = '''<section class="block prose"><h2>How to play Snake</h2>
<p>Steer the snake to the red food. Each piece you eat makes the snake longer and adds a point. The game ends if you hit a wall or your own tail. With <b>Wrap around</b> on, the snake comes out of the opposite side instead of hitting the wall.</p>
<p>Pick a speed from Slow to Insane, a board from Small to Large, a world and your own snake colour. Fill the whole board and you win.</p></section>'''

PAGE = dict(
    title='Snake Game Online: Free, Customizable, Works on Phone',
    desc='Play the classic snake game free in your browser. Four speeds, three board sizes, walls or wrap-around, your own colours and a saved high score. Arrow keys, WASD or swipe.',
    h1='Snake', app='Snake Game', lead='The classic snake game. Choose the speed, the board, the walls and your own colour. Your best score is saved.',
    tool=TOOL, vendor=[], own=['snake-core.js', 'snake.js'], module=[], css=['games.css'], sections=SECTIONS,
    faq=[('How do I control the snake?', 'Arrow keys or W A S D on a keyboard. On a phone, swipe on the board or use the buttons under it.'),
         ('What does Wrap around do?', 'The snake comes out on the opposite side of the board instead of crashing into the wall.'),
         ('Is my high score saved?', 'Yes, in your own browser.'), ('Does it work offline?', 'Once the page has loaded it runs without the internet.')],
    related=['tic-tac-toe', 'offline-runner', 'quiz-live', 'color-picker'])
