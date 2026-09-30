export type LightingMode =
  | "bright_required"
  | "dark_allowed";

export type LightingStatus =
  | "ok"
  | "too_dark"
  | "no_data";

export interface LightingZone {
  areaId: number;

  code: string;
  name: string;

  sensorCount: number;

  averageLux: number | null;
  measuredAt: string | null;

  minLux: number;

  mode: LightingMode;

  status: LightingStatus;

  warning: boolean;
}

export interface UpdateLightingRule {
  mode: LightingMode;

  minLux?: number;
}