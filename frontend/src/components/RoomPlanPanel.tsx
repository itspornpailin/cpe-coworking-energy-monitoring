import {
  useState,
} from "react";

import type {
  Language,
} from "../i18n/translations";

interface RoomPlanPanelProps {
  language: Language;
}

const ROOM_PLAN_URL =
  `${import.meta.env.BASE_URL}roomplan/cpe-coworking.svg`;

const COPY = {
  en: {
    alt:
      "CPE Coworking Space room layout",

    notToScale:
      "Not to scale",

    fallbackTitle:
      "2D room view unavailable",

    fallbackDescription:
      "The room map could not be displayed.",
  },

  th: {
    alt:
      "แผนผัง CPE Coworking Space",

    notToScale:
      "ไม่ใช่มาตราส่วนจริง",

    fallbackTitle:
      "ไม่สามารถแสดงแผนผังห้อง 2D ได้",

    fallbackDescription:
      "ไม่สามารถแสดงแผนผังห้องได้",
  },
} as const;

export function RoomPlanPanel({
  language,
}: RoomPlanPanelProps) {
  const copy =
    COPY[language];

  const [
    mapFailed,
    setMapFailed,
  ] =
    useState(false);

  return (
    <section
      className="room-card room-card-plan"
      aria-label={copy.alt}
    >
      <figure className="room-plan-figure">
        <div className="map-container">
          {mapFailed ? (
            <div
              className="room-map-fallback"
              role="status"
            >
              <strong>
                {copy.fallbackTitle}
              </strong>

              <span>
                {copy.fallbackDescription}
              </span>
            </div>
          ) : (
            <img
              src={ROOM_PLAN_URL}
              alt={copy.alt}
              className="room-map"
              draggable={false}
              onError={() => {
                setMapFailed(true);
              }}
            />
          )}
        </div>

        <figcaption
          className="room-map-meta-simple"
        >
          <span className="not-to-scale">
            {copy.notToScale}
          </span>
        </figcaption>
      </figure>
    </section>
  );
}