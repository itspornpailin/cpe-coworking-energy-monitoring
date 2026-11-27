import {
  apiDelete,
  apiPatch,
  apiPost,
  apiPut,
} from "./client";

// Admin-only calls: they need the admin session cookie.

// zoneId = null removes the node from every zone.
export function setNodeZone(
  nodeId: string,
  zoneId: number | null,
): Promise<{ nodeId: string; zoneId: number | null }> {
  return apiPut(
    `/admin/nodes/${encodeURIComponent(nodeId)}/zone`,
    { zoneId },
  );
}

// position = null removes the node from the room plan.
export function setNodePosition(
  nodeId: string,
  position: { x: number; y: number } | null,
): Promise<unknown> {
  return apiPut(
    `/admin/nodes/${encodeURIComponent(nodeId)}/position`,
    position ?? { x: null, y: null },
  );
}

export function createZone(
  name: string,
): Promise<{ areaId: number; code: string; name: string }> {
  return apiPost("/admin/zones", { name });
}

export function renameZone(
  areaId: number,
  name: string,
): Promise<unknown> {
  return apiPatch(`/admin/zones/${areaId}`, { name });
}

export function deleteZone(
  areaId: number,
): Promise<unknown> {
  return apiDelete(`/admin/zones/${areaId}`);
}
