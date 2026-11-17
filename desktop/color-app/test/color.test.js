'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../renderer/color.js');

test('hex round trip', () => {
  assert.strictEqual(C.toHex(255, 91, 82), '#FF5B52');
  assert.deepStrictEqual(C.fromHex('#ff5b52'), [255, 91, 82]);
  assert.deepStrictEqual(C.fromHex('abc'), [170, 187, 204]);
  assert.strictEqual(C.fromHex('#12'), null);
});
test('hsl, hsv, cmyk', () => {
  assert.deepStrictEqual(C.toHsl(255, 0, 0), [0, 100, 50]);
  assert.deepStrictEqual(C.toHsl(0, 0, 0), [0, 0, 0]);
  assert.deepStrictEqual(C.toHsl(255, 255, 255), [0, 0, 100]);
  assert.deepStrictEqual(C.toHsv(0, 255, 0), [120, 100, 100]);
  assert.deepStrictEqual(C.toCmyk(0, 0, 0), [0, 0, 0, 100]);
  assert.deepStrictEqual(C.toCmyk(255, 0, 0), [0, 100, 100, 0]);
});
test('contrast', () => {
  assert.strictEqual(Math.round(C.contrast([0, 0, 0], [255, 255, 255])), 21);
  assert.ok(C.contrast([119, 119, 119], [255, 255, 255]) > 4.4);
});
test('formats', () => {
  const f = C.formats(0, 128, 255);
  assert.strictEqual(f.hex, '#0080FF');
  assert.strictEqual(f.rgb, 'rgb(0, 128, 255)');
  assert.strictEqual(f.hsl, 'hsl(210, 100%, 50%)');
});
