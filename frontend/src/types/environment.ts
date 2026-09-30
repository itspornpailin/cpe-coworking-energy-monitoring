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