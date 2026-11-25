import {
  useEffect,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  getLightingCircuits,
  getLightingEnergy,
  setCircuitNodes,
  updateLightingCircuit,
} from "../api/lightingCircuits";

import type {
  Language,
} from "../i18n/translations";

import type {
  EnvironmentNode,
} from "../types/environment";

import type {
  CircuitEnergy,
  LightingCircuit,
  LightingEnergy,
  LightingState,
} from "../types/lightingCircuit";

interface LightingEnergyPanelProps {
  language: Language;
  isAdmin: boolean;

  // Sensor nodes an admin can tie to a circuit.
  nodes: EnvironmentNode[];
}

const RANGES = [
  { hours: 24, key: "day" },
  { hours: 168, key: "week" },
] as const;

const COPY = {
  en: {
    title:
      "Lighting and electricity estimate",

    disclaimer:
      "An estimate, not a meter reading: rated load of each circuit (from the panelboard) × power factor × the time the circuit was ON.",

    range: "Period",
    day: "Last 24 hours",
    week: "Last 7 days",

    total: "Estimated energy",
    coverage: (percent: string) =>
      `State known for ${percent}% of this period`,

    circuit: "Circuit",
    state: "Now",
    onTime: "ON time",
    energy: "Est. energy",

    states: {
      on: "On",
      off: "Off",
      unknown: "Unknown",
    },

    unknownHelp:
      "Unknown: not calibrated yet, or no sensor of this circuit has recent data. Unknown time is not counted.",

    notCalibrated: (codes: string) =>
      `Not calibrated: ${codes}. Switch these lights on and off once, then set their ON/OFF lux in Settings.`,

    loading: "Loading...",
    failed: "Unable to load lighting data.",

    settings: "Settings",
    close: "Close",
    save: "Save",

    onAbove: "ON at or above (lux)",
    offBelow: "OFF at or below (lux)",
    powerFactor: "Power factor (0-1)",
    nodesLabel: "Sensors that show this circuit",
    noNodes: "No sensors reported yet.",

    thresholdHelp:
      "Leave both lux boxes empty to make the circuit not calibrated. ON must be above OFF.",

    saveFailed: "Could not save. Check the values and try again.",
  },

  th: {
    title:
      "ระบบแสงสว่างและการประมาณไฟฟ้า",

    disclaimer:
      "เป็นค่าประมาณ ไม่ใช่ค่าจากมิเตอร์: กำลังไฟที่ต่อของแต่ละวงจร (จากตารางแผงไฟ) × ตัวประกอบกำลัง × เวลาที่วงจรเปิดอยู่",

    range: "ช่วงเวลา",
    day: "24 ชั่วโมงล่าสุด",
    week: "7 วันล่าสุด",

    total: "พลังงานที่ประมาณได้",
    coverage: (percent: string) =>
      `ทราบสถานะ ${percent}% ของช่วงเวลานี้`,

    circuit: "วงจร",
    state: "ตอนนี้",
    onTime: "เวลาที่เปิด",
    energy: "พลังงานโดยประมาณ",

    states: {
      on: "เปิด",
      off: "ปิด",
      unknown: "ไม่ทราบ",
    },

    unknownHelp:
      "ไม่ทราบ: ยังไม่ได้ปรับเทียบ หรือเซนเซอร์ของวงจรนี้ไม่มีข้อมูลล่าสุด เวลาที่ไม่ทราบจะไม่ถูกนับ",

    notCalibrated: (codes: string) =>
      `ยังไม่ได้ปรับเทียบ: ${codes} ให้เปิดและปิดไฟเหล่านี้หนึ่งครั้ง แล้วตั้งค่าลักซ์เปิด/ปิดในการตั้งค่า`,

    loading: "กำลังโหลด...",
    failed: "ไม่สามารถโหลดข้อมูลระบบแสงสว่างได้",

    settings: "ตั้งค่า",
    close: "ปิด",
    save: "บันทึก",

    onAbove: "เปิดเมื่อมากกว่าหรือเท่ากับ (ลักซ์)",
    offBelow: "ปิดเมื่อน้อยกว่าหรือเท่ากับ (ลักซ์)",
    powerFactor: "ตัวประกอบกำลัง (0-1)",
    nodesLabel: "เซนเซอร์ที่แสดงสถานะของวงจรนี้",
    noNodes: "ยังไม่มีเซนเซอร์ส่งข้อมูลเข้ามา",

    thresholdHelp:
      "เว้นช่องลักซ์ทั้งสองว่างไว้เพื่อให้วงจรเป็นยังไม่ได้ปรับเทียบ ค่าเปิดต้องมากกว่าค่าปิด",

    saveFailed: "บันทึกไม่ได้ กรุณาตรวจสอบค่าแล้วลองอีกครั้ง",
  },
} as const;

function formatDuration(
  minutes: number,
): string {
  const total =
    Math.round(minutes);

  const hours =
    Math.floor(total / 60);

  return hours > 0
    ? `${hours} h ${total % 60} min`
    : `${total} min`;
}

