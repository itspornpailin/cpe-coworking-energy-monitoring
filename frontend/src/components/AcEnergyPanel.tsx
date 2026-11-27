import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  getAcEnergy,
  setAcSpecs,
} from "../api/acEnergy";

import type {
  Language,
} from "../i18n/translations";

import type {
  AcEnergy,
  AcUnitEnergy,
} from "../types/acEnergy";

import type {
  EnvironmentNode,
} from "../types/environment";

interface AcEnergyPanelProps {
  language: Language;

  // Environment sensors, for the room temperature shown beside the estimate.
  nodes: EnvironmentNode[];
}

const RANGES = [24, 168] as const;

const REFRESH_MS = 60_000;

const COPY = {
  en: {
    title: "Air conditioner electricity estimate",
    ranges: { 24: "Last 24 hours", 168: "Last 7 days" },
    note:
      "Estimated from each air conditioner's rating and how long it was ON. This is not a meter reading. It counts up to the last full hour.",
    total: "Estimated total",
    missing: (count: number) =>
      `Not in the total: ${count} without a rating.`,
    roomTemp: (value: string) =>
      `Room temperature now: ${value}. It is shown for context and is not part of the estimate.`,
    unit: "Air conditioner",
    now: "Now",
    running: "Running",
    off: "Off",
    onTime: "ON time",
    hoursUnit: "h",
    rating: "Rating",
    noRating: "Not entered",
    installed: "installed",
    power: "Average power",
    energy: "Estimated energy",
    edit: "Edit rating",
    editing: (name: string) => `Rating of ${name}`,
    brand: "Brand (optional)",
    capacity: "Cooling capacity (BTU/h)",
    seer: "SEER (from the label)",
    year: "Year installed, CE (optional)",
    serviced: "Serviced at least once a year",
    save: "Save",
    cancel: "Cancel",
    how: "How it is calculated",
    formula:
      "kWh = capacity ÷ (SEER × (1 − M)^age) × ON hours ÷ 1000. M is 0.01 if serviced yearly and 0.03 if not. Age is only used when the year is entered.",
    none: "No air conditioner sensor has reported yet.",
    loading: "Loading…",
    loadFailed: "The estimate could not be loaded.",
    saveFailed: "The rating was not saved.",
  },

  th: {
    title: "ประมาณการใช้ไฟฟ้าของเครื่องปรับอากาศ",
    ranges: { 24: "24 ชั่วโมงล่าสุด", 168: "7 วันล่าสุด" },
    note:
      "ประมาณจากพิกัดของเครื่องปรับอากาศและเวลาที่เปิด ไม่ใช่ค่าจากมิเตอร์ นับถึงชั่วโมงเต็มล่าสุด",
    total: "รวมโดยประมาณ",
    missing: (count: number) =>
      `ไม่รวมอยู่ในยอด: ${count} เครื่องที่ยังไม่มีพิกัด`,
    roomTemp: (value: string) =>
      `อุณหภูมิห้องขณะนี้: ${value} แสดงเพื่อประกอบการดู ไม่ได้ใช้ในการคำนวณ`,
    unit: "เครื่องปรับอากาศ",
    now: "สถานะ",
    running: "เปิดอยู่",
    off: "ปิด",
    onTime: "เวลาที่เปิด",
    hoursUnit: "ชม.",
    rating: "พิกัด",
    noRating: "ยังไม่ได้กรอก",
    installed: "ติดตั้ง",
    power: "กำลังไฟฟ้าเฉลี่ย",
    energy: "พลังงานโดยประมาณ",
    edit: "แก้ไขพิกัด",
    editing: (name: string) => `พิกัดของ ${name}`,
    brand: "ยี่ห้อ (ไม่บังคับ)",
    capacity: "ขนาดทำความเย็น (BTU/h)",
    seer: "ค่า SEER (จากฉลาก)",
    year: "ปีที่ติดตั้ง ค.ศ. (ไม่บังคับ)",
    serviced: "ล้างหรือตรวจเช็กอย่างน้อยปีละครั้ง",
    save: "บันทึก",
    cancel: "ยกเลิก",
    how: "วิธีคำนวณ",
    formula:
      "kWh = ขนาดทำความเย็น ÷ (SEER × (1 − M)^อายุ) × ชั่วโมงที่เปิด ÷ 1000 โดย M = 0.01 ถ้าบำรุงรักษาทุกปี และ 0.03 ถ้าไม่ ใช้อายุเมื่อกรอกปีที่ติดตั้งเท่านั้น",
    none: "ยังไม่มีเซนเซอร์เครื่องปรับอากาศส่งข้อมูล",
    loading: "กำลังโหลด…",
    loadFailed: "โหลดค่าประมาณไม่ได้",
    saveFailed: "บันทึกพิกัดไม่สำเร็จ",
  },
} as const;

