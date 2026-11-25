export type LightingMode =
  | "bright_required"
  | "dark_allowed";

export interface EnvironmentZone {
  areaId: number;

  code: string;
  name: string;

  averageLux:
    number | null;

  averageTemperature:
    number | null;

  minLux: number;

  lightingMode:
    LightingMode;

  warning: boolean;
}

// One environment sensor node. x and y are positions on the room drawing
// (870 x 496 units), or null while the node has not been placed yet.
export interface EnvironmentNode {
  nodeId: string;
  name: string;

  x: number | null;
  y: number | null;

  zoneId: number | null;
  zoneCode: string | null;

  lightLux: number | null;
  temperatureC: number | null;

  updatedAt: string | null;

  // True when the node has not reported recently, or never.
  stale: boolean;
}