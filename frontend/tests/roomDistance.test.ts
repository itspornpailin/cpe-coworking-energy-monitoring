import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GRID,
  GRID_COLUMNS,
  distanceField,
  isInRoom,
  walkingDistance,
  labelSpots,
  zoneBorders,
  zonePaths,
} from "../src/lib/roomDistance.ts";

import { ZONE_COLORS, zoneColors, zoneDisplayName } from "../src/lib/zones.ts";

import type { Point } from "../src/lib/roomGeometry.ts";

// The sensor spots on the drawing.
const SENSORS: Point[] = [[130, 175], [619, 120], [781, 120], [477, 210], [619, 328], [781, 328], [381, 382]];

const squareAt = ([x, y]: Point) =>
  Math.floor(y / GRID) * GRID_COLUMNS + Math.floor(x / GRID);

const nearest = (point: Point) => {
  const distances = SENSORS.map((s) => distanceField(s)[squareAt(point)]);

  return distances.indexOf(Math.min(...distances));
};

test("with no wall between, the distance is the straight line", () => {
  assert.equal(walkingDistance([100, 50], [300, 50]), 200);
});

test("across the outside area, the path bends around it", () => {
  const from: Point = [150, 300];
  const to: Point = [300, 300];
  const walked = walkingDistance(from, to);

  assert.ok(walked > 400 && walked < Infinity, `walked ${walked}`);
});

test("the lower corner of the left part belongs to the left sensor", () => {
  assert.deepEqual([[170, 370], [150, 390], [60, 390]].map((p) => nearest(p as Point)), [0, 0, 0]);
});

test("every floor point can be reached from every sensor", () => {
  const unreachable: Point[] = [];

  for (let y = 4; y < 496; y += 6) {
    for (let x = 4; x < 870; x += 6) {
      if (isInRoom([x, y]) && SENSORS.some((s) => distanceField(s)[squareAt([x, y])] === Infinity)) {
        unreachable.push([x, y]);
      }
    }
  }

  assert.deepEqual(unreachable, []);
});

test("zone paint covers the floor up to the walls, with no gap", () => {
  const rects = zonePaths(SENSORS)
    .join("")
    .matchAll(/M(\d+) (\d+)h(\d+)/g);
  const painted = new Set<number>();

  for (const [, x, y, width] of rects) {
    for (let dx = 0; dx < Number(width); dx += GRID) {
      painted.add(squareAt([Number(x) + dx, Number(y)]));
    }
  }

  const nearWalls: Point[] = [[3, 3], [865, 442], [619, 490], [257, 490], [257, 261], [357, 259], [183, 118], [181, 330], [19, 406]];

  assert.deepEqual(nearWalls.filter((p) => !painted.has(squareAt(p))), []);
});

test("a border is drawn only where two different zones meet", () => {
  const sites: Point[] = [[300, 50], [500, 50]];

  assert.equal(zoneBorders(sites, [1, 1]).size, 0);

  const borders = zoneBorders(sites, [1, 2]);

  assert.deepEqual([...borders.keys()].sort(), [1, 2]);
  // Both zones share the same line.
  assert.equal(borders.get(1), borders.get(2));
});

test("a zone keeps its colour when another is added, and typed names are kept", () => {
  const before = zoneColors([{ areaId: 2 }, { areaId: 1 }]);
  const after = zoneColors([{ areaId: 2 }, { areaId: 7 }, { areaId: 1 }]);

  assert.equal(before.get(1), ZONE_COLORS[0]);
  assert.equal(after.get(2), before.get(2));

  assert.equal(zoneDisplayName({ name: "Zone A" }, "th"), "โซน A");
  assert.equal(zoneDisplayName({ name: "Zone A" }, "en"), "Zone A");
  assert.equal(zoneDisplayName({ name: "Reading corner" }, "th"), "Reading corner");
});

test("each zone's name goes inside its own floor, clear of the sensors", () => {
  const groups = [1, 2, 2, 3, 3, 3, 3];
  const sites = [SENSORS[0], SENSORS[3], SENSORS[6], ...SENSORS.slice(1, 3), ...SENSORS.slice(4, 6)];
  const spots = labelSpots(sites, groups);

  assert.deepEqual([...spots.keys()].sort(), [1, 2, 3]);

  for (const [zone, spot] of spots) {
    const distances = sites.map((s) => distanceField(s)[squareAt(spot)]);

    assert.ok(isInRoom(spot), `zone ${zone} label outside the room`);
    assert.equal(groups[distances.indexOf(Math.min(...distances))], zone);
    assert.ok(sites.every((s) => Math.hypot(s[0] - spot[0], s[1] - spot[1]) > 20));
  }
});