interface CircuitSettingsProps {
  language: Language;
  circuit: LightingCircuit;
  nodes: EnvironmentNode[];
  onSaved: () => void;
  onClose: () => void;
}

// Admin form for one circuit: calibration, power factor and which sensors show it.
function CircuitSettings({
  language,
  circuit,
  nodes,
  onSaved,
  onClose,
}: CircuitSettingsProps) {
  const copy =
    COPY[language];

  const [onLux, setOnLux] =
    useState(
      circuit.onAboveLux === null
        ? ""
        : String(circuit.onAboveLux),
    );

  const [offLux, setOffLux] =
    useState(
      circuit.offBelowLux === null
        ? ""
        : String(circuit.offBelowLux),
    );

  const [powerFactor, setPowerFactor] =
    useState(
      String(circuit.powerFactor),
    );

  const [selected, setSelected] =
    useState<string[]>(
      circuit.nodeIds,
    );

  const [error, setError] =
    useState<string | null>(null);

  const [saving, setSaving] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const on = onLux.trim();
    const off = offLux.trim();

    if (
      (on === "") !==
      (off === "")
    ) {
      setError(
        copy.thresholdHelp,
      );

      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateLightingCircuit(
        circuit.id,
        {
          powerFactor:
            Number(powerFactor),

          ...(on === ""
            ? {
                clearThresholds:
                  true,
              }
            : {
                onAboveLux:
                  Number(on),
                offBelowLux:
                  Number(off),
              }),
        },
      );

      await setCircuitNodes(
        circuit.id,
        selected,
      );

      onSaved();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error &&
          caught.message
          ? caught.message
          : copy.saveFailed,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="lighting-settings"
      onSubmit={(event) =>
        void handleSubmit(event)
      }
    >
      <div className="lighting-settings-grid">
        <label>
          <span>{copy.onAbove}</span>

          <input
            type="number"
            min="0"
            step="any"
            value={onLux}
            onChange={(event) =>
              setOnLux(
                event.target.value,
              )
            }
          />
        </label>

        <label>
          <span>{copy.offBelow}</span>

          <input
            type="number"
            min="0"
            step="any"
            value={offLux}
            onChange={(event) =>
              setOffLux(
                event.target.value,
              )
            }
          />
        </label>

        <label>
          <span>{copy.powerFactor}</span>

          <input
            type="number"
            min="0.05"
            max="1"
            step="0.01"
            required
            value={powerFactor}
            onChange={(event) =>
              setPowerFactor(
                event.target.value,
              )
            }
          />
        </label>
      </div>

      <p className="lighting-note">
        {copy.thresholdHelp}
      </p>

      <fieldset className="lighting-nodes">
        <legend>
          {copy.nodesLabel}
        </legend>

        {nodes.length === 0 ? (
          <span className="lighting-note">
            {copy.noNodes}
          </span>
        ) : (
          nodes.map((node) => (
            <label
              key={node.nodeId}
            >
              <input
                type="checkbox"
                checked={selected.includes(
                  node.nodeId,
                )}
                onChange={(event) =>
                  setSelected(
                    (current) =>
                      event.target
                        .checked
                        ? [
                            ...current,
                            node.nodeId,
                          ]
                        : current.filter(
                            (id) =>
                              id !==
                              node.nodeId,
                          ),
                  )
                }
              />

              {node.name}
            </label>
          ))
        )}
      </fieldset>

      {error !== null && (
        <p
          className="lighting-error"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="lighting-settings-actions">
        <button
          type="submit"
          disabled={saving}
        >
          {copy.save}
        </button>

        <button
          type="button"
          onClick={onClose}
        >
          {copy.close}
        </button>
      </div>
    </form>
  );
}

export function LightingEnergyPanel({
  language,
  isAdmin,
  nodes,
}: LightingEnergyPanelProps) {
  const copy =
    COPY[language];

  const [rangeHours, setRangeHours] =
    useState<number>(24);

  const [circuits, setCircuits] =
    useState<LightingCircuit[]>(
      [],
    );

  const [energy, setEnergy] =
    useState<LightingEnergy | null>(
      null,
    );

  const [failed, setFailed] =
    useState(false);

  const [editingId, setEditingId] =
    useState<number | null>(null);

  // Bumped after an admin saves, so the page reloads at once.
  const [refreshKey, setRefreshKey] =
    useState(0);

  useEffect(() => {
    const controller =
      new AbortController();

    async function load() {
      try {
        const from =
          new Date(
            Date.now() -
              rangeHours *
                3_600_000,
          ).toISOString();

        const [
          loadedCircuits,
          loadedEnergy,
        ] =
          await Promise.all([
            getLightingCircuits(
              controller.signal,
            ),

            getLightingEnergy(
              from,
              controller.signal,
            ),
          ]);

        setCircuits(
          loadedCircuits,
        );

        setEnergy(loadedEnergy);
        setFailed(false);
      } catch (error) {
        if (
          !(
            error instanceof
              DOMException &&
            error.name ===
              "AbortError"
          )
        ) {
          setFailed(true);
        }
      }
    }

    const firstLoad =
      window.setTimeout(
        () => void load(),
        0,
      );

    const intervalId =
      window.setInterval(
        () => void load(),
        10_000,
      );

    return () => {
      controller.abort();

      window.clearTimeout(
        firstLoad,
      );

      window.clearInterval(
        intervalId,
      );
    };
  }, [rangeHours, refreshKey]);

  const energyById =
    new Map<number, CircuitEnergy>(
      (energy?.circuits ?? []).map(
        (item) => [item.id, item],
      ),
    );

  const uncalibrated =
    circuits
      .filter(
        (circuit) =>
          circuit.onAboveLux ===
          null,
      )
      .map(
        (circuit) =>
          circuit.code,
      );

  // Share of the period for which the circuits' states were known, averaged over the circuits.
  const coverageRaw =
    energy &&
    energy.circuits.length > 0 &&
    energy.rangeMinutes > 0
      ? (100 *
          energy.circuits.reduce(
            (sum, item) =>
              sum +
              item.knownMinutes,
            0,
          )) /
        (energy.circuits.length *
          energy.rangeMinutes)
      : 0;

  const coveragePercent =
    coverageRaw > 0 &&
    coverageRaw < 1
      ? "<1"
      : String(
          Math.round(coverageRaw),
        );

  function stateLabel(
    state: LightingState,
  ): string {
    return copy.states[state];
  }

  return (
    <section
      className="room-card lighting-energy"
      aria-label={copy.title}
    >
      <div className="lighting-header">
        <h2>{copy.title}</h2>

        <div
          className="lighting-ranges"
          role="group"
          aria-label={copy.range}
        >
          {RANGES.map((range) => (
            <button
              key={range.key}
              type="button"
              aria-pressed={
                rangeHours ===
                range.hours
              }
              onClick={() =>
                setRangeHours(
                  range.hours,
                )
              }
            >
              {copy[range.key]}
            </button>
          ))}
        </div>
      </div>

      <p className="lighting-note">
        {copy.disclaimer}
      </p>

      {failed && (
        <p
          className="lighting-error"
          role="alert"
        >
          {copy.failed}
        </p>
      )}

      {energy === null &&
        !failed && (
          <p className="lighting-note">
            {copy.loading}
          </p>
        )}

      {energy !== null && (
        <div className="lighting-total">
          <span className="lighting-total-label">
            {copy.total}
          </span>

          <strong className="lighting-total-value">
            ≈{" "}
            {energy.totalKwh.toFixed(
              2,
            )}{" "}
            kWh
          </strong>

          <span className="lighting-note">
            {copy.coverage(
              coveragePercent,
            )}
          </span>
        </div>
      )}

      {uncalibrated.length > 0 && (
        <p className="lighting-note lighting-warning">
          {copy.notCalibrated(
            uncalibrated.join(", "),
          )}
        </p>
      )}

      {circuits.length > 0 && (
        <table className="lighting-table">
          <thead>
            <tr>
              <th scope="col">
                {copy.circuit}
              </th>

              <th scope="col">
                {copy.state}
              </th>

              <th scope="col">
                {copy.onTime}
              </th>

              <th scope="col">
                {copy.energy}
              </th>

              {isAdmin && (
                <th scope="col" />
              )}
            </tr>
          </thead>

          <tbody>
            {circuits.map(
              (circuit) => {
                const used =
                  energyById.get(
                    circuit.id,
                  );

                return (
                  <tr
                    key={circuit.id}
                  >
                    <th scope="row">
                      {circuit.code}

                      <span className="lighting-note">
                        {" "}
                        {
                          circuit.ratedVa
                        }{" "}
                        VA
                      </span>
                    </th>

                    <td>
                      <span
                        className={`lighting-state is-${circuit.state}`}
                        title={
                          circuit.state ===
                          "unknown"
                            ? copy.unknownHelp
                            : undefined
                        }
                      >
                        {stateLabel(
                          circuit.state,
                        )}
                      </span>
                    </td>

                    <td>
                      {used
                        ? formatDuration(
                            used.onMinutes,
                          )
                        : "–"}
                    </td>

                    <td>
                      {used
                        ? `${used.kwh.toFixed(
                            2,
                          )} kWh`
                        : "–"}
                    </td>

                    {isAdmin && (
                      <td>
                        <button
                          type="button"
                          className="lighting-link"
                          onClick={() =>
                            setEditingId(
                              editingId ===
                                circuit.id
                                ? null
                                : circuit.id,
                            )
                          }
                        >
                          {editingId ===
                          circuit.id
                            ? copy.close
                            : copy.settings}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      )}

      {isAdmin &&
        circuits
          .filter(
            (circuit) =>
              circuit.id ===
              editingId,
          )
          .map((circuit) => (
            <CircuitSettings
              key={circuit.id}
              language={language}
              circuit={circuit}
              nodes={nodes}
              onSaved={() =>
                setRefreshKey(
                  (current) =>
                    current + 1,
                )
              }
              onClose={() =>
                setEditingId(null)
              }
            />
          ))}
    </section>
  );
}
