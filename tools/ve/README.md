# The video editor foundations

Four pieces that every later feature stands on. They live in their own folder so the main file,
`tools/veditor.js`, does not have to grow past what it already is.

## The four pieces

**`ease.js` — the curves.**
Every animation gets its timing from here. There are 28 curves, from a straight line to bounce and
elastic, plus a custom curve from four points you drag and a spring that settles instead of
arriving at a fixed moment.

```js
import { makeEase } from './ve/ease.js';
const curve = makeEase('outCubic');          // a curve from the list
const custom = makeEase({ bezier: [0.4, 0, 0.6, 1] });
const spring = makeEase({ spring: { stiffness: 170, damping: 16 } });
```

**`text.js` — where the words sit.**
Measures text and says where every line, word and letter is. The plain text on the timeline uses
it to centre each line exactly as before. The text effects use it to move single letters, which is
impossible without knowing where each letter is.

```js
const lay = layoutText(ctx, 'Hello', { font: '700 40px Arial', size: 40, lineHeight: 1.2 });
lay.lines[0].width;        // how wide the line is
lay.lines[0].y;            // where the line sits against the anchor
lay.lines[0].letters;       // where every letter sits
```

**`anim.js` — the actions.**
A layer holds a stack of actions. Each one runs for its own length, starts after its own delay,
and moves one thing: the position, the fade, the size, the tilt, the blur or the reveal. There are
no keyframes to place. Actions of different kinds sit side by side, so a layer can move and fade
and spin at once. When two of the same kind overlap, the one later in the stack wins.

```js
const layer = {
  actions: [
    makeAction('move', { from: { x: 0, y: 12 }, to: { x: 0, y: 0 }, dur: 0.8, ease: 'outCubic' }),
    makeAction('fade', { from: 0, to: 1, dur: 0.8 }),
  ],
};
evalActions(layer.actions, 0.4);   // -> { x, y, scale, rotate, opacity, blur, mask }
```

**`layers.js` — putting the picture together.**
Everything you can see in a frame is a layer. Each one has its own order, position, size, tilt,
see-through level, blend mode and mask. A layer that needs to be softened, masked or blended is
built on its own canvas first, then that canvas is put down. A layer that needs none of that is
drawn straight onto the frame, which is faster and keeps the picture exactly as it was.

```js
compose(ctx, W, H, [
  { z: 0, draw: (g) => drawClip(g, W, H, clip, src) },
  { z: 10, opacity: 0.8, blend: 'multiply', draw: (g) => drawText(g, W, H, title) },
]);
```

## How the editor uses them

`renderFrame` in `tools/veditor.js` builds the list of layers for one moment in time and hands it
to the compositor. Preview and export both call it, so what you see on the screen is what comes
out of the file.

The order has always been: the video, then the text, then the captions. That is still the order.
A layer can be given its own number to move it in front of or behind the others.

## One thing to be careful about

A layer that has nothing to change is drawn straight onto the frame, with no state wrapped around
it. Wrapping it anyway changes the picture.

Chrome draws a text shadow a shade differently depending on how deep the save stack is when the
text is drawn. With an extra `save` and `restore` around the layer, the drop shadow came out one
unit different in one colour, on the edge of every letter. It looked the same to the eye, but it
was not the same picture, and an export made from it would not have matched the file that came
before it.

So the compositor only wraps a layer in `save` and `restore` when there is something to wrap it
for: a move, a tilt, a see-through level, a blend mode, a mask or a blur. Run `pixeldiff.mjs`
after changing any of that.

## Checking the work

**`selftest.html`** — open it in a browser. It checks all four pieces, 58 tests, and needs
nothing installed. It also runs in Node with any browser runner.

**`pixeldiff.mjs`** — checks that a change did not alter the picture. It opens the editor twice,
once with the version in the last commit and once with the version on disk, draws the same
moments in time in both, and compares the frames byte for byte.

```
npm i playwright && npx playwright install chromium
node tools/ve/pixeldiff.mjs
```

It is the one to run after touching `renderFrame`, the compositor or the text layout.
