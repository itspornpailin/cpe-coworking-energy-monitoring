import { apiGet } from "./client";

import type { EnvironmentZone } from "../types/environment";

export function getEnvironmentZones(
  signal?: AbortSignal,
): Promise<EnvironmentZone[]> {
  return apiGet<EnvironmentZone[]>("/environment-zones", signal);
}