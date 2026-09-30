import {
  useEffect,
  useState,
} from "react";

import {
  getLightingZones,
  updateLightingRule,
} from "../api/lighting";

import type {
  LightingMode,
  LightingZone,
} from "../types/lighting";

import type {
  Language,
} from "../i18n/translations";

import type {
  UserRole,
} from "../types/auth";

interface LightingZonesPanelProps {
  language: Language;
  role: UserRole;
}

interface ZoneDraft {
  mode: LightingMode;
  minLux: string;
}

const COPY = {
  en: {
    title: "Illumination Zones",
    subtitle:
      "Current light level and warning policy for each area.",

    current: "Current average",
    sensors: "Sensors",

    noData: "No sensor data",
    ok: "Normal",
    tooDark: "Too dark",

    requirement:
      "Lighting requirement",

    brightTitle:
      "Bright required",

    brightDescription:
      "Warn when the area's average light level is below the minimum.",

    darkTitle:
      "Dark allowed",

    darkDescription:
      "Do not generate low-light warnings for this area.",

    minimum:
      "Minimum illumination",

    save:
      "Save changes",

    saving:
      "Saving...",

    saved:
      "Settings saved.",

    warning:
      "This area is too dark!",

    loadError:
      "Unable to load illumination zones.",

    saveError:
      "Unable to save illumination settings.",

    invalidLux:
      "Please enter a minimum Lux value greater than 0.",

    adminHint:
      "Admin controls",

    policy:
      "Current policy",

    noMinimum:
      "No minimum light requirement",
  },

  th: {
    title: "พื้นที่ตรวจวัดแสง",
    subtitle:
      "ระดับแสงปัจจุบันและเงื่อนไขการแจ้งเตือนของแต่ละพื้นที่",

    current: "ค่าเฉลี่ยปัจจุบัน",
    sensors: "เซนเซอร์",

    noData: "ยังไม่มีข้อมูลเซนเซอร์",
    ok: "ปกติ",
    tooDark: "แสงน้อยเกินไป",

    requirement:
      "ข้อกำหนดด้านแสง",

    brightTitle:
      "ต้องการพื้นที่สว่าง",

    brightDescription:
      "แจ้งเตือนเมื่อค่าแสงเฉลี่ยของพื้นที่ต่ำกว่าค่าขั้นต่ำ",

    darkTitle:
      "อนุญาตให้พื้นที่มืด",

    darkDescription:
      "ไม่แจ้งเตือนเมื่อพื้นที่มีแสงน้อย",

    minimum:
      "ค่าความสว่างขั้นต่ำ",

    save:
      "บันทึกการตั้งค่า",

    saving:
      "กำลังบันทึก...",

    saved:
      "บันทึกการตั้งค่าแล้ว",

    warning:
      "พื้นที่นี้มีแสงน้อยเกินไป!",

    loadError:
      "ไม่สามารถโหลดข้อมูลพื้นที่ตรวจวัดแสงได้",

    saveError:
      "ไม่สามารถบันทึกการตั้งค่าแสงได้",

    invalidLux:
      "กรุณากรอกค่า Lux ขั้นต่ำที่มากกว่า 0",

    adminHint:
      "การตั้งค่าสำหรับผู้ดูแล",

    policy:
      "ข้อกำหนดปัจจุบัน",

    noMinimum:
      "ไม่มีค่าความสว่างขั้นต่ำ",
  },
} as const;

