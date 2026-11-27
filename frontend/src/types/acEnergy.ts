// Mirrors backend/internal/http/handler/ac_energy_handler.go.

export interface AcSpecs {
  brand: string;

  // Null until an admin has entered them.
  capacityBtuH: number | null;
  seer: number | null;

  // Common Era year; null means no age correction.
  installedYear: number | null;
  servicedYearly: boolean;
}

export interface AcUnitEnergy extends AcSpecs {
  nodeId: string;
  name: string;

  // Null when the sensor has not reported recently.
  running: boolean | null;

  onHours: number;
  loggedHours: number;

  // Both null until capacity and SEER are known.
  powerW: number | null;
  kwh: number | null;
}

export interface AcEnergy {
  hours: number;
  totalKwh: number;
  units: AcUnitEnergy[];
}
