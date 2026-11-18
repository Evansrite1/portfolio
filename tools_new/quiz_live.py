INFO = dict(slug='quiz-live', kicker='Games', tile_title='QuizBlast live quizzes',
            tile_desc='Make quizzes with 10 question types and play them live with a game PIN, on teams, or alone. Free, no account.',
            nav='QuizBlast', pos=4)

TOOL = '''<div class="tool" id="qb-tool" style="grid-template-columns:1fr">
  <div class="card" style="text-align:center;padding:38px 20px">
    <h2 style="margin:0 0 8px;font-size:1.6rem">QuizBlast</h2>
    <p class="help" style="max-width:56ch;margin:0 auto 20px">Make a quiz, show a game PIN on the big screen, and let everyone join from their phones. It works in the browser. There is no account and nothing is uploaded: the host's own browser runs the game.</p>
    <a class="btn primary" href="/tools/quiz-live/app/" style="padding:15px 28px;font-size:1rem">Make or host a quiz</a>
    <form action="/tools/quiz-live/app/" method="get" style="margin:22px auto 0;max-width:340px;display:flex;gap:8px">
      <input name="join" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="Have a game PIN?" aria-label="Game PIN" required style="flex:1;min-width:0;padding:12px;border-radius:10px;border:1px solid #444;background:#111;color:#fff;font-size:1rem;text-align:center">
      <button class="btn" type="submit">Join</button>
    </form>
    <p class="help" style="max-width:58ch;margin:18px auto 0">Question types: quiz, true or false, type answer, puzzle, slider, pin answer, poll, word cloud, open ended and brainstorm. Play live, in teams, or send a challenge link people play on their own. Reports download as a spreadsheet.</p>
  </div>
</div>'''

PAGE = dict(
    title='QuizBlast: Free Live Quiz Games With a Game PIN',
    desc='Make quizzes with 10 question types and host them live with a game PIN, in teams, or as a challenge link. Free, no account, runs in your browser.',
    h1='QuizBlast', app='QuizBlast',
    lead='Live quiz games for classrooms, teams and parties.',
    minimal=True, tool=TOOL, vendor=[], own=[], module=[], css=[],
    sections='', faq=[], related=[])
