import {
  apiGet,
  apiPatch,
} from "./client";

import type {
  LightingZone,
  UpdateLightingRule,
} from "../types/lighting";

export function getLightingZones(
  signal?: AbortSignal,
): Promise<LightingZone[]> {
  return apiGet<LightingZone[]>(
    "/lighting-zones",
    signal,
  );
}

export function updateLightingRule(
  areaId: number,
  rule: UpdateLightingRule,
): Promise<{
  areaId: number;
  mode: string;
  minLux: number;
}> {
  return apiPatch(
    `/admin/lighting-zones/${areaId}`,
    rule,
  );
}