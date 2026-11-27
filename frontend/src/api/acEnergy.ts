import {
  apiGet,
  apiPut,
} from "./client";

import type {
  AcEnergy,
  AcSpecs,
} from "../types/acEnergy";

// Admin only. Covers the last `hours` full hours.
export function getAcEnergy(
  hours: number,
  signal?: AbortSignal,
): Promise<AcEnergy> {
  return apiGet<AcEnergy>(
    `/ac-energy?hours=${hours}`,
    signal,
  );
}

// Admin only.
export function setAcSpecs(
  nodeId: string,
  specs: AcSpecs,
): Promise<unknown> {
  return apiPut(
    `/admin/ac-units/${encodeURIComponent(nodeId)}`,
    specs,
  );
}
