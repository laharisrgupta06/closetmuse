// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { refineMask } from "../src/services/imageIsolationService.ts";

const W = 60;
const H = 60;

/** Builds a mask from a function of (x, y) */
function mask(fn: (x: number, y: number) => number): Uint8ClampedArray {
  const m = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = fn(x, y);
  return m;
}
const at = (a: Uint8ClampedArray, x: number, y: number) => a[y * W + x];
const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) =>
  x >= x0 && x < x1 && y >= y0 && y < y1;

test("confident item becomes fully opaque, background fully clear", () => {
  const out = refineMask(mask((x, y) => (inRect(x, y, 15, 15, 45, 45) ? 170 : 5)), W, H);
  assert.equal(at(out, 30, 30), 255);
  assert.equal(at(out, 2, 2), 0);
});

test("faded (uncertain) area enclosed by the item is filled — no washed-out patches", () => {
  // Jeans-like: confident outline with an uncertain middle (mask ~80)
  const out = refineMask(mask((x, y) => (inRect(x, y, 10, 10, 50, 50) ? (inRect(x, y, 20, 20, 40, 40) ? 80 : 200) : 0)), W, H);
  assert.equal(at(out, 30, 30), 255);
});

test("confidently empty hole stays transparent (bag handle, inside of a necklace)", () => {
  const out = refineMask(mask((x, y) => (inRect(x, y, 10, 10, 50, 50) ? (inRect(x, y, 22, 22, 38, 38) ? 0 : 220) : 0)), W, H);
  assert.equal(at(out, 30, 30), 0);
  assert.equal(at(out, 12, 12), 255);
});

test("tiny confident specks far from the item are dropped", () => {
  const out = refineMask(
    mask((x, y) => (inRect(x, y, 5, 5, 30, 30) ? 230 : x === 55 && y === 55 ? 255 : 0)),
    W,
    H
  );
  assert.equal(at(out, 55, 55), 0);
  assert.equal(at(out, 15, 15), 255);
});

test("uncertain edge pixels get a smooth ramp, not a hard cut", () => {
  const out = refineMask(mask((x, y) => (inRect(x, y, 15, 15, 45, 45) ? 200 : inRect(x, y, 14, 14, 46, 46) ? 76 : 0)), W, H);
  const edge = at(out, 14, 30);
  assert.ok(edge > 100 && edge < 160, `edge alpha ${edge}`);
});

test("haze far from the item is removed even if mid-confidence", () => {
  const out = refineMask(mask((x, y) => (inRect(x, y, 5, 5, 25, 25) ? 220 : x > 45 ? 70 : 0)), W, H);
  assert.equal(at(out, 55, 30), 0);
});

test("empty mask stays empty", () => {
  const out = refineMask(new Uint8ClampedArray(W * H), W, H);
  assert.equal(out.reduce((s, v) => s + v, 0), 0);
});
