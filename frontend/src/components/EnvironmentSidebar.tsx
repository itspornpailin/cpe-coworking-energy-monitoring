import {
  useEffect,
  useState,
} from "react";

import type {
  Language,
} from "../i18n/translations";

import type {
  UserRole,
} from "../types/auth";

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

const COPY = {
  en: {
    title:
      "Area Conditions",

    subtitle:
      "Current Lux and temperature by area.",

    normal:
      "Normal",

    tooDark:
      "Too dark",

    bright:
      "Threshold-Enabled Area",

    dark:
      "Threshold-Exempt Area",

    warning:
      "This area is too dark!",

    settingsButton:
      "Settings",

    settings:
      "Threshold Settings",

    lightingPolicy:
      "Brightness policy",

    brightHelp:
      "Warn when Lux falls below the minimum threshold.",

    darkHelp:
      "No low-light warning is generated for this area.",

    minimum:
      "Minimum illumination",

    save:
      "Save",

    saving:
      "Saving...",

    cancel:
      "Cancel",

    saved:
      "Saved",

    close:
      "Close settings",

    invalidLux:
      "Minimum Lux must be greater than 0.",

    saveError:
      "Unable to save this zone.",

    loading:
      "Loading area data...",
  },

  th: {
    title:
      "สภาพแวดล้อมแต่ละพื้นที่",

    subtitle:
      "ค่า Lux และอุณหภูมิปัจจุบันของแต่ละพื้นที่",

    normal:
      "ปกติ",

    tooDark:
      "แสงน้อยเกินไป",

    bright:
      "พื้นที่ใช้เกณฑ์ความสว่าง",

    dark:
      "พื้นที่ยกเว้นเกณฑ์ความสว่าง",

    warning:
      "พื้นที่นี้มีแสงน้อยเกินไป!",

    settingsButton:
      "ตั้งค่า",

    settings:
      "การตั้งค่าเกณฑ์ความสว่าง",

    lightingPolicy:
      "การตั้งค่าความสว่าง",

    brightHelp:
      "แจ้งเตือนเมื่อค่า Lux ต่ำกว่าค่าขั้นต่ำ",

    darkHelp:
      "ไม่แจ้งเตือนเมื่อระดับแสงต่ำสำหรับพื้นที่นี้",

    minimum:
      "ค่าความสว่างขั้นต่ำ",

    save:
      "บันทึก",

    saving:
      "กำลังบันทึก...",

    cancel:
      "ยกเลิก",

    saved:
      "บันทึกแล้ว",

    close:
      "ปิดการตั้งค่า",

    invalidLux:
      "ค่า Lux ขั้นต่ำต้องมากกว่า 0",

    saveError:
      "ไม่สามารถบันทึกการตั้งค่าโซนนี้ได้",

    loading:
      "กำลังโหลดข้อมูลพื้นที่...",
  },
} as const;


/*
 * Keep the backend code (ILL-A, ILL-B, ILL-C)
 * internally, but show simple user-facing names.
 */
function getZoneDisplayName(
  zone: EnvironmentZone,
  language: Language,
) {
  const suffix =
    zone.code
      .split("-")
      .at(-1)
      ?.toUpperCase();

  if (!suffix) {
    return zone.name;
  }

  return language === "th"
    ? `โซน ${suffix}`
    : `Zone ${suffix}`;
}


