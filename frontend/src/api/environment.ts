import { apiGet } from "./client";

import type {
  EnvironmentNode,
  EnvironmentZone,
} from "../types/environment";

export function getEnvironmentNodes(
  signal?: AbortSignal,
): Promise<EnvironmentNode[]> {
  return apiGet<EnvironmentNode[]>("/environment-nodes", signal);
}

export function getEnvironmentZones(
  signal?: AbortSignal,
): Promise<EnvironmentZone[]> {
  return apiGet<EnvironmentZone[]>("/environment-zones", signal);
}