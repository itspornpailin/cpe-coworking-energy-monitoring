// Distance measured the way you would walk it: straight where the walls allow,
// otherwise bending around corners. Zone colours and heat maps use it, so a sensor
// on one side of a wall does not colour the floor on the other side.

import {
  PLAN_HEIGHT,
  PLAN_WIDTH,
  ROOM_OUTLINE,
} from "./roomGeometry.ts";

import type { Point } from "./roomGeometry.ts";

// Size of one square of the painting grid, in drawing units.
export const GRID = 3;
export const GRID_COLUMNS = Math.ceil(PLAN_WIDTH / GRID);
export const GRID_ROWS = Math.ceil(PLAN_HEIGHT / GRID);

// Paint reaches this many squares past a wall. The room's clip path trims it,
// so no unpainted strip is left along the walls.
const MARGIN = 4;

const edges = ROOM_OUTLINE.map(
  (a, i) => [a, ROOM_OUTLINE[(i + 1) % ROOM_OUTLINE.length]] as const,
);

const straight = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const cross = (o: Point, a: Point, b: Point) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

export function isInRoom([x, y]: Point): boolean {
  let inside = false;

  for (const [[x1, y1], [x2, y2]] of edges) {
    if (y1 > y !== y2 > y && x < x1 + ((y - y1) / (y2 - y1)) * (x2 - x1)) {
      inside = !inside;
    }
  }

  return inside;
}

// For two points inside the room: true when no wall is between them.
function canSee(a: Point, b: Point): boolean {
  return !edges.some(
    ([c, d]) =>
      cross(a, b, c) > 0 !== cross(a, b, d) > 0 &&
      cross(c, d, a) > 0 !== cross(c, d, b) > 0,
  );
}

// The corners a path can bend around, moved half a unit into the room.
const orientation = Math.sign(
  edges.reduce((sum, [[x1, y1], [x2, y2]]) => sum + x1 * y2 - x2 * y1, 0),
);

const corners: Point[] = ROOM_OUTLINE.flatMap((v, i) => {
  const previous = ROOM_OUTLINE[(i + ROOM_OUTLINE.length - 1) % ROOM_OUTLINE.length];
  const next = ROOM_OUTLINE[(i + 1) % ROOM_OUTLINE.length];
  const turn = Math.sign(cross(previous, v, next));

  if (turn === 0 || turn === orientation) {
    return [];
  }

  const a = straight(previous, v);
  const b = straight(next, v);
  const sx = (previous[0] - v[0]) / a + (next[0] - v[0]) / b;
  const sy = (previous[1] - v[1]) / a + (next[1] - v[1]) / b;
  const length = Math.hypot(sx, sy);

  return [[v[0] - (sx / length) * 0.5, v[1] - (sy / length) * 0.5] as const];
});

// Shortest walking distance from `from` to every corner (Dijkstra).
function reachCorners(from: Point): number[] {
  const distance = corners.map((c) =>
    canSee(from, c) ? straight(from, c) : Infinity,
  );
  const done = new Set<number>();

  while (done.size < corners.length) {
    let best = -1;

    distance.forEach((d, i) => {
      if (!done.has(i) && (best < 0 || d < distance[best])) {
        best = i;
      }
    });

    done.add(best);

    corners.forEach((c, i) => {
      const via = distance[best] + straight(corners[best], c);

      if (via < distance[i] && canSee(corners[best], c)) {
        distance[i] = via;
      }
    });
  }

  return distance;
}

// A point outside the room has no walking path, so the straight distance is used.
export function walkingDistance(
  from: Point,
  to: Point,
  reached?: readonly number[],
): number {
  if (!isInRoom(from) || !isInRoom(to) || canSee(from, to)) {
    return straight(from, to);
  }

  const toCorners = reached ?? reachCorners(from);
  let best = Infinity;

  corners.forEach((c, i) => {
    const via = toCorners[i] + straight(c, to);

    if (via < best && canSee(c, to)) {
      best = via;
    }
  });

  return best;
}

const fields = new Map<string, Float64Array>();

// Walking distance from one sensor to the centre of every grid square (row by row).
// Squares well outside the room are Infinity. Cached, because readings change every
// few seconds but sensors rarely move.
export function distanceField(site: Point): Float64Array {
  const key = `${site[0]},${site[1]}`;
  const cached = fields.get(key);

  if (cached) {
    return cached;
  }

  const reached = reachCorners(site);
  const field = new Float64Array(GRID_COLUMNS * GRID_ROWS).fill(Infinity);

  for (let i = 0; i < field.length; i++) {
    const centre: Point = [
      ((i % GRID_COLUMNS) + 0.5) * GRID,
      (Math.floor(i / GRID_COLUMNS) + 0.5) * GRID,
    ];

    if (isInRoom(centre)) {
      field[i] = walkingDistance(site, centre, reached);
    }
  }

  for (let step = 0; step < MARGIN; step++) {
    const before = field.slice();

    for (let i = 0; i < field.length; i++) {
      if (before[i] !== Infinity) {
        continue;
      }

      const column = i % GRID_COLUMNS;

      field[i] = Math.min(
        column > 0 ? before[i - 1] : Infinity,
        column < GRID_COLUMNS - 1 ? before[i + 1] : Infinity,
        before[i - GRID_COLUMNS] ?? Infinity,
        before[i + GRID_COLUMNS] ?? Infinity,
      );
    }
  }

  // shortcut: clears everything when full; keep the newest ones if rooms get hundreds of sensors.
  if (fields.size >= 64) {
    fields.clear();
  }

  fields.set(key, field);

  return field;
}

