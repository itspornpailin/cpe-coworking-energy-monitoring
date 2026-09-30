import { useEffect, useState } from "react";

import type { Language } from "../i18n/translations";
import type { UserRole } from "../types/auth";
import type {
  EnvironmentZone,
  LightingMode,
} from "../types/environment";

interface EnvironmentSidebarProps {
  language: Language;
  role: UserRole;
  zones: EnvironmentZone[];
  loading?: boolean;

  onUpdateZone?: (
    areaId: number,
    mode: LightingMode,
    minLux: number,
  ) => Promise<void>;
}

interface ZoneDraft {
  mode: LightingMode;
  minLux: string;
}

const COPY = {
  en: {
    title: "Area Conditions",
    subtitle: "Current Lux and temperature by area.",
    normal: "Normal",
    tooDark: "Too dark",
    bright: "Bright area",
    dark: "Dark area",
    warning: "This area is too dark!",
    edit: "Edit settings",
    settings: "Area settings",
    brightHelp: "Warn when Lux is below the minimum.",
    darkHelp: "Allow low light without a warning.",
    minimum: "Minimum illumination",
    save: "Save",
    saving: "Saving...",
    cancel: "Cancel",
    saved: "Saved",
    invalidLux: "Minimum Lux must be greater than 0.",
    saveError: "Unable to save this area.",
    loading: "Loading area data...",
  },

  th: {
    title: "สภาพแวดล้อมแต่ละพื้นที่",
    subtitle: "ค่า Lux และอุณหภูมิปัจจุบันของแต่ละพื้นที่",
    normal: "ปกติ",
    tooDark: "แสงน้อยเกินไป",
    bright: "พื้นที่สว่าง",
    dark: "พื้นที่มืด",
    warning: "พื้นที่นี้มีแสงน้อยเกินไป!",
    edit: "แก้ไขการตั้งค่า",
    settings: "การตั้งค่าพื้นที่",
    brightHelp: "แจ้งเตือนเมื่อค่า Lux ต่ำกว่าค่าขั้นต่ำ",
    darkHelp: "อนุญาตให้แสงน้อยโดยไม่แจ้งเตือน",
    minimum: "ค่าความสว่างขั้นต่ำ",
    save: "บันทึก",
    saving: "กำลังบันทึก...",
    cancel: "ยกเลิก",
    saved: "บันทึกแล้ว",
    invalidLux: "ค่า Lux ขั้นต่ำต้องมากกว่า 0",
    saveError: "ไม่สามารถบันทึกพื้นที่นี้ได้",
    loading: "กำลังโหลดข้อมูลพื้นที่...",
  },
} as const;

