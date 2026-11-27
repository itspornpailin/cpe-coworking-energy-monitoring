import assert from "node:assert/strict";
import { test } from "node:test";

import { luxMeter } from "../src/lib/luxMeter.ts";

test("the minimum sits in the middle while the reading is below twice it", () => {
  assert.deepEqual(luxMeter(250, 500), { fill: 25, mark: 50 });
  assert.deepEqual(luxMeter(500, 500), { fill: 50, mark: 50 });
});

test("a very bright reading fills the bar and moves the mark left", () => {
  assert.deepEqual(luxMeter(2000, 500), { fill: 100, mark: 25 });
});

test("a negative reading never gives a negative width", () => {
  assert.equal(luxMeter(-5, 500).fill, 0);
});
