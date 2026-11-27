// Run with: npm test   (Node's built-in test runner, no extra packages)
import assert from "node:assert/strict";
import { test } from "node:test";

import { isInRoom } from "../src/lib/roomDistance.ts";

import type { Point } from "../src/lib/roomGeometry.ts";

test("the area outside the walls is not part of the room", () => {
  const outside: Point[] = [[270, 190], [330, 150], [220, 230], [220, 330], [200, 450], [800, 470]];

  assert.deepEqual(outside.filter(isInRoom), []);
});

test("every sensor position on the drawing is inside the room", () => {
  const sensors: Point[] = [[130, 175], [619, 120], [781, 120], [477, 210], [619, 328], [781, 328], [381, 382]];
  // Floor just beside the outside area, so the cut is not too wide.
  const edges: Point[] = [[270, 60], [170, 250], [370, 200], [300, 300], [60, 390]];

  assert.deepEqual([...sensors, ...edges].filter((point) => !isInRoom(point)), []);
});
