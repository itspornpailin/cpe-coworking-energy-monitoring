// How a zone looks everywhere (map, legend, sidebar, sensor picker), so people can
// match them by colour.

import type { Language } from "../i18n/translations";

// White text reads on all of them (at least 4.5:1). Yellow and greys are left out
// because the brightness map uses those.
export const ZONE_COLORS = [
  "#0f766e", // teal
  "#a21caf", // magenta
  "#1d4ed8", // blue
  "#c2410c", // orange
  "#6d28d9", // violet
  "#3f6212", // green
  "#854d0e", // brown
  "#be123c", // red
] as const;

export const NO_ZONE_COLOR = "#5f6f6a";

// Colours follow the zone's id, not its position in the list, so adding or
// renaming a zone never changes the colour of the others.
export function zoneColors(
  zones: readonly { areaId: number }[],
): Map<number, string> {
  return new Map(
    zones
      .map((zone) => zone.areaId)
      .sort((a, b) => a - b)
      .map((areaId, index) => [areaId, ZONE_COLORS[index % ZONE_COLORS.length]]),
  );
}

// The starting zones are called "Zone A" in the database and are translated.
// A name an admin typed is shown as typed.
export function zoneDisplayName(
  zone: { name: string },
  language: Language,
): string {
  const starting = /^Zone ([A-Z])$/.exec(zone.name);

  return language === "th" && starting ? `โซน ${starting[1]}` : zone.name;
}
