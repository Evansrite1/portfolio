/* Tic-tac-toe page: play the computer on three levels, or a friend on the same screen. */
(function () {
  'use strict';
  var root = document.getElementById('ttt'); if (!root || !window.TTT) return;
  var $ = function (id) { return document.getElementById(id); };
  var S = { board: Array(9).fill(null), turn: 'X', over: false, mode: 'cpu', level: 'hard', me: 'X', first: 'me', locked: false, score: { win: 0, draw: 0, lose: 0, p1: 0, p2: 0 } };
  try { var saved = JSON.parse(localStorage.getItem('ttt.v1') || 'null'); if (saved) { S.mode = saved.mode || S.mode; S.level = saved.level || S.level; S.me = saved.me || S.me; S.first = saved.first || S.first; S.score = Object.assign(S.score, saved.score || {}); } } catch (e) { /* ignore */ }
  function save() { try { localStorage.setItem('ttt.v1', JSON.stringify({ mode: S.mode, level: S.level, me: S.me, first: S.first, score: S.score })); } catch (e) { /* ignore */ } }
  var cells = [];
  var grid = $('ttt-grid');
  for (var i = 0; i < 9; i++) {
    (function (i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ttt-cell'; b.setAttribute('aria-label', 'Square ' + (i + 1) + ', empty');
      b.addEventListener('click', function () { play(i); }); grid.appendChild(b); cells.push(b);
    })(i);
  }
  var cpu = function () { return S.me === 'X' ? 'O' : 'X'; };
  function status(t) { $('ttt-status').textContent = t; }
  function draw(win) {
    S.board.forEach(function (v, i) {
      cells[i].textContent = v || ''; cells[i].className = 'ttt-cell' + (v ? ' ' + v.toLowerCase() : '') + (win && win.line && win.line.indexOf(i) >= 0 ? ' win' : '');
      cells[i].setAttribute('aria-label', 'Square ' + (i + 1) + ', ' + (v || 'empty')); cells[i].disabled = !!v || S.over || S.locked;
    });
    $('ttt-w').textContent = S.mode === 'cpu' ? S.score.win : S.score.p1; $('ttt-d').textContent = S.score.draw; $('ttt-l').textContent = S.mode === 'cpu' ? S.score.lose : S.score.p2;
    $('ttt-wl').textContent = S.mode === 'cpu' ? 'You' : 'Player X'; $('ttt-ll').textContent = S.mode === 'cpu' ? 'Computer' : 'Player O';
  }
  function newGame() {
    S.board = Array(9).fill(null); S.over = false; S.locked = false; S.turn = 'X';
    draw(); save();
    if (S.mode === 'cpu') {
      var games = S.score.win + S.score.lose + S.score.draw;
      var starter = S.first === 'cpu' ? cpu() : S.first === 'alt' ? (games % 2 ? cpu() : S.me) : S.me;   /* who moves first */
      S.turn = starter;
      status(S.turn === S.me ? 'Your move (' + S.me + ')' : 'The computer is thinking...');
      if (S.turn !== S.me) think();
    } else status('Player X to move');
  }
  function think() {
    S.locked = true; draw();
    setTimeout(function () {
      var m = TTT.move(S.board, cpu(), S.level);
      S.locked = false;
      place(m);
    }, 380);
  }
  function place(i) {
    S.board[i] = S.turn;
    var w = TTT.winner(S.board);
    if (w) return finish(w);
    S.turn = S.turn === 'X' ? 'O' : 'X';
    draw();
    if (S.mode === 'cpu') { if (S.turn === S.me) status('Your move (' + S.me + ')'); else { status('The computer is thinking...'); think(); } }
    else status('Player ' + S.turn + ' to move');
  }
  function play(i) {
    if (S.over || S.locked || S.board[i]) return;
    if (S.mode === 'cpu' && S.turn !== S.me) return;
    place(i);
  }
  function finish(w) {
    S.over = true;
    if (w.p === 'draw') { S.score.draw++; status('A draw. Nobody wins this one.'); }
    else if (S.mode === 'cpu') { if (w.p === S.me) { S.score.win++; status('You win!'); } else { S.score.lose++; status('The computer wins.'); } }
    else { if (w.p === 'X') S.score.p1++; else S.score.p2++; status('Player ' + w.p + ' wins!'); }
    draw(w); save();
  }
  function seg(id, key, val, after) {
    var box = $(id);
    [].forEach.call(box.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.v === String(S[key])); b.classList.toggle('on', b.dataset.v === String(S[key]));
      b.onclick = function () { S[key] = b.dataset.v; if (after) after(); [].forEach.call(box.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x.dataset.v === String(S[key])); x.classList.toggle('on', x.dataset.v === String(S[key])); }); newGame(); };
    });
  }
  function showOptions() { $('ttt-cpuopts').style.display = S.mode === 'cpu' ? '' : 'none'; }
  seg('ttt-mode', 'mode', null, showOptions); seg('ttt-level', 'level'); seg('ttt-me', 'me'); seg('ttt-first', 'first');
  $('ttt-new').addEventListener('click', newGame);
  $('ttt-reset').addEventListener('click', function () { S.score = { win: 0, draw: 0, lose: 0, p1: 0, p2: 0 }; newGame(); });
  showOptions(); newGame();
})();
