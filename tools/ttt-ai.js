/* Tic-tac-toe brain. Three levels:
   easy       mostly random, sometimes takes a win it sees
   hard       always takes a win and always blocks a loss, otherwise plays sensible squares with some luck (a fork can beat it)
   very hard  looks at every possible game to the end, so it never loses */
(function (root) {
  'use strict';
  var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

  function winner(b) {
    for (var i = 0; i < LINES.length; i++) {
      var l = LINES[i];
      if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { p: b[l[0]], line: l };
    }
    for (var j = 0; j < 9; j++) if (!b[j]) return null;
    return { p: 'draw', line: null };
  }
  function empties(b) { var out = []; for (var i = 0; i < 9; i++) if (!b[i]) out.push(i); return out; }
  function other(p) { return p === 'X' ? 'O' : 'X'; }

  /* score from the point of view of `me`: win 10 minus moves, loss moves minus 10, draw 0 */
  function minimax(b, turn, me, depth) {
    var w = winner(b);
    if (w) return w.p === 'draw' ? 0 : (w.p === me ? 10 - depth : depth - 10);
    var best = turn === me ? -99 : 99, e = empties(b);
    for (var i = 0; i < e.length; i++) {
      b[e[i]] = turn;
      var s = minimax(b, other(turn), me, depth + 1);
      b[e[i]] = null;
      if (turn === me ? s > best : s < best) best = s;
    }
    return best;
  }

  function perfect(b, me, rnd) {
    var e = empties(b), best = -99, picks = [];
    for (var i = 0; i < e.length; i++) {
      b[e[i]] = me;
      var s = minimax(b, other(me), me, 1);
      b[e[i]] = null;
      if (s > best) { best = s; picks = [e[i]]; } else if (s === best) picks.push(e[i]);
    }
    return picks[Math.floor(rnd() * picks.length)];
  }

  function winning(b, p) {          /* a square that wins the game for p right now, or -1 */
    var e = empties(b);
    for (var i = 0; i < e.length; i++) {
      b[e[i]] = p;
      var w = winner(b);
      b[e[i]] = null;
      if (w && w.p === p) return e[i];
    }
    return -1;
  }

  function sensible(b, rnd) {       /* the centre, then corners, then sides, with a little luck */
    var e = empties(b);
    if (rnd() < 0.2) return e[Math.floor(rnd() * e.length)];
    var order = [4, 0, 2, 6, 8, 1, 3, 5, 7].filter(function (x) { return !b[x]; });
    var top = order.slice(0, Math.min(2, order.length));
    return top[Math.floor(rnd() * top.length)];
  }

  /* b: array of 9 (null, 'X' or 'O'). me: the computer's mark. level: 'easy' | 'hard' | 'veryhard'. Returns a square 0 to 8. */
  function move(b, me, level, rnd) {
    rnd = rnd || Math.random;
    var board = b.slice(), e = empties(board);
    if (!e.length) return -1;
    if (level === 'easy') {
      var w = winning(board, me);
      if (w >= 0 && rnd() < 0.4) return w;
      return e[Math.floor(rnd() * e.length)];
    }
    if (level === 'hard') {
      var win = winning(board, me); if (win >= 0) return win;
      var block = winning(board, other(me)); if (block >= 0) return block;
      return sensible(board, rnd);
    }
    return perfect(board, me, rnd);
  }

  var api = { winner: winner, move: move, empties: empties, LINES: LINES, winning: winning };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TTT = api;
})(typeof window !== 'undefined' ? window : globalThis);
