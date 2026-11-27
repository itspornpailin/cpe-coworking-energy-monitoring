// Geometry for the 2D room drawing (frontend/public/roomplan/cpe-coworking.svg).
// Every coordinate here is in the drawing's own space, the same space the backend stores
// node positions in, so overlays line up at any screen size.

export const PLAN_WIDTH = 870;
export const PLAN_HEIGHT = 496;

export type Point = readonly [number, number];

// The floor of the room, traced from the wall lines of the drawing.
// Colour layers are clipped to it so nothing is painted outside the walls.
// Curved walls are approximated with a few straight pieces.
export const ROOM_OUTLINE: readonly Point[] = [
  [2, 2],
  [866, 2],
  [866, 443],
  [620, 443],
  [620, 491],
  [256, 491],
  // The area outside the room that cuts into the plan starts here.
  [256, 260],
  [358, 260],
  [358, 153],
  [355, 138],
  [350, 130],
  [340, 121],
  [326, 116],
  [182, 116],
  [182, 334],
  // Curved wall of the left part.
  [176, 358],
  [164, 379],
  [145, 395],
  [119, 407],
  [18, 407],
  [18, 303],
  [2, 303],
];

export function toPointsAttribute(points: readonly Point[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}
