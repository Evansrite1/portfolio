INFO = dict(slug='tic-tac-toe', kicker='Games', tile_title='Tic-tac-toe',
            tile_desc='Play the computer on easy, hard or very hard, or play a friend on the same screen. The very hard level never loses.', nav='Tic-tac-toe')


def seg(id_, label, opts):
    return ('<span class="gm-label">%s</span><div class="seg-row" id="%s" role="group" aria-label="%s">%s</div>' %
            (label, id_, label, ''.join('<button type="button" class="chip" data-v="%s" aria-pressed="false">%s</button>' % (v, t) for v, t in opts)))


TOOL = ('<div class="tool" id="ttt"><div class="card">'
        '<div class="gm-stats"><div><b id="ttt-w">0</b><span id="ttt-wl">You</span></div><div><b id="ttt-d">0</b><span>Draws</span></div><div><b id="ttt-l">0</b><span id="ttt-ll">Computer</span></div></div>'
        '<p class="gm-msg" id="ttt-status" role="status" aria-live="polite"></p>'
        '<div class="ttt-grid" id="ttt-grid" role="group" aria-label="Tic-tac-toe board"></div>'
        '<div class="btns" style="margin-top:16px;justify-content:center"><button type="button" class="btn primary" id="ttt-new">New game</button><button type="button" class="btn" id="ttt-reset">Reset the score</button></div>'
        '</div><div class="card gm-card"><h2 style="margin:0 0 6px;font-size:1.1rem">Settings</h2>' +
        seg('ttt-mode', 'Play against', [('cpu', 'The computer'), ('two', 'A friend')]) +
        '<div id="ttt-cpuopts">' + seg('ttt-level', 'How smart is the computer?', [('easy', 'Easy'), ('hard', 'Hard'), ('veryhard', 'Very hard')]) +
        seg('ttt-me', 'You play', [('X', 'X'), ('O', 'O')]) + seg('ttt-first', 'Who goes first?', [('me', 'Me'), ('cpu', 'Computer'), ('alt', 'Take turns')]) + '</div>'
        '<p class="help">Easy plays mostly at random. Hard always takes a win and always blocks yours, but a clever fork can beat it. Very hard looks at every possible game to the end, so the best you can do against it is a draw.</p>'
        '</div></div>')

SECTIONS = '''<section class="block prose"><h2>How to play</h2>
<p>Take turns putting your mark in a square. The first to get three in a row, across, down or diagonally, wins. If all nine squares fill up with no line, it is a draw.</p>
<h3>The three levels</h3>
<ul><li><b>Easy:</b> the computer mostly plays at random, so you should win often.</li>
<li><b>Hard:</b> it always takes a winning move and always blocks yours, but it does not plan ahead. Try to make a fork: a move that gives you two ways to win at once.</li>
<li><b>Very hard:</b> it checks every possible game from the current position, so it never loses. Tic-tac-toe is a solved game: with perfect play from both sides it always ends in a draw.</li></ul>
<p>Choose X or O, choose who goes first, or switch to two players and play a friend on the same screen. Your score is kept in your browser.</p></section>'''

PAGE = dict(
    title='Tic-Tac-Toe Online: Play the Computer (Easy, Hard, Very Hard) or a Friend',
    desc='Play tic-tac-toe free in your browser. Choose easy, hard or very hard against the computer, or play a friend on the same screen. No sign-up.',
    h1='Tic-tac-toe', app='Tic-Tac-Toe',
    lead='Play the computer on easy, hard or very hard, or play a friend on the same screen. The very hard level never loses.',
    tool=TOOL, vendor=[], own=['ttt-ai.js', 'ttt.js'], module=[], css=['games.css'], sections=SECTIONS,
    faq=[('Can I beat the very hard level?', 'No. Very hard checks every possible game, so the best result you can get is a draw.'),
         ('What is the difference between hard and very hard?', 'Hard always wins when it can and always blocks you, but it only looks one move ahead, so a fork can beat it. Very hard looks at the whole game.'),
         ('Can two people play?', 'Yes. Choose A friend under Play against, and take turns on the same screen.'),
         ('Is my score saved?', 'Yes, in your own browser, until you press Reset the score.')],
    related=['snake', 'offline-runner', 'quiz-live', 'color-picker'])