export function EnvironmentSidebar({
  language,
  role,
  zones,
  loading = false,
  onUpdateZone,
}: EnvironmentSidebarProps) {
  const copy =
    COPY[language];

  const [
    editingZone,
    setEditingZone,
  ] =
    useState<EnvironmentZone | null>(
      null,
    );

  const [
    draftMode,
    setDraftMode,
  ] =
    useState<LightingMode>(
      "bright_required",
    );

  const [
    draftMinLux,
    setDraftMinLux,
  ] =
    useState("500");

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    savedAreaId,
    setSavedAreaId,
  ] =
    useState<number | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );


  function openSettings(
    zone: EnvironmentZone,
  ) {
    setEditingZone(zone);

    setDraftMode(
      zone.lightingMode,
    );

    setDraftMinLux(
      String(zone.minLux),
    );

    setSavedAreaId(null);
    setError(null);
  }


  function closeSettings() {
    if (saving) {
      return;
    }

    setEditingZone(null);
    setError(null);
  }


  /*
   * Modal behavior:
   * - Escape closes it
   * - prevent the page behind it from scrolling
   */
  useEffect(() => {
    if (editingZone === null) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key === "Escape" &&
        !saving
      ) {
        setEditingZone(null);
        setError(null);
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    editingZone,
    saving,
  ]);


  async function saveSettings() {
    if (
      editingZone === null ||
      !onUpdateZone
    ) {
      return;
    }

    const minLux =
      Number(draftMinLux);

    if (
      draftMode ===
        "bright_required" &&
      (
        !Number.isFinite(
          minLux,
        ) ||
        minLux <= 0
      )
    ) {
      setError(
        copy.invalidLux,
      );

      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onUpdateZone(
        editingZone.areaId,
        draftMode,

        Number.isFinite(minLux) &&
          minLux > 0
          ? minLux
          : 500,
      );

      setSavedAreaId(
        editingZone.areaId,
      );

      setEditingZone(null);
    } catch {
      setError(
        copy.saveError,
      );
    } finally {
      setSaving(false);
    }
  }


  return (
    <>
      <aside
        className="environment-sidebar"
        aria-labelledby="environment-sidebar-title"
      >
        <header className="environment-sidebar-header">
          <h2
            id="environment-sidebar-title"
          >
            {copy.title}
          </h2>

          <p>
            {copy.subtitle}
          </p>
        </header>


        {loading ? (
          <p className="environment-sidebar-loading">
            {copy.loading}
          </p>
        ) : (
          <div className="environment-zone-list">
            {zones.map(
              (zone) => (
                <article
                  key={
                    zone.areaId
                  }
                  className={
                    zone.warning
                      ? "environment-zone-card environment-zone-card-warning"
                      : "environment-zone-card"
                  }
                >
                  <div className="environment-zone-top">
                    <div>
                      <h3>
                        {
                          getZoneDisplayName(
                            zone,
                            language,
                          )
                        }
                      </h3>
                    </div>

                    <span
                      className={
                        zone.warning
                          ? "environment-zone-status warning"
                          : "environment-zone-status"
                      }
                    >
                      {
                        zone.warning
                          ? copy.tooDark
                          : copy.normal
                      }
                    </span>
                  </div>


                  <div className="environment-compact-readings">
                    <div>
                      <strong>
                        {
                          zone.averageLux ===
                          null
                            ? "—"
                            : Math.round(
                                zone.averageLux,
                              )
                        }
                      </strong>

                      <span>
                        Lux
                      </span>
                    </div>

                    <div>
                      <strong>
                        {
                          zone.averageTemperature ===
                          null
                            ? "—"
                            : zone.averageTemperature.toFixed(
                                1,
                              )
                        }
                      </strong>

                      <span>
                        °C
                      </span>
                    </div>
                  </div>


                  <div className="environment-policy-row">
                    <span>
                      {
                        zone.lightingMode ===
                        "bright_required"
                          ? `${copy.bright} · ≥ ${zone.minLux} Lux`
                          : copy.dark
                      }
                    </span>

                    {
                      role ===
                        "admin" && (
                        <button
                          type="button"
                          className="environment-edit-button"
                          onClick={() =>
                            openSettings(
                              zone,
                            )
                          }
                        >
                          {
                            copy.settingsButton
                          }
                        </button>
                      )
                    }
                  </div>


                  {
                    zone.warning && (
                      <div
                        className="environment-warning"
                        role="alert"
                      >
                        ⚠{" "}
                        {
                          copy.warning
                        }
                      </div>
                    )
                  }


                  {
                    savedAreaId ===
                      zone.areaId && (
                      <div className="environment-saved">
                        ✓{" "}
                        {
                          copy.saved
                        }
                      </div>
                    )
                  }
                </article>
              ),
            )}
          </div>
        )}
      </aside>


      {
        role === "admin" &&
        editingZone !== null && (
          <div
            className="settings-modal-backdrop"
            onMouseDown={(
              event,
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeSettings();
              }
            }}
          >
            <section
              className="settings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-modal-title"
            >
              <header className="settings-modal-header">
                <div>
                  <span className="settings-modal-zone">
                    {
                      getZoneDisplayName(
                        editingZone,
                        language,
                      )
                    }
                  </span>

                  <h2
                    id="settings-modal-title"
                  >
                    {
                      copy.settings
                    }
                  </h2>
                </div>

                <button
                  type="button"
                  className="settings-modal-close"
                  aria-label={
                    copy.close
                  }
                  disabled={
                    saving
                  }
                  onClick={
                    closeSettings
                  }
                >
                  ×
                </button>
              </header>


              {
                error !== null && (
                  <div
                    className="settings-modal-error"
                    role="alert"
                  >
                    {error}
                  </div>
                )
              }


              <fieldset className="settings-mode-fieldset">
                <legend>
                  {
                    copy.lightingPolicy
                  }
                </legend>


                <label
                  className={
                    draftMode ===
                    "bright_required"
                      ? "environment-choice selected"
                      : "environment-choice"
                  }
                >
                  <input
                    type="radio"
                    name="lighting-mode"
                    checked={
                      draftMode ===
                      "bright_required"
                    }
                    disabled={
                      saving
                    }
                    onChange={() => {
                      setDraftMode(
                        "bright_required",
                      );

                      setError(
                        null,
                      );
                    }}
                  />

                  <span>
                    <strong>
                      {
                        copy.bright
                      }
                    </strong>

                    <small>
                      {
                        copy.brightHelp
                      }
                    </small>
                  </span>
                </label>


                <label
                  className={
                    draftMode ===
                    "dark_allowed"
                      ? "environment-choice selected"
                      : "environment-choice"
                  }
                >
                  <input
                    type="radio"
                    name="lighting-mode"
                    checked={
                      draftMode ===
                      "dark_allowed"
                    }
                    disabled={
                      saving
                    }
                    onChange={() => {
                      setDraftMode(
                        "dark_allowed",
                      );

                      setError(
                        null,
                      );
                    }}
                  />

                  <span>
                    <strong>
                      {
                        copy.dark
                      }
                    </strong>

                    <small>
                      {
                        copy.darkHelp
                      }
                    </small>
                  </span>
                </label>
              </fieldset>


              <label className="environment-min-lux settings-min-lux">
                <span>
                  {
                    copy.minimum
                  }
                </span>

                <div>
                  <input
                    type="number"
                    min="1"
                    step="10"
                    value={
                      draftMinLux
                    }
                    disabled={
                      draftMode ===
                        "dark_allowed" ||
                      saving
                    }
                    onChange={(
                      event,
                    ) => {
                      setDraftMinLux(
                        event
                          .target
                          .value,
                      );

                      setError(
                        null,
                      );
                    }}
                  />

                  <span>
                    Lux
                  </span>
                </div>
              </label>


              <div className="settings-modal-actions">
                <button
                  type="button"
                  className="environment-cancel-button"
                  disabled={
                    saving
                  }
                  onClick={
                    closeSettings
                  }
                >
                  {
                    copy.cancel
                  }
                </button>

                <button
                  type="button"
                  className="environment-save-button"
                  disabled={
                    saving
                  }
                  onClick={() =>
                    void saveSettings()
                  }
                >
                  {
                    saving
                      ? copy.saving
                      : copy.save
                  }
                </button>
              </div>
            </section>
          </div>
        )
      }
    </>
  );
}