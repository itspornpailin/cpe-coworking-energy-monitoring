import {
  apiGet,
  apiPatch,
  apiPut,
} from "./client";

import type {
  LightingCircuit,
  LightingEnergy,
  UpdateLightingCircuit,
} from "../types/lightingCircuit";

export function getLightingCircuits(
  signal?: AbortSignal,
): Promise<LightingCircuit[]> {
  return apiGet<LightingCircuit[]>(
    "/lighting-circuits",
    signal,
  );
}

// from is an ISO time; the range always ends now.
export function getLightingEnergy(
  from: string,
  signal?: AbortSignal,
): Promise<LightingEnergy> {
  return apiGet<LightingEnergy>(
    `/lighting-energy?from=${encodeURIComponent(from)}`,
    signal,
  );
}

// Admin only.
export function updateLightingCircuit(
  circuitId: number,
  changes: UpdateLightingCircuit,
): Promise<unknown> {
  return apiPatch(
    `/admin/lighting-circuits/${circuitId}`,
    changes,
  );
}

// Admin only. Replaces the list of nodes that show this circuit's state.
export function setCircuitNodes(
  circuitId: number,
  nodeIds: string[],
): Promise<unknown> {
  return apiPut(
    `/admin/lighting-circuits/${circuitId}/nodes`,
    { nodeIds },
  );
}
