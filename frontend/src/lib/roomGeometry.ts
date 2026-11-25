// Geometry for the 2D room drawing (frontend/public/roomplan/cpe-coworking.svg).
// Every coordinate here is in the drawing's own space, the same space the backend stores
// node positions in, so overlays line up at any screen size.

export const PLAN_WIDTH = 870;
export const PLAN_HEIGHT = 496;

export type Point = readonly [number, number];

// The floor of the room, traced from the wall lines of the drawing.
// Colour layers are clipped to it so nothing is painted outside the walls.
export const ROOM_OUTLINE: readonly Point[] = [
  [2, 2],
  [866, 2],
  [866, 443],
  [620, 443],
  [620, 491],
  [256, 491],
  [256, 407],
  [182, 407],
  [18, 407],
  [18, 303],
  [2, 303],
];

export function toPointsAttribute(points: readonly Point[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

// Keeps the part of a convex polygon that is at least as close to `a` as to `b`
// (Sutherland-Hodgman clipping against the bisector of a and b).
function keepCloserTo(polygon: Point[], a: Point, b: Point): Point[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;

  // <= 0 means "on a's side".
  const side = (p: Point) => (p[0] - mx) * dx + (p[1] - my) * dy;

  const result: Point[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const previous = polygon[(i + polygon.length - 1) % polygon.length];

    const sc = side(current);
    const sp = side(previous);

    if ((sc <= 0) !== (sp <= 0)) {
      const t = sp / (sp - sc);

      result.push([
        previous[0] + t * (current[0] - previous[0]),
        previous[1] + t * (current[1] - previous[1]),
      ]);
    }

    if (sc <= 0) {
      result.push(current);
    }
  }

  return result;
}

// Splits the whole drawing into one cell per site: every point belongs to its nearest site.
// Cells are returned in the same order as `sites`.
export function nearestSiteCells(sites: readonly Point[]): Point[][] {
  const wholePlan: Point[] = [
    [0, 0],
    [PLAN_WIDTH, 0],
    [PLAN_WIDTH, PLAN_HEIGHT],
    [0, PLAN_HEIGHT],
  ];

  return sites.map((site, i) => {
    let cell = wholePlan;

    sites.forEach((other, j) => {
      if (i !== j && cell.length > 0) {
        cell = keepCloserTo(cell, site, other);
      }
    });

    return cell;
  });
}
