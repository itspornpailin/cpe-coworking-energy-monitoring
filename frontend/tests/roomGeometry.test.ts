// Run with: npm test   (Node's built-in test runner, no extra packages)
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PLAN_HEIGHT,
  PLAN_WIDTH,
  nearestSiteCells,
} from "../src/lib/roomGeometry.ts";

import type { Point } from "../src/lib/roomGeometry.ts";

function area(polygon: readonly Point[]): number {
  let twice = 0;

  polygon.forEach(([x, y], i) => {
    const [nx, ny] = polygon[(i + 1) % polygon.length];
    twice += x * ny - nx * y;
  });

  return Math.abs(twice) / 2;
}

test("one site owns the whole drawing", () => {
  const [cell] = nearestSiteCells([[100, 100]]);

  assert.equal(area(cell), PLAN_WIDTH * PLAN_HEIGHT);
});

test("cells tile the drawing without gaps or overlap", () => {
  const sites: Point[] = [
    [89, 171],
    [466.5, 210],
    [361, 389],
    [619, 115],
    [793.5, 115],
    [619, 333.5],
    [793.5, 333.5],
  ];

  const cells = nearestSiteCells(sites);
  const total = cells.reduce((sum, cell) => sum + area(cell), 0);

  assert.ok(Math.abs(total - PLAN_WIDTH * PLAN_HEIGHT) < 1e-6, `total area ${total}`);
});

test("two sites are split halfway between them", () => {
  const [left, right] = nearestSiteCells([
    [200, 250],
    [600, 250],
  ]);

  assert.ok(Math.abs(area(left) - 400 * PLAN_HEIGHT) < 1e-6);
  assert.ok(Math.abs(area(right) - 470 * PLAN_HEIGHT) < 1e-6);
});

test("two sites at the same spot still produce cells", () => {
  const cells = nearestSiteCells([
    [100, 100],
    [100, 100],
  ]);

  assert.equal(cells.length, 2);
});