export function LightingZonesPanel({
  language,
  role,
}: LightingZonesPanelProps) {
  const copy =
    COPY[language];

  const [
    zones,
    setZones,
  ] =
    useState<LightingZone[]>(
      [],
    );

  const [
    drafts,
    setDrafts,
  ] =
    useState<
      Record<number, ZoneDraft>
    >({});

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    savedAreaId,
    setSavedAreaId,
  ] =
    useState<number | null>(
      null,
    );

  const [
    savingAreaId,
    setSavingAreaId,
  ] =
    useState<number | null>(
      null,
    );

  function applyZones(
    result: LightingZone[],
  ) {
    setZones(result);

    const nextDrafts:
      Record<number, ZoneDraft> =
        {};

    for (
      const zone of result
    ) {
      nextDrafts[
        zone.areaId
      ] = {
        mode:
          zone.mode,

        minLux:
          String(
            zone.minLux,
          ),
      };
    }

    setDrafts(
      nextDrafts,
    );
  }

  useEffect(() => {
    const controller =
      new AbortController();

    void (async () => {
      try {
        const result =
          await getLightingZones(
            controller.signal,
          );

        if (
          controller.signal
            .aborted
        ) {
          return;
        }

        applyZones(
          result,
        );

        setError(null);
      } catch (
        requestError
      ) {
        if (
          requestError
            instanceof
              DOMException &&
          requestError.name ===
            "AbortError"
        ) {
          return;
        }

        setError(
          copy.loadError,
        );
      } finally {
        if (
          !controller.signal
            .aborted
        ) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [copy.loadError]);

  function updateDraft(
    areaId: number,
    patch: Partial<ZoneDraft>,
  ) {
    setDrafts(
      (current) => ({
        ...current,

        [areaId]: {
          ...current[
            areaId
          ],

          ...patch,
        },
      }),
    );

    setSavedAreaId(
      null,
    );
  }

  async function saveZone(
    areaId: number,
  ) {
    const draft =
      drafts[areaId];

    if (!draft) {
      return;
    }

    const minLux =
      Number(
        draft.minLux,
      );

    if (
      draft.mode ===
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

    setSavingAreaId(
      areaId,
    );

    setSavedAreaId(
      null,
    );

    setError(null);

    try {
      await updateLightingRule(
        areaId,
        {
          mode:
            draft.mode,

          minLux:
            Number.isFinite(
              minLux,
            ) &&
            minLux > 0
              ? minLux
              : 500,
        },
      );

      const refreshed =
        await getLightingZones();

      applyZones(
        refreshed,
      );

      setSavedAreaId(
        areaId,
      );
    } catch {
      setError(
        copy.saveError,
      );
    } finally {
      setSavingAreaId(
        null,
      );
    }
  }

  if (loading) {
    return (
      <section className="lighting-panel">
        <h2>
          {copy.title}
        </h2>

        <p>
          Loading...
        </p>
      </section>
    );
  }

  return (
    <section
      className="lighting-panel"
      aria-labelledby="lighting-title"
    >
      <header className="lighting-panel-header">
        <div>
          <h2 id="lighting-title">
            {copy.title}
          </h2>

          <p>
            {copy.subtitle}
          </p>
        </div>
      </header>

      {error !== null && (
        <div
          className="lighting-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="lighting-zone-grid">
        {zones.map(
          (zone) => {
            const draft =
              drafts[
                zone.areaId
              ];

            if (!draft) {
              return null;
            }

            const isSaving =
              savingAreaId ===
              zone.areaId;

            return (
              <article
                key={
                  zone.areaId
                }
                className={
                  zone.warning
                    ? "lighting-zone-card lighting-zone-card-warning"
                    : "lighting-zone-card"
                }
              >
                <div className="lighting-zone-heading">
                  <div>
                    <span className="lighting-zone-code">
                      {
                        zone.code
                      }
                    </span>

                    <h3>
                      {
                        zone.name
                      }
                    </h3>
                  </div>

                  <span
                    className={
                      zone.status ===
                      "too_dark"
                        ? "lighting-status lighting-status-warning"
                        : "lighting-status"
                    }
                  >
                    {zone.status ===
                    "too_dark"
                      ? copy.tooDark
                      : zone.status ===
                          "no_data"
                        ? copy.noData
                        : copy.ok}
                  </span>
                </div>

                <div className="lighting-reading">
                  <span>
                    {
                      copy.current
                    }
                  </span>

                  <strong>
                    {zone.averageLux ===
                    null
                      ? "—"
                      : Math.round(
                          zone.averageLux,
                        )}
                  </strong>

                  <span>
                    Lux
                  </span>
                </div>

                <p className="lighting-sensor-count">
                  {
                    copy.sensors
                  }
                  :{" "}
                  {
                    zone.sensorCount
                  }
                </p>

                {zone.warning && (
                  <div
                    className="lighting-warning-message"
                    role="alert"
                  >
                    ⚠{" "}
                    {
                      copy.warning
                    }

                    <strong>
                      {" "}
                      &lt;{" "}
                      {
                        zone.minLux
                      }{" "}
                      Lux
                    </strong>
                  </div>
                )}

                {role !==
                "admin" ? (
                  <div className="lighting-policy-summary">
                    <span>
                      {
                        copy.policy
                      }
                    </span>

                    <strong>
                      {zone.mode ===
                      "bright_required"
                        ? `${copy.brightTitle} (≥ ${zone.minLux} Lux)`
                        : copy.noMinimum}
                    </strong>
                  </div>
                ) : (
                  <div className="lighting-admin">
                    <h4>
                      {
                        copy.adminHint
                      }
                    </h4>

                    <fieldset>
                      <legend>
                        {
                          copy.requirement
                        }
                      </legend>

                      <label
                        className={
                          draft.mode ===
                          "bright_required"
                            ? "lighting-mode-card selected"
                            : "lighting-mode-card"
                        }
                      >
                        <input
                          type="radio"
                          name={`lighting-mode-${zone.areaId}`}
                          value="bright_required"
                          checked={
                            draft.mode ===
                            "bright_required"
                          }
                          onChange={() => {
                            updateDraft(
                              zone.areaId,
                              {
                                mode:
                                  "bright_required",
                              },
                            );
                          }}
                        />

                        <span>
                          <strong>
                            {
                              copy.brightTitle
                            }
                          </strong>

                          <small>
                            {
                              copy.brightDescription
                            }
                          </small>
                        </span>
                      </label>

                      <label
                        className={
                          draft.mode ===
                          "dark_allowed"
                            ? "lighting-mode-card selected"
                            : "lighting-mode-card"
                        }
                      >
                        <input
                          type="radio"
                          name={`lighting-mode-${zone.areaId}`}
                          value="dark_allowed"
                          checked={
                            draft.mode ===
                            "dark_allowed"
                          }
                          onChange={() => {
                            updateDraft(
                              zone.areaId,
                              {
                                mode:
                                  "dark_allowed",
                              },
                            );
                          }}
                        />

                        <span>
                          <strong>
                            {
                              copy.darkTitle
                            }
                          </strong>

                          <small>
                            {
                              copy.darkDescription
                            }
                          </small>
                        </span>
                      </label>
                    </fieldset>

                    <label className="lighting-threshold-field">
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
                            draft.minLux
                          }
                          disabled={
                            draft.mode ===
                            "dark_allowed"
                          }
                          onChange={(
                            event,
                          ) => {
                            updateDraft(
                              zone.areaId,
                              {
                                minLux:
                                  event
                                    .target
                                    .value,
                              },
                            );
                          }}
                        />

                        <span>
                          Lux
                        </span>
                      </div>
                    </label>

                    <button
                      type="button"
                      className="lighting-save-button"
                      disabled={
                        isSaving
                      }
                      onClick={() => {
                        void saveZone(
                          zone.areaId,
                        );
                      }}
                    >
                      {isSaving
                        ? copy.saving
                        : copy.save}
                    </button>

                    {savedAreaId ===
                      zone.areaId && (
                      <p
                        className="lighting-save-success"
                        role="status"
                      >
                        ✓{" "}
                        {
                          copy.saved
                        }
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          },
        )}
      </div>
    </section>
  );
}