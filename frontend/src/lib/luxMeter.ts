// Recommended average illuminance on the desk for office reading and writing
// (TIEA indoor lighting guide 2018, chapter 4, group 22 "offices").
export const DEFAULT_MIN_LUX = 500;

// Where to draw a reading and its minimum on a bar, as percentages. The bar ends
// at twice the minimum, or at the reading itself when that is brighter.
export function luxMeter(lux: number, minLux: number) {
  const end = Math.max(minLux * 2, lux);

  return {
    fill: (Math.max(lux, 0) / end) * 100,
    mark: (minLux / end) * 100,
  };
}
