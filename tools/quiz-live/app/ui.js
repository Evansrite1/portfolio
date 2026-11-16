/* Shared pieces of the screen: question media, answer controls for every question type, timer, shapes, charts. */
(function () {
  'use strict';
  var QL = window.QL, h = QL.h;

  QL.shape = function (i, size) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size || 28); s.setAttribute('height', size || 28); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', QL.SHAPES[i % QL.SHAPES.length]); p.setAttribute('fill', '#fff'); s.appendChild(p); return s;
  };

  QL.mediaEl = function (m, cls) {
    if (!m || !m.url) return null;
    if (m.kind === 'youtube' && m.id) {
      var start = /[?&]t=(\d+)/.exec(m.url);
      return h('div', { class: 'media ' + (cls || '') }, h('iframe', { src: 'https://www.youtube-nocookie.com/embed/' + m.id + (start ? '?start=' + start[1] : ''), title: 'Video', allow: 'accelerometer; encrypted-media; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' }));
    }
    var img = h('img', { src: m.url, alt: m.alt || '', class: 'media ' + (cls || ''), referrerpolicy: 'no-referrer' });
    img.onerror = function () { img.style.display = 'none'; };
    return img;
  };

  /* a countdown bar. Calls onTick(secondsLeft) and onEnd() */
  QL.countdown = function (seconds, onTick, onEnd) {
    var t0 = Date.now(), total = seconds * 1000, dead = false, last = -1;
    var bar = h('div', { class: 'cd' }, h('i'));
    var num = h('b', { class: 'cd-n', text: String(seconds) });
    var iv = setInterval(function () {
      if (dead) return;
      var left = Math.max(0, total - (Date.now() - t0)), s = Math.ceil(left / 1000);
      bar.firstChild.style.width = (left / total * 100) + '%'; num.textContent = String(s);
      if (s !== last) { last = s; if (onTick) onTick(s); }
      if (left <= 0) { stop(); if (onEnd) onEnd(); }
    }, 100);
    function stop() { dead = true; clearInterval(iv); }
    return { bar: bar, num: num, stop: stop, elapsed: function () { return Date.now() - t0; } };
  };

  /* ---- what a player sees for a question (never holds the right answer) ---- */
  QL.playerView = function (q, perm) {
    var v = { type: q.type, text: q.text, media: q.media, time: q.time, points: q.points };
    if (q.type === 'quiz' || q.type === 'tf') { v.options = q.options.map(function (o) { return o.t; }); v.multi = !!q.multi || q.options.filter(function (o) { return o.ok; }).length > 1; v.count = q.options.length; }
    if (q.type === 'poll') { v.options = q.options.filter(function (o) { return o.t; }).map(function (o) { return o.t; }); }
    if (q.type === 'puzzle') { v.items = perm.map(function (i) { return q.items[i]; }); }
    if (q.type === 'slider') { v.min = Number(q.min); v.max = Number(q.max); v.step = Number(q.step) || 1; v.unit = q.unit || ''; }
    if (q.type === 'pin') { v.img = q.img; }
    return v;
  };

  /* ---- the controls a player uses to answer. onSubmit(answer) is called once ---- */
  QL.controls = function (v, onSubmit, opts) {
    opts = opts || {};
    var done = false, root = h('div', { class: 'ctl ctl-' + v.type });
    function submit(a) { if (done) return; done = true; Array.prototype.forEach.call(root.querySelectorAll('button,input,textarea'), function (b) { b.disabled = true; }); onSubmit(a); }
    var t = v.type;

    if (t === 'quiz' || t === 'tf' || t === 'poll') {
      var grid = h('div', { class: 'ans-grid n' + v.options.length }), picked = {};
      v.options.forEach(function (txt, i) {
        var b = h('button', { class: 'ans', style: 'background:' + QL.COLORS[i % 6], 'aria-label': 'Answer ' + (i + 1) + ': ' + txt }, QL.shape(i, 30), opts.hideText ? null : h('span', { text: txt }));
        b.onclick = function () {
          if (v.multi && t === 'quiz') { picked[i] = !picked[i]; b.classList.toggle('sel', !!picked[i]); go.disabled = !Object.keys(picked).some(function (k) { return picked[k]; }); }
          else submit([i]);
        };
        grid.appendChild(b);
      });
      root.appendChild(grid);
      var go = h('button', { class: 'btn primary big', text: 'Submit', disabled: true, onclick: function () { submit(Object.keys(picked).filter(function (k) { return picked[k]; }).map(Number)); } });
      if (v.multi && t === 'quiz') root.appendChild(h('div', { class: 'row center' }, h('p', { class: 'muted', text: 'Pick every right answer, then press Submit.' }), go));
    }
    else if (t === 'type' || t === 'open' || t === 'cloud' || t === 'brainstorm') {
      var many = t === 'cloud' || t === 'brainstorm', sent = 0, max = t === 'cloud' ? 3 : 3, maxLen = t === 'cloud' ? 24 : t === 'open' ? 300 : 120;
      var inp = t === 'open' ? h('textarea', { class: 'input', rows: 3, maxlength: maxLen, placeholder: 'Type your answer' }) : h('input', { class: 'input', maxlength: maxLen, placeholder: t === 'type' ? 'Type the answer' : t === 'cloud' ? 'One word or a short phrase' : 'Type an idea', autocomplete: 'off' });
      var info = h('p', { class: 'muted small', text: many ? 'You can send up to ' + max + '.' : '' });
      var btn = h('button', { class: 'btn primary big', text: many ? 'Send' : 'Submit' });
      function go2() {
        var val = inp.value.trim(); if (!val) return;
        if (many) { opts.onMany && opts.onMany(val); sent++; inp.value = ''; info.textContent = sent >= max ? 'Sent. That is the most you can send.' : 'Sent. ' + (max - sent) + ' more allowed.'; if (sent >= max) submit(null); else inp.focus(); }
        else submit(val);
      }
      btn.onclick = go2; inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && t !== 'open') go2(); });
      root.appendChild(h('div', { class: 'stack' }, inp, h('div', { class: 'row center' }, btn, many ? h('button', { class: 'btn', text: 'Done', onclick: function () { submit(null); } }) : null), info));
      setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
    }
    else if (t === 'puzzle') {
      var order = [], list = h('ol', { class: 'puz' }), chosen = h('ol', { class: 'puz picked' });
      var btns = [];
      v.items.forEach(function (txt, i) {
        var li = h('li', null, h('button', { class: 'puz-item', text: txt, onclick: function () {
          if (order.indexOf(i) >= 0) return; order.push(i); render();
        } })); btns.push(li); list.appendChild(li);
      });
      var reset = h('button', { class: 'btn', text: 'Start over', onclick: function () { order = []; render(); } });
      var ok = h('button', { class: 'btn primary big', text: 'Submit', disabled: true, onclick: function () { submit(order.slice()); } });
      function render() {
        btns.forEach(function (li, i) { li.firstChild.disabled = order.indexOf(i) >= 0; li.firstChild.classList.toggle('used', order.indexOf(i) >= 0); });
        chosen.textContent = ''; order.forEach(function (i) { chosen.appendChild(h('li', { text: v.items[i] })); });
        ok.disabled = order.length !== v.items.length;
      }
      root.appendChild(h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'Tap the items in the right order, first to last.' }), list, h('h4', { text: 'Your order' }), chosen, h('div', { class: 'row center' }, reset, ok)));
    }
    else if (t === 'slider') {
      var val = Math.round((v.min + v.max) / 2 / v.step) * v.step;
      var out = h('div', { class: 'slider-val', text: val + (v.unit ? ' ' + v.unit : '') });
      var r = h('input', { type: 'range', min: v.min, max: v.max, step: v.step, value: val, 'aria-label': 'Your answer' });
      r.oninput = function () { val = Number(r.value); out.textContent = val + (v.unit ? ' ' + v.unit : ''); };
      root.appendChild(h('div', { class: 'stack' }, out, r, h('div', { class: 'row between muted small' }, h('span', { text: String(v.min) }), h('span', { text: String(v.max) })), h('div', { class: 'row center' }, h('button', { class: 'btn primary big', text: 'Lock it in', onclick: function () { submit(val); } }))));
    }
    else if (t === 'pin') {
      var pt = null, box = h('div', { class: 'pinbox' }), im = h('img', { src: v.img, alt: 'Tap the right spot', referrerpolicy: 'no-referrer' }), mark = h('i', { class: 'pinmark', hidden: true });
      box.appendChild(im); box.appendChild(mark);
      var ok2 = h('button', { class: 'btn primary big', text: 'Lock it in', disabled: true, onclick: function () { submit(pt); } });
      box.onclick = function (e) {
        var rc = im.getBoundingClientRect(); pt = { x: QL.clamp((e.clientX - rc.left) / rc.width, 0, 1), y: QL.clamp((e.clientY - rc.top) / rc.height, 0, 1) };
        mark.hidden = false; mark.style.left = (pt.x * 100) + '%'; mark.style.top = (pt.y * 100) + '%'; ok2.disabled = false;
      };
      root.appendChild(h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'Tap the picture where the answer is.' }), box, h('div', { class: 'row center' }, ok2)));
    }
    return { el: root, lock: function () { done = true; Array.prototype.forEach.call(root.querySelectorAll('button,input,textarea'), function (b) { b.disabled = true; }); }, isDone: function () { return done; } };
  };

  /* ---- results charts for the host screen ---- */
  QL.barChart = function (labels, counts, rightSet, colors) {
    var max = Math.max.apply(null, counts.concat([1])), wrap = h('div', { class: 'bars' });
    labels.forEach(function (l, i) {
      var isRight = rightSet && rightSet.indexOf(i) >= 0;
      var col = h('div', { class: 'bar-col' + (rightSet ? (isRight ? ' right' : ' wrong') : '') },
        h('b', { class: 'bar-n', text: String(counts[i]) }),
        h('div', { class: 'bar-fill', style: 'height:' + Math.max(counts[i] / max * 100, counts[i] ? 6 : 2) + '%;background:' + (colors ? colors[i % colors.length] : QL.COLORS[i % 6]) }),
        h('div', { class: 'bar-l' }, QL.shape(i, 18), h('span', { text: l })));
      wrap.appendChild(col);
    });
    return wrap;
  };
  QL.wordCloud = function (words) {
    var freq = {}; words.forEach(function (w) { var k = QL.norm(w) || w; if (!freq[k]) freq[k] = { w: w, n: 0 }; freq[k].n++; });
    var arr = Object.keys(freq).map(function (k) { return freq[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 60);
    var max = arr.length ? arr[0].n : 1, box = h('div', { class: 'cloud' });
    QL.shuffle(arr).forEach(function (x, i) { box.appendChild(h('span', { style: 'font-size:' + (16 + 44 * x.n / max) + 'px;color:' + QL.COLORS[i % 6], text: x.w })); });
    if (!arr.length) box.appendChild(h('p', { class: 'muted', text: 'No words yet.' }));
    return box;
  };
  QL.ordinal = function (n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
})();
