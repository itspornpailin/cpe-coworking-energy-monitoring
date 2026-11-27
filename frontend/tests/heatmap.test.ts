// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LUX_SCALE,
  TEMPERATURE_SCALE,
  adaptiveScale,
  colorFor,
  gradientCss,
  interpolate,
} from "../src/lib/heatmap.ts";

test("one sensor gives its value everywhere", () => {
  const points = [{ x: 100, y: 100, value: 420 }];

  assert.ok(Math.abs(interpolate(points, 0, 0) - 420) < 1e-9);
  assert.ok(Math.abs(interpolate(points, 800, 400) - 420) < 1e-9);
});

test("halfway between two sensors is the average of their values", () => {
  const points = [
    { x: 100, y: 200, value: 0 },
    { x: 500, y: 200, value: 100 },
  ];

  assert.ok(Math.abs(interpolate(points, 300, 200) - 50) < 1e-9);
});

test("a spot is closer to the value of the nearer sensor", () => {
  const points = [
    { x: 100, y: 200, value: 0 },
    { x: 500, y: 200, value: 100 },
  ];

  assert.ok(interpolate(points, 150, 200) < 25);
  assert.ok(interpolate(points, 450, 200) > 75);
});

test("the field never goes outside the measured values", () => {
  const points = [
    { x: 50, y: 50, value: 300 },
    { x: 700, y: 400, value: 900 },
    { x: 300, y: 250, value: 600 },
  ];

  for (let x = 0; x <= 870; x += 29) {
    for (let y = 0; y <= 496; y += 31) {
      const v = interpolate(points, x, y);

      assert.ok(v >= 300 && v <= 900, `${v} at ${x},${y}`);
    }
  }
});

test("colours are clamped at the ends of the scale", () => {
  assert.deepEqual(colorFor(LUX_SCALE, -50), LUX_SCALE.stops[0][1]);
  assert.deepEqual(colorFor(LUX_SCALE, 5000), LUX_SCALE.stops[4][1]);
  assert.deepEqual(colorFor(TEMPERATURE_SCALE, 10), TEMPERATURE_SCALE.stops[0][1]);
});

test("a colour halfway between two stops is the mix of both", () => {
  // 125 lx is halfway between the first two stops (0 and 250 lx).
  const colour = colorFor(LUX_SCALE, 125);
  const [[, from], [, to]] = LUX_SCALE.stops;

  colour.forEach((channel, i) => {
    assert.ok(Math.abs(channel - (from[i] + to[i]) / 2) < 1e-9);
  });
});

test("brighter always looks lighter, from warm grey to yellow", () => {
  const lightness = ([r, g, b]: readonly [number, number, number]) =>
    0.2126 * r + 0.7152 * g + 0.0722 * b;

  for (let lux = 50; lux <= 1000; lux += 50) {
    assert.ok(lightness(colorFor(LUX_SCALE, lux)) > lightness(colorFor(LUX_SCALE, lux - 50)), `${lux} lx`);
  }

  const [r, g, b] = colorFor(LUX_SCALE, 1000);

  assert.ok(r > 200 && g > 200 && b < 130, "the top is yellow");
});

test("a temperature scale zooms in on the measured range", () => {
  const scale = adaptiveScale(TEMPERATURE_SCALE, [27.9, 29.1], 4);

  // 1.2 degrees measured, but the range is never narrower than 4 degrees.
  assert.equal(scale.max - scale.min >= 4, true);
  assert.ok(scale.min <= 27.9 && scale.max >= 29.1);
  assert.equal(scale.stops, TEMPERATURE_SCALE.stops);

  // A wide spread is kept as is (rounded outwards to half degrees).
  const wide = adaptiveScale(TEMPERATURE_SCALE, [20.2, 31.1], 4);
  assert.deepEqual([wide.min, wide.max], [20, 31.5]);

  // No measurements: nothing to zoom on.
  assert.equal(adaptiveScale(TEMPERATURE_SCALE, [], 4), TEMPERATURE_SCALE);
});

test("the legend gradient lists every stop", () => {
  const css = gradientCss(TEMPERATURE_SCALE);

  assert.ok(css.startsWith("linear-gradient(to right, rgb(44 123 182) 0%"));
  assert.ok(css.endsWith("rgb(215 25 28) 100%)"));
});
