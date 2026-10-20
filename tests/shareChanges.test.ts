// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { planShareChanges } from "../src/utils/shareChanges.ts";

test("select all from nothing shares every item", () => {
  assert.deepEqual(planShareChanges([], ["a", "b", "c"]), { toAdd: ["a", "b", "c"], toRemove: [] });
});

test("deselect all stops sharing everything that was shared", () => {
  assert.deepEqual(planShareChanges(["a", "b"], []), { toAdd: [], toRemove: ["a", "b"] });
});

test("individual changes: add one, remove one, keep the rest", () => {
  assert.deepEqual(planShareChanges(["a", "b"], ["b", "c"]), { toAdd: ["c"], toRemove: ["a"] });
});

test("unchanged selection produces no writes", () => {
  assert.deepEqual(planShareChanges(["a", "b"], ["b", "a"]), { toAdd: [], toRemove: [] });
});

test("duplicate ids in the selection never produce duplicate inserts", () => {
  assert.deepEqual(planShareChanges([], ["a", "a", "b"]), { toAdd: ["a", "b"], toRemove: [] });
});
