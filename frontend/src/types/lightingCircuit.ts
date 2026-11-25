export type LightingState =
  | "on"
  | "off"
  | "unknown";

// One lighting circuit of the panelboard (LP-1, LP-3, ...).
export interface LightingCircuit {
  id: number;
  code: string;
  name: string;

  // Connected load from the panelboard schedule, in VA.
  ratedVa: number;

  // Watts = VA x power factor.
  powerFactor: number;

  // Both null until the circuit is calibrated.
  onAboveLux: number | null;
  offBelowLux: number | null;

  // Sensor nodes whose lux shows this circuit's state.
  nodeIds: string[];

  state: LightingState;
  stateSince: string | null;

  averageLux: number | null;
}

export interface CircuitEnergy {
  id: number;
  code: string;
  name: string;

  ratedVa: number;
  powerFactor: number;

  onMinutes: number;

  // Minutes in the range where the state was known (on or off).
  knownMinutes: number;

  kwh: number;
}

export interface LightingEnergy {
  from: string;
  to: string;
  rangeMinutes: number;

  // Always true: it is calculated from the rated load, not read from a meter.
  isEstimate: boolean;

  totalKwh: number;
  circuits: CircuitEnergy[];
}

export interface UpdateLightingCircuit {
  ratedVa?: number;
  powerFactor?: number;

  // Set both, or use clearThresholds.
  onAboveLux?: number;
  offBelowLux?: number;
  clearThresholds?: boolean;
}