interface Draft {
  nodeId: string;
  name: string;
  brand: string;
  capacity: string;
  seer: string;
  year: string;
  serviced: boolean;
}

function draftOf(unit: AcUnitEnergy): Draft {
  return {
    nodeId: unit.nodeId,
    name: unit.name,
    brand: unit.brand,
    capacity: unit.capacityBtuH?.toString() ?? "",
    seer: unit.seer?.toString() ?? "",
    year: unit.installedYear?.toString() ?? "",
    serviced: unit.servicedYearly,
  };
}

export function AcEnergyPanel({
  language,
  nodes,
}: AcEnergyPanelProps) {
  const copy = COPY[language];

  const [hours, setHours] = useState<(typeof RANGES)[number]>(24);
  const [data, setData] = useState<AcEnergy | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Bumped after a save, to load the new numbers.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const load = () => {
      getAcEnergy(hours, controller.signal)
        .then((result) => {
          setData(result);
          setLoadFailed(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setLoadFailed(true);
          }
        });
    };

    load();

    const timer = window.setInterval(load, REFRESH_MS);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [hours, version]);

  const formRef = useRef<HTMLFormElement>(null);
  const editingId = draft?.nodeId;

  // The form sits under the table, so bring all of it on screen when it opens.
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "nearest" });
  }, [editingId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft) {
      return;
    }

    setSaveError(null);

    try {
      await setAcSpecs(draft.nodeId, {
        brand: draft.brand,
        capacityBtuH: Number(draft.capacity),
        seer: Number(draft.seer),
        installedYear: draft.year === "" ? null : Number(draft.year),
        servicedYearly: draft.serviced,
      });

      setDraft(null);
      setVersion((value) => value + 1);
    } catch (caught) {
      setSaveError(
        caught instanceof Error && caught.message
          ? `${copy.saveFailed} ${caught.message}`
          : copy.saveFailed,
      );
    }
  }

  const temperatures = nodes.flatMap((node) =>
    node.stale || node.temperatureC === null ? [] : [node.temperatureC],
  );

  const roomTemperature =
    temperatures.length === 0
      ? "—"
      : `${(temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length).toFixed(1)} °C`;

  const missing = data?.units.filter((unit) => unit.kwh === null).length ?? 0;

  return (
    <section className="room-card energy" aria-labelledby="energy-title">
      <div className="energy-header">
        <h2 id="energy-title">{copy.title}</h2>

        <div className="energy-ranges" role="group">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={hours === range}
              onClick={() => setHours(range)}
            >
              {copy.ranges[range]}
            </button>
          ))}
        </div>
      </div>

      <p className="energy-note">{copy.note}</p>

      {loadFailed && (
        <p className="energy-error" role="alert">
          {copy.loadFailed}
        </p>
      )}

      {data === null ? (
        !loadFailed && <p className="energy-note">{copy.loading}</p>
      ) : data.units.length === 0 ? (
        <p className="energy-note">{copy.none}</p>
      ) : (
        <>
          <p className="energy-total">
            {copy.total}: <strong>{data.totalKwh.toFixed(1)} kWh</strong>
          </p>

          {missing > 0 && (
            <p className="energy-note energy-warning">
              {copy.missing(missing)}
            </p>
          )}

          <p className="energy-note">{copy.roomTemp(roomTemperature)}</p>

          <div className="energy-scroll">
            <table className="energy-table">
              <thead>
                <tr>
                  <th scope="col">{copy.unit}</th>
                  <th scope="col">{copy.now}</th>
                  <th scope="col">{copy.onTime}</th>
                  <th scope="col">{copy.energy}</th>
                  <th scope="col">{copy.power}</th>
                  <th scope="col">{copy.rating}</th>
                </tr>
              </thead>

              <tbody>
                {data.units.map((unit) => (
                  <tr key={unit.nodeId}>
                    <th scope="row">
                      {unit.name}

                      {unit.brand !== "" && (
                        <span className="energy-note">{unit.brand}</span>
                      )}

                      <button
                        type="button"
                        className="energy-edit"
                        aria-label={`${copy.edit}: ${unit.name}`}
                        onClick={() => {
                          setSaveError(null);
                          setDraft(draftOf(unit));
                        }}
                      >
                        {copy.edit}
                      </button>
                    </th>

                    <td>
                      {unit.running === null
                        ? "—"
                        : unit.running
                          ? copy.running
                          : copy.off}
                    </td>

                    <td>
                      {unit.onHours.toFixed(1)} {copy.hoursUnit}
                    </td>

                    <td>
                      {unit.kwh === null ? "—" : `${unit.kwh.toFixed(2)} kWh`}
                    </td>

                    <td>
                      {unit.powerW === null
                        ? "—"
                        : `${Math.round(unit.powerW)} W`}
                    </td>

                    <td>
                      {unit.capacityBtuH === null
                        ? copy.noRating
                        : `${unit.capacityBtuH} BTU/h · SEER ${unit.seer}${unit.installedYear === null ? "" : ` · ${copy.installed} ${unit.installedYear}`}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="energy-note">
            <summary>{copy.how}</summary>
            <p>{copy.formula}</p>
          </details>
        </>
      )}

      {draft && (
        <form
          // A new unit gets a fresh form, so the first field takes focus again.
          key={draft.nodeId}
          ref={formRef}
          className="energy-form"
          aria-label={copy.editing(draft.name)}
          onSubmit={(event) => void handleSave(event)}
        >
          <h3>{copy.editing(draft.name)}</h3>

          <label>
            {copy.capacity}
            <input
              type="number"
              required
              autoFocus
              min={1000}
              max={200000}
              value={draft.capacity}
              onChange={(event) =>
                setDraft({ ...draft, capacity: event.target.value })
              }
            />
          </label>

          <label>
            {copy.seer}
            <input
              type="number"
              required
              min={1}
              max={40}
              step="0.01"
              value={draft.seer}
              onChange={(event) =>
                setDraft({ ...draft, seer: event.target.value })
              }
            />
          </label>

          <label>
            {copy.year}
            <input
              type="number"
              min={1980}
              max={new Date().getFullYear()}
              value={draft.year}
              onChange={(event) =>
                setDraft({ ...draft, year: event.target.value })
              }
            />
          </label>

          <label>
            {copy.brand}
            <input
              type="text"
              maxLength={60}
              value={draft.brand}
              onChange={(event) =>
                setDraft({ ...draft, brand: event.target.value })
              }
            />
          </label>

          <label className="energy-check">
            <input
              type="checkbox"
              checked={draft.serviced}
              onChange={(event) =>
                setDraft({ ...draft, serviced: event.target.checked })
              }
            />
            {copy.serviced}
          </label>

          {saveError !== null && (
            <p className="energy-error" role="alert">
              {saveError}
            </p>
          )}

          <div className="energy-actions">
            <button type="button" onClick={() => setDraft(null)}>
              {copy.cancel}
            </button>

            <button type="submit">{copy.save}</button>
          </div>
        </form>
      )}
    </section>
  );
}