// For a grid square: the sensor nearest on foot, or -1 outside the room.
function ownerOf(sites: readonly Point[]): (i: number) => number {
  const distances = sites.map(([x, y]) =>
    distanceField([Math.round(x), Math.round(y)]),
  );

  return (i) => {
    let best = -1;

    distances.forEach((field, k) => {
      if (field[i] < (best < 0 ? Infinity : distances[best][i])) {
        best = k;
      }
    });

    return best;
  };
}

// The dividing lines between zones: for each zone, an SVG path along the edges where
// its floor meets another zone's. groups[i] is the zone of sensor i.
export function zoneBorders(
  sites: readonly Point[],
  groups: readonly number[],
): Map<number, string> {
  const owner = ownerOf(sites);
  const group = Array.from({ length: GRID_COLUMNS * GRID_ROWS }, (_, i) => {
    const k = owner(i);

    return k < 0 ? null : groups[k];
  });
  const borders = new Map<number, string>();

  const half = GRID / 2;

  // Marching squares: look at four neighbouring square centres at a time and join the
  // midpoints where the zone changes, which gives diagonal lines instead of stairs.
  for (let row = 0; row < GRID_ROWS - 1; row++) {
    for (let column = 0; column < GRID_COLUMNS - 1; column++) {
      const i = row * GRID_COLUMNS + column;
      const [a, b, c, d] = [i, i + 1, i + GRID_COLUMNS + 1, i + GRID_COLUMNS].map(
        (k) => group[k],
      );

      if (a === null || b === null || c === null || d === null) {
        continue;
      }

      const x = (column + 0.5) * GRID;
      const y = (row + 0.5) * GRID;
      const crossings = [
        a !== b && `${x + half} ${y}`,
        b !== c && `${x + GRID} ${y + half}`,
        c !== d && `${x + half} ${y + GRID}`,
        d !== a && `${x} ${y + half}`,
      ].filter(Boolean);

      if (crossings.length === 0) {
        continue;
      }

      // Where three zones meet, each crossing runs to the middle.
      const line =
        crossings.length === 2
          ? `M${crossings[0]}L${crossings[1]}`
          : crossings.map((p) => `M${p}L${x + half} ${y + half}`).join("");

      for (const g of new Set([a, b, c, d])) {
        borders.set(g, (borders.get(g) ?? "") + line);
      }
    }
  }

  return borders;
}

let floor: boolean[] | null = null;

// Where to write each zone's name: the spot of the zone farthest from its borders, the
// walls and the sensors. A name is wider than it is tall, so room above and below counts
// for three times as much as room to the sides.
export function labelSpots(
  sites: readonly Point[],
  groups: readonly number[],
): Map<number, Point> {
  const centre = (i: number): Point => [
    ((i % GRID_COLUMNS) + 0.5) * GRID,
    (Math.floor(i / GRID_COLUMNS) + 0.5) * GRID,
  ];

  floor ??= Array.from({ length: GRID_COLUMNS * GRID_ROWS }, (_, i) =>
    isInRoom(centre(i)),
  );

  const owner = ownerOf(sites);
  const group = floor.map((inside, i) => {
    const k = inside ? owner(i) : -1;

    return k < 0 ? null : groups[k];
  });

  const clear = group.map((g, i) => {
    const [x, y] = centre(i);
    const edge =
      g === null ||
      [i - 1, i + 1, i - GRID_COLUMNS, i + GRID_COLUMNS].some((n) => group[n] !== g);
    // The marker and the value written under it.
    const onSensor = sites.some(
      ([sx, sy]) => Math.abs(x - sx) < 45 && y - sy > -20 && y - sy < 45,
    );

    return edge || onSensor ? 0 : Infinity;
  });

  // Distance to the nearest blocked square, in two sweeps.
  for (const step of [1, -1]) {
    for (let n = 0; n < clear.length; n++) {
      const i = step === 1 ? n : clear.length - 1 - n;

      clear[i] = Math.min(
        clear[i],
        (clear[i - step] ?? 0) + 1,
        (clear[i - step * GRID_COLUMNS] ?? 0) + 3,
      );
    }
  }

  const best = new Map<number, number>();

  group.forEach((g, i) => {
    if (g !== null && clear[i] > (clear[best.get(g) ?? -1] ?? -1)) {
      best.set(g, i);
    }
  });

  return new Map([...best].map(([g, i]) => [g, centre(i)]));
}

// One SVG path per sensor, covering the floor that is nearest to it on foot.
export function zonePaths(sites: readonly Point[]): string[] {
  const paths = sites.map(() => "");
  const owner = ownerOf(sites);

  for (let row = 0; row < GRID_ROWS; row++) {
    let start = 0;
    let current = owner(row * GRID_COLUMNS);

    for (let column = 1; column <= GRID_COLUMNS; column++) {
      const next =
        column < GRID_COLUMNS ? owner(row * GRID_COLUMNS + column) : -2;

      if (next !== current) {
        if (current >= 0) {
          const width = (column - start) * GRID;
          paths[current] += `M${start * GRID} ${row * GRID}h${width}v${GRID}h${-width}z`;
        }

        start = column;
        current = next;
      }
    }
  }

  return paths;
}