export function EnvironmentSidebar({
  language,
  role,
  zones,
  loading = false,
  onUpdateZone,
}: EnvironmentSidebarProps) {
  const copy = COPY[language];

  const [drafts, setDrafts] =
    useState<Record<number, ZoneDraft>>({});

  const [editingAreaId, setEditingAreaId] =
    useState<number | null>(null);

  const [savingAreaId, setSavingAreaId] =
    useState<number | null>(null);

  const [savedAreaId, setSavedAreaId] =
    useState<number | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    const nextDrafts: Record<number, ZoneDraft> = {};

    for (const zone of zones) {
      nextDrafts[zone.areaId] = {
        mode: zone.lightingMode,
        minLux: String(zone.minLux),
      };
    }

    setDrafts(nextDrafts);
  }, [zones]);

  function updateDraft(
    areaId: number,
    patch: Partial<ZoneDraft>,
  ) {
    setDrafts((current) => ({
      ...current,
      [areaId]: {
        ...current[areaId],
        ...patch,
      },
    }));

    setSavedAreaId(null);
    setError(null);
  }

  function startEditing(zone: EnvironmentZone) {
    setDrafts((current) => ({
      ...current,
      [zone.areaId]: {
        mode: zone.lightingMode,
        minLux: String(zone.minLux),
      },
    }));

    setEditingAreaId(zone.areaId);
    setSavedAreaId(null);
    setError(null);
  }

  function cancelEditing(zone: EnvironmentZone) {
    setDrafts((current) => ({
      ...current,
      [zone.areaId]: {
        mode: zone.lightingMode,
        minLux: String(zone.minLux),
      },
    }));

    setEditingAreaId(null);
    setError(null);
  }

  async function saveZone(areaId: number) {
    const draft = drafts[areaId];

    if (!draft || !onUpdateZone) {
      return;
    }

    const minLux = Number(draft.minLux);

    if (
      draft.mode === "bright_required" &&
      (!Number.isFinite(minLux) || minLux <= 0)
    ) {
      setError(copy.invalidLux);
      return;
    }

    setSavingAreaId(areaId);
    setError(null);

    try {
      await onUpdateZone(
        areaId,
        draft.mode,
        Number.isFinite(minLux) && minLux > 0
          ? minLux
          : 500,
      );

      setSavedAreaId(areaId);
      setEditingAreaId(null);
    } catch {
      setError(copy.saveError);
    } finally {
      setSavingAreaId(null);
    }
  }

  return (
    <aside
      className="environment-sidebar"
      aria-labelledby="environment-sidebar-title"
    >
      <header className="environment-sidebar-header">
        <h2 id="environment-sidebar-title">{copy.title}</h2>
        <p>{copy.subtitle}</p>
      </header>

      {error && (
        <div className="environment-sidebar-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="environment-sidebar-loading">
          {copy.loading}
        </p>
      ) : (
        <div className="environment-zone-list">
          {zones.map((zone) => {
            const draft = drafts[zone.areaId];
            const editing = editingAreaId === zone.areaId;
            const saving = savingAreaId === zone.areaId;

            return (
              <article
                key={zone.areaId}
                className={
                  zone.warning
                    ? "environment-zone-card environment-zone-card-warning"
                    : "environment-zone-card"
                }
              >
                <div className="environment-zone-top">
                  <div>
                    <span className="environment-zone-code">
                      {zone.code}
                    </span>

                    <h3>{zone.name}</h3>
                  </div>

                  <span
                    className={
                      zone.warning
                        ? "environment-zone-status warning"
                        : "environment-zone-status"
                    }
                  >
                    {zone.warning
                      ? copy.tooDark
                      : copy.normal}
                  </span>
                </div>

                <div className="environment-compact-readings">
                  <div>
                    <strong>
                      {zone.averageLux === null
                        ? "—"
                        : Math.round(zone.averageLux)}
                    </strong>
                    <span>Lux</span>
                  </div>

                  <div>
                    <strong>
                      {zone.averageTemperature === null
                        ? "—"
                        : zone.averageTemperature.toFixed(1)}
                    </strong>
                    <span>°C</span>
                  </div>
                </div>

                <div className="environment-policy-row">
                  <span>
                    {zone.lightingMode === "bright_required"
                      ? `${copy.bright} · ≥ ${zone.minLux} Lux`
                      : copy.dark}
                  </span>

                  {role === "admin" && !editing && (
                    <button
                      type="button"
                      className="environment-edit-button"
                      onClick={() => startEditing(zone)}
                    >
                      {copy.edit}
                    </button>
                  )}
                </div>

                {zone.warning && (
                  <div
                    className="environment-warning"
                    role="alert"
                  >
                    ⚠ {copy.warning}
                  </div>
                )}

                {savedAreaId === zone.areaId && !editing && (
                  <div className="environment-saved">
                    ✓ {copy.saved}
                  </div>
                )}

                {role === "admin" && editing && draft && (
                  <div className="environment-editor">
                    <h4>{copy.settings}</h4>

                    <label
                      className={
                        draft.mode === "bright_required"
                          ? "environment-choice selected"
                          : "environment-choice"
                      }
                    >
                      <input
                        type="radio"
                        name={`lighting-${zone.areaId}`}
                        checked={
                          draft.mode === "bright_required"
                        }
                        onChange={() =>
                          updateDraft(zone.areaId, {
                            mode: "bright_required",
                          })
                        }
                      />

                      <span>
                        <strong>{copy.bright}</strong>
                        <small>{copy.brightHelp}</small>
                      </span>
                    </label>

                    <label
                      className={
                        draft.mode === "dark_allowed"
                          ? "environment-choice selected"
                          : "environment-choice"
                      }
                    >
                      <input
                        type="radio"
                        name={`lighting-${zone.areaId}`}
                        checked={
                          draft.mode === "dark_allowed"
                        }
                        onChange={() =>
                          updateDraft(zone.areaId, {
                            mode: "dark_allowed",
                          })
                        }
                      />

                      <span>
                        <strong>{copy.dark}</strong>
                        <small>{copy.darkHelp}</small>
                      </span>
                    </label>

                    <label className="environment-min-lux">
                      <span>{copy.minimum}</span>

                      <div>
                        <input
                          type="number"
                          min="1"
                          step="10"
                          disabled={
                            draft.mode === "dark_allowed"
                          }
                          value={draft.minLux}
                          onChange={(event) =>
                            updateDraft(zone.areaId, {
                              minLux: event.target.value,
                            })
                          }
                        />

                        <span>Lux</span>
                      </div>
                    </label>

                    <div className="environment-editor-actions">
                      <button
                        type="button"
                        className="environment-cancel-button"
                        onClick={() => cancelEditing(zone)}
                      >
                        {copy.cancel}
                      </button>

                      <button
                        type="button"
                        className="environment-save-button"
                        disabled={saving}
                        onClick={() => void saveZone(zone.areaId)}
                      >
                        {saving ? copy.saving : copy.save}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </aside>
  );
}