import {
  useState,
} from "react";

import type {
  Language,
} from "../i18n/translations";

import {
  translations,
} from "../i18n/translations";

interface RoomPlanPanelProps {
  language: Language;
}

/*
 * Physical width represented by the SVG.
 *
 * The current SVG uses a 1295 × 825 viewBox and was drawn
 * around the approximately 25.9 m room width.
 */
const ROOM_WIDTH_METERS =
  25.9;

/*
 * Length represented by the dashboard scale bar.
 */
const SCALE_BAR_METERS =
  5;

const SCALE_BAR_PERCENT =
  (
    SCALE_BAR_METERS /
    ROOM_WIDTH_METERS
  ) * 100;

/*
 * Use Vite's BASE_URL rather than an absolute "/..." path.
 *
 * This works both for:
 * - localhost
 * - deployment under a sub-path
 */
const ROOM_PLAN_URL =
  `${import.meta.env.BASE_URL}roomplan/cpe-coworking.svg`;

/*
 * Local fallback text is kept here so the SVG error state
 * works without requiring new entries in translations.ts.
 *
 * This is NOT mock sensor data.
 */
const FALLBACK_COPY = {
  en: {
    title:
      "2D room view unavailable",

    description:
      "The room map could not be displayed. Current Lux and temperature readings are still available in the area panel.",
  },

  th: {
    title:
      "ไม่สามารถแสดงแผนผังห้อง 2D ได้",

    description:
      "ไม่สามารถแสดงแผนผังห้องได้ แต่ยังสามารถดูค่า Lux และอุณหภูมิปัจจุบันได้จากแผงข้อมูลพื้นที่",
  },
} as const;

export function RoomPlanPanel({
  language,
}: RoomPlanPanelProps) {
  const copy =
    translations[
      language
    ].room;

  const fallbackCopy =
    FALLBACK_COPY[
      language
    ];

  const [
    mapFailed,
    setMapFailed,
  ] =
    useState(false);

  return (
    <section
      className="room-card"
      aria-labelledby="room-plan-title"
    >
      <div className="room-card-header">
        <div>
          <h2
            id="room-plan-title"
          >
            {copy.title}
          </h2>

          <p>
            {copy.subtitle}
          </p>
        </div>
      </div>

      <figure className="room-plan-figure">
        <div className="map-container">
          {mapFailed ? (
            <div
              className="room-map-fallback"
              role="status"
            >
              <strong>
                {
                  fallbackCopy.title
                }
              </strong>

              <span>
                {
                  fallbackCopy.description
                }
              </span>
            </div>
          ) : (
            <img
              src={
                ROOM_PLAN_URL
              }
              alt={
                copy.title
              }
              className="room-map"
              draggable={
                false
              }
              onError={() => {
                setMapFailed(
                  true,
                );
              }}
            />
          )}
        </div>

        <figcaption className="room-map-meta">
          <div className="scale-box">
            <span className="scale-title">
              {copy.scale}
            </span>

            <div
              className="scale-bar-wrap"
              style={{
                width:
                  `${SCALE_BAR_PERCENT}%`,
              }}
            >
              <div className="scale-bar">
                <span className="scale-left" />

                <span className="scale-right" />
              </div>

              <div className="scale-labels">
                <span>
                  0
                </span>

                <span>
                  {
                    SCALE_BAR_METERS
                  }{" "}
                  m
                </span>
              </div>
            </div>
          </div>

          <div className="room-notes">
            <p>
              {copy.pending}
            </p>

            <p>
              {copy.note}
            </p>
          </div>
        </figcaption>
      </figure>
    </section>
  );
}