/* Text layout for the video editor.

   The editor draws text on a canvas, so the words have to be measured before anything can be
   drawn. This file does the measuring and returns where every line, word and letter sits.

   Two things use it. The plain text on the timeline uses it to centre each line exactly the way
   it always has. The fancier text effects use it to move, spin and reveal single letters, which
   is impossible without knowing where each letter is.

   Pure code with no browser APIs, so it also runs in Node for testing. */

/* Splits a paragraph into pieces, keeping the spaces between the words.
   The pieces come back in order: a word, the gap after it, the next word and so on. */
function piecesOf(paragraph) {
  return String(paragraph).match(/\S+|\s+/g) || [];
}
const isGap = (s) => /^\s+$/.test(s);

/* Measures one word letter by letter. The widths are stretched a little so the letters end up
   exactly where the whole word measures, which keeps the letters in step with the line. */
function letters(ctx, word, spacing) {
  const chars = Array.from(word);
  const out = [];
  let sum = 0;
  for (const ch of chars) { const w = ctx.measureText(ch).width; out.push({ ch, w, x: 0 }); sum += w; }
  const measured = ctx.measureText(word).width;
  const scale = sum > 0 ? measured / sum : 1;
  let x = 0;
  for (const g of out) { g.x = x; g.width = g.w * scale; x += g.width + spacing; }
  return out;
}

/* Breaks a paragraph into lines. When there is no width to fit into, the paragraph is left
   exactly as it was written, spaces and all, so the picture does not change. */
function breakUp(ctx, paragraph, maxWidth) {
  const pieces = piecesOf(paragraph);
  const lines = [];
  let cur = [], curW = 0, hasWord = false, dropping = false;
  for (const piece of pieces) {
    const gap = isGap(piece);
    const w = ctx.measureText(piece).width;
    if (!gap && hasWord && isFinite(maxWidth) && curW + w > maxWidth) {
      while (cur.length && isGap(cur[cur.length - 1])) cur.pop();
      lines.push(cur);
      cur = []; curW = 0; hasWord = false; dropping = true;
      continue;
    }
    if (gap && dropping) continue;
    cur.push(piece); curW += w;
    if (!gap) { hasWord = true; dropping = false; }
  }
  lines.push(cur);
  return lines;
}

/* Lays text out in a box.
   ctx      the canvas context, used only to measure
   text     the string, a newline starts a new line
   opts     font, size, maxWidth, lineHeight, letterSpacing, align, origin

   The font is optional. When it is left out, the font already set on the context is used and
   left alone, which keeps the number of changes to the canvas the same as it would have been.

   Returns the lines and, inside them, the words and the letters with their positions.
   Positions are relative to the anchor point, so the caller can move the whole block. */
export function layoutText(ctx, text, opts = {}) {
  const {
    font = null,
    size = 40,
    maxWidth = Infinity,
    lineHeight = 1.25,
    letterSpacing = 0,
    align = 'center',
    origin = 'center',
  } = opts;

  const saved = ctx.font;
  const own = !!font;
  if (own) ctx.font = font;
  try {
    const gap = size * lineHeight;
    const paragraphs = String(text == null ? '' : text).split('\n');

    /* Work out the lines first, without knowing where they sit.
       breakUp hands back a list of lines, and each line is a list of pieces, so the two lists
       have to be joined up rather than nested inside each other. */
    const raw = [];
    for (const p of paragraphs) for (const line of breakUp(ctx, p, maxWidth)) raw.push(line);

    /* Now measure each line and place it. */
    const lines = raw.map((pieces, i) => {
      const lineText = pieces.join('');
      const width = pieces.length ? ctx.measureText(lineText).width : 0;
      return { index: i, text: lineText, pieces: pieces.slice(), width, top: i * gap, y: 0, x: 0, words: [], letters: [] };
    });

    const blockWidth = lines.reduce((a, l) => Math.max(a, l.width), 0);
    const totalHeight = lines.length * gap;
    const originX = origin === 'left' ? 0 : origin === 'right' ? -blockWidth : -blockWidth / 2;
    const originY = origin === 'top' ? 0 : origin === 'bottom' ? -totalHeight : -totalHeight / 2;
    /* Where the first line sits against the anchor. The block is centred on the anchor unless
       it is told to hang from the top or sit on the bottom. */
    const firstLine = origin === 'top' ? gap / 2
      : origin === 'bottom' ? -((lines.length - 1) * gap) - gap / 2
      : -((lines.length - 1) * gap) / 2;

    lines.forEach((line) => {
      line.y = firstLine + line.top;
      const inset = align === 'left' ? 0 : align === 'right' ? blockWidth - line.width : (blockWidth - line.width) / 2;
      line.x = originX + inset;
      let x = line.x;
      for (const piece of line.pieces) {
        if (isGap(piece)) { x += ctx.measureText(piece).width; continue; }
        const wW = ctx.measureText(piece).width;
        line.words.push({ text: piece, x, width: wW, index: line.words.length, line: line.index });
        const ls = letters(ctx, piece, letterSpacing);
        ls.forEach((g, gi) => {
          line.letters.push({ ch: g.ch, x: x + g.x, width: g.width, line: line.index, word: line.words.length - 1, index: line.letters.length, glyph: gi });
        });
        x += wW;
      }
    });

    return {
      size, lineHeight, letterSpacing, align, origin,
      lines, width: blockWidth, height: totalHeight,
      originX, originY,
      bounds: { x: originX, y: originY, w: blockWidth, h: totalHeight },
    };
  } finally {
    if (own) ctx.font = saved;
  }
}

/* Breaks a string into lines that fit a width, without any of the positions. */
export function wrapText(ctx, text, font, size, maxWidth) {
  const saved = ctx.font;
  ctx.font = font;
  try {
    const out = [];
    for (const para of String(text == null ? '' : text).split('\n')) {
      for (const pieces of breakUp(ctx, para, maxWidth)) out.push(pieces.join(''));
    }
    return out;
  } finally {
    ctx.font = saved;
  }
}

/* Paints a laid out block of text, one letter at a time.
   opts.fill          colour for the letters
   opts.stroke        outline colour
   opts.lineWidth     outline width
   opts.shadow        { color, blur, x, y }
   opts.alpha         0..1 for the whole block
   opts.perLetter     (letter, index) => null or { fill, alpha, dx, dy, scale, rotate, hidden }
                     Used by the letter animations and the text effects.
   opts.letterSpacing extra space between letters, in pixels
   opts.maxWidth      clips the block to a width, used by the paper and magazine looks */
export function paintText(ctx, layout, opts = {}) {
  const { fill = '#ffffff', stroke = null, lineWidth = 0, shadow = null, alpha = 1, perLetter = null, letterSpacing = 0, maxWidth = Infinity } = opts;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (shadow) { ctx.shadowColor = shadow.color || 'rgba(0,0,0,.6)'; ctx.shadowBlur = shadow.blur || 0; ctx.shadowOffsetY = shadow.y || 0; ctx.shadowOffsetX = shadow.x || 0; }
  ctx.fillStyle = fill;
  if (stroke && lineWidth > 0) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.lineJoin = 'round'; }
  ctx.globalAlpha = alpha;

  for (const line of layout.lines) {
    if (!line.letters.length) continue;
    const clipped = maxWidth < layout.width;
    for (const g of line.letters) {
      const mod = perLetter ? perLetter(g, g.index) : null;
      if (mod && mod.hidden) continue;
      const x = g.x + (letterSpacing ? g.index * letterSpacing : 0);
      const cx = x + g.width / 2, cy = line.y + (mod && mod.dy ? mod.dy : 0);
      ctx.save();
      if (mod && (mod.scale != null || mod.rotate)) {
        ctx.translate(cx, cy);
        if (mod.rotate) ctx.rotate((mod.rotate * Math.PI) / 180);
        if (mod.scale != null) ctx.scale(mod.scale, mod.scale);
        ctx.translate(-cx, -cy);
      }
      if (mod && mod.alpha != null) ctx.globalAlpha = alpha * mod.alpha;
      if (mod && mod.fill) ctx.fillStyle = mod.fill;
      if (clipped) { ctx.beginPath(); ctx.rect(layout.bounds.x, layout.bounds.y, maxWidth, layout.height); ctx.clip(); }
      if (stroke && lineWidth > 0) ctx.strokeText(g.ch, x, cy);
      ctx.fillText(g.ch, x, cy);
      ctx.restore();
    }
  }
  ctx.restore();
}

/* The number of letters in a string, used to work out how long a typewriter should take. */
export function letterCount(text) { return Array.from(String(text == null ? '' : text)).length; }
