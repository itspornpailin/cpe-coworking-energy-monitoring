import type { Language } from "../i18n/translations";

import { translations } from "../i18n/translations";

interface RoomPlanPanelProps {
  language: Language;
}

// Overall room-plan width from the architectural drawing.
const ROOM_WIDTH_METERS = 25.9;

// Length represented by the frontend scale bar.
const SCALE_BAR_METERS = 5;

// Width of the scale bar relative to the overall drawing width.
const SCALE_BAR_PERCENT =
  (SCALE_BAR_METERS / ROOM_WIDTH_METERS) * 100;

export function RoomPlanPanel({
  language,
}: RoomPlanPanelProps) {
  const copy =
    translations[language].room;

  return (
    <section className="room-card">
      <div className="room-card-header">
        <div>
          <h2>
            {copy.title}
          </h2>

          <p>
            {copy.subtitle}
          </p>
        </div>
      </div>

      <div className="room-map-frame">
        <img
          src="/roomplan/cpe-coworking-floor.svg"
          alt={copy.title}
          className="room-map"
        />

        <div className="room-map-meta">
          <div className="scale-box">
            <span className="scale-title">
              {copy.scale}
            </span>

            <div
              className="scale-bar"
              style={{
                width: `${SCALE_BAR_PERCENT}%`,
              }}
            >
              <span className="scale-left" />

              <span className="scale-right" />
            </div>

            <div className="scale-labels">
              <span>0</span>
              <span>5 m</span>
            </div>
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
    </section>
  );
}