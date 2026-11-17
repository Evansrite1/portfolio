/* Snake rules, with no drawing, so they can be tested. A state is { w, h, snake: [{x,y}...] (head first), dir, food, score, alive, wrap, grew }. */
(function (root) {
  'use strict';
  var DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

  function opposite(a, b) { return DIRS[a].x + DIRS[b].x === 0 && DIRS[a].y + DIRS[b].y === 0; }

  function placeFood(s, rnd) {
    var free = [];
    for (var y = 0; y < s.h; y++) for (var x = 0; x < s.w; x++) if (!s.snake.some(function (p) { return p.x === x && p.y === y; })) free.push({ x: x, y: y });
    return free.length ? free[Math.floor(rnd() * free.length)] : null;
  }

  function create(w, h, wrap, rnd) {
    rnd = rnd || Math.random;
    var cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    var s = { w: w, h: h, wrap: !!wrap, dir: 'right', snake: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }], score: 0, alive: true, food: null, grew: false };
    s.food = placeFood(s, rnd);
    return s;
  }

  /* one tick. `want` is the direction the player asked for (a reverse is ignored). Returns the same state object, changed. */
  function step(s, want, rnd) {
    if (!s.alive) return s;
    rnd = rnd || Math.random;
    if (want && DIRS[want] && !opposite(want, s.dir)) s.dir = want;
    var d = DIRS[s.dir], head = s.snake[0], nx = head.x + d.x, ny = head.y + d.y;
    if (s.wrap) { nx = (nx + s.w) % s.w; ny = (ny + s.h) % s.h; }
    else if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) { s.alive = false; return s; }
    var eating = s.food && nx === s.food.x && ny === s.food.y;
    var body = eating ? s.snake : s.snake.slice(0, -1);     /* the tail moves away this tick unless the snake grows */
    if (body.some(function (p) { return p.x === nx && p.y === ny; })) { s.alive = false; return s; }
    s.snake.unshift({ x: nx, y: ny });
    s.grew = !!eating;
    if (eating) { s.score++; s.food = placeFood(s, rnd); if (!s.food) s.alive = false; }   /* a full board is a win, and the game ends */
    else s.snake.pop();
    return s;
  }

  var api = { create: create, step: step, placeFood: placeFood, DIRS: DIRS, opposite: opposite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SnakeCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
