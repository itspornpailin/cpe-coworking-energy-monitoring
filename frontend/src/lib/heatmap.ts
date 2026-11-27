// Heat maps for the 2D room drawing: the values measured by the sensors are blended
// into one smooth colour field over the whole floor (like a weather map).
//
// Coordinates are the drawing's own space (see roomGeometry.ts).

import {
  PLAN_HEIGHT,
  PLAN_WIDTH,
} from "./roomGeometry.ts";

import {
  GRID,
  GRID_COLUMNS,
  distanceField,
} from "./roomDistance.ts";

export interface HeatPoint {
  x: number;
  y: number;
  value: number;
}

type Rgb = readonly [number, number, number];

export interface ColorScale {
  // Values at or beyond the ends use the end colours.
  min: number;
  max: number;

  // Colour stops from min (0) to max (1).
  stops: readonly (readonly [number, Rgb])[];
}

// Brightness: warm grey (dim) to butter yellow (bright), always getting lighter, like a
// room lighting up. No warm-to-cool hues, so it cannot read as temperature, and no
// near-black end, which looked gloomy. 500 lx, the usual office minimum, is the middle.
export const LUX_SCALE: ColorScale = {
  min: 0,
  max: 1000,
  stops: [
    [0, [138, 136, 130]],
    [0.25, [176, 172, 162]],
    [0.5, [210, 204, 186]],
    [0.75, [244, 228, 156]],
    [1, [255, 238, 100]],
  ],
};

// Temperature: blue (cool) to red (hot).
export const TEMPERATURE_SCALE: ColorScale = {
  min: 22,
  max: 34,
  stops: [
    [0, [44, 123, 182]],
    [0.25, [171, 217, 233]],
    [0.5, [255, 255, 191]],
    [0.75, [253, 174, 97]],
    [1, [215, 25, 28]],
  ],
};

// Narrows a scale to the values actually measured, so small differences across the
// room are visible. The range is at least `minSpan` wide, centred on the measurements
// and rounded outwards to whole half-units. With no values the scale is unchanged.
export function adaptiveScale(
  base: ColorScale,
  values: readonly number[],
  minSpan: number,
): ColorScale {
  if (values.length === 0) {
    return base;
  }

  const low = Math.min(...values);
  const high = Math.max(...values);

  const span = Math.max(high - low, minSpan);
  const centre = (low + high) / 2;

  return {
    ...base,
    min: Math.floor((centre - span / 2) * 2) / 2,
    max: Math.ceil((centre + span / 2) * 2) / 2,
  };
}

// How far (in drawing units) a sensor's influence is softened. Without it the
// field would show sharp spikes right at each sensor.
const SOFTENING = 35;

// Inverse-distance weighting: every spot gets the average of the sensor values,
// weighted so that closer sensors count for more.
export function interpolate(
  points: readonly HeatPoint[],
  x: number,
  y: number,
  distanceTo: (point: HeatPoint, index: number) => number = (point) =>
    Math.hypot(x - point.x, y - point.y),
): number {
  let weightedSum = 0;
  let weightTotal = 0;

  points.forEach((point, index) => {
    const distance = distanceTo(point, index);
    const weight = 1 / (distance * distance + SOFTENING * SOFTENING);

    weightedSum += weight * point.value;
    weightTotal += weight;
  });

  return weightedSum / weightTotal;
}

export function colorFor(scale: ColorScale, value: number): Rgb {
  const t = Math.min(
    Math.max((value - scale.min) / (scale.max - scale.min), 0),
    1,
  );

  const stops = scale.stops;

  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];

    if (t <= t1) {
      const [t0, c0] = stops[i - 1];
      const f = (t - t0) / (t1 - t0);

      return [
        c0[0] + f * (c1[0] - c0[0]),
        c0[1] + f * (c1[1] - c0[1]),
        c0[2] + f * (c1[2] - c0[2]),
      ];
    }
  }

  return stops[stops.length - 1][1];
}

// CSS gradient for the legend bar, matching the scale.
export function gradientCss(scale: ColorScale): string {
  const parts = scale.stops.map(
    ([t, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${t * 100}%`,
  );

  return `linear-gradient(to right, ${parts.join(", ")})`;
}

const CELL = 6;

let lastRender: {
  key: string;
  url: string | null;
} | null = null;

// Same as renderHeatmap, but reuses the previous picture when called again with
// the same points and scale (the page re-renders every 2 seconds even when no
// reading changed).
export function renderHeatmapCached(
  points: readonly HeatPoint[],
  scale: ColorScale,
): string | null {
  const key = JSON.stringify([scale.min, scale.max, points]);

  if (lastRender?.key === key) {
    return lastRender.url;
  }

  const url = renderHeatmap(points, scale);

  lastRender = { key, url };

  return url;
}

// Draws the field as a small image (one pixel per 6 drawing units). Stretched over
// the drawing, the browser smooths it. Returns null when fewer than 2 sensors
// have a value, because one sensor cannot show differences across the room.
export function renderHeatmap(
  points: readonly HeatPoint[],
  scale: ColorScale,
): string | null {
  if (points.length < 2) {
    return null;
  }

  const columns = Math.ceil(PLAN_WIDTH / CELL);
  const rows = Math.ceil(PLAN_HEIGHT / CELL);

  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  const image = context.createImageData(columns, rows);

  // Walking distance from each sensor, so heat does not leak through walls.
  const fields = points.map((point) => distanceField([point.x, point.y]));

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = (column + 0.5) * CELL;
      const y = (row + 0.5) * CELL;
      const square =
        Math.floor(y / GRID) * GRID_COLUMNS + Math.floor(x / GRID);

      // Pixels far outside the room are clipped away; they use the straight line.
      const value = interpolate(points, x, y, (point, index) => {
        const walked = fields[index][square];

        return Number.isFinite(walked)
          ? walked
          : Math.hypot(x - point.x, y - point.y);
      });

      const [r, g, b] = colorFor(scale, value);
      const offset = (row * columns + column) * 4;

      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);

  return canvas.toDataURL("image/png");
}
