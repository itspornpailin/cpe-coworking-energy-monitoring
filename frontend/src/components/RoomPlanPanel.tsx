import {
  useState,
} from "react";

import type {
  Language,
} from "../i18n/translations";

import {
  PLAN_HEIGHT,
  PLAN_WIDTH,
  ROOM_OUTLINE,
  nearestSiteCells,
  toPointsAttribute,
} from "../lib/roomGeometry";

import type {
  Point,
} from "../lib/roomGeometry";

import type {
  EnvironmentNode,
  EnvironmentZone,
} from "../types/environment";

interface RoomPlanPanelProps {
  language: Language;
  zones: EnvironmentZone[];
  nodes: EnvironmentNode[];
}

type PlacedNode =
  EnvironmentNode & {
    x: number;
    y: number;
  };

const ROOM_PLAN_URL =
  `${import.meta.env.BASE_URL}roomplan/cpe-coworking.svg`;

// One colour per zone, in the order the zones are listed.
const ZONE_COLORS = [
  "#2a9d8f",
  "#e9a23b",
  "#4f7cc4",
  "#b565a7",
  "#d9644a",
  "#7fa650",
  "#8c7ae6",
  "#c49a6c",
] as const;

const NO_ZONE_COLOR = "#8a9a96";

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

    noZone:
      "No zone",

    zone:
      "Zone",

    stale:
      "No recent data",

    updated:
      "Updated",

    waiting:
      "Waiting for sensor data",

    notPlaced: (count: number) =>
      `${count} sensor${count === 1 ? "" : "s"} not placed on the plan yet`,
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

    noZone:
      "ไม่มีโซน",

    zone:
      "โซน",

    stale:
      "ไม่มีข้อมูลล่าสุด",

    updated:
      "อัปเดตล่าสุด",

    waiting:
      "รอข้อมูลจากเซนเซอร์",

    notPlaced: (count: number) =>
      `ยังไม่ได้วางเซนเซอร์ ${count} ตัวบนแผนผัง`,
  },
} as const;

function isPlaced(
  node: EnvironmentNode,
): node is PlacedNode {
  return (
    node.x !== null &&
    node.y !== null
  );
}

export function RoomPlanPanel({
  language,
  zones,
  nodes,
}: RoomPlanPanelProps) {
  const copy =
    COPY[language];

  const locale =
    language === "th"
      ? "th-TH"
      : "en-GB";

  const [
    mapFailed,
    setMapFailed,
  ] =
    useState(false);

  const placed =
    nodes.filter(isPlaced);

  // Every spot on the drawing belongs to its nearest sensor, so a sensor's
  // zone decides the colour around it. Moving a sensor to another zone
  // therefore recolours the map with no zone shapes to redraw.
  const cells =
    nearestSiteCells(
      placed.map(
        (node): Point => [
          node.x,
          node.y,
        ],
      ),
    );

  const zoneInfo =
    new Map(
      zones.map(
        (zone, index) => [
          zone.areaId,
          {
            zone,

            color:
              ZONE_COLORS[
                index %
                  ZONE_COLORS.length
              ],
          },
        ],
      ),
    );

  const updatedTimes =
    nodes
      .filter(
        (node) =>
          node.updatedAt !== null,
      )
      .map((node) =>
        Date.parse(
          node.updatedAt as string,
        ),
      );

  const lastUpdated =
    updatedTimes.length > 0
      ? new Date(
          Math.max(
            ...updatedTimes,
          ),
        ).toLocaleTimeString(
          locale,
        )
      : null;

  const unplacedCount =
    nodes.length -
    placed.length;

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
            <svg
              className="room-plan-svg"
              viewBox={`0 0 ${PLAN_WIDTH} ${PLAN_HEIGHT}`}
              role="group"
              aria-label={copy.alt}
            >
              <defs>
                <clipPath id="room-floor">
                  <polygon
                    points={toPointsAttribute(
                      ROOM_OUTLINE,
                    )}
                  />
                </clipPath>

                <pattern
                  id="zone-warning-hatch"
                  width="8"
                  height="8"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="8"
                    stroke="#c0392b"
                    strokeWidth="2.5"
                    strokeOpacity="0.55"
                  />
                </pattern>
              </defs>

              <image
                className="room-plan-image"
                href={ROOM_PLAN_URL}
                width={PLAN_WIDTH}
                height={PLAN_HEIGHT}
                onError={() => {
                  setMapFailed(true);
                }}
              />

              <g clipPath="url(#room-floor)">
                {placed.map(
                  (node, index) => {
                    const info =
                      node.zoneId === null
                        ? undefined
                        : zoneInfo.get(
                            node.zoneId,
                          );

                    const color =
                      info?.color ??
                      NO_ZONE_COLOR;

                    const points =
                      toPointsAttribute(
                        cells[index],
                      );

                    return (
                      <g key={node.nodeId}>
                        <polygon
                          points={points}
                          fill={color}
                          fillOpacity={
                            info
                              ? 0.34
                              : 0.14
                          }
                          stroke={color}
                          strokeOpacity={0.6}
                          strokeWidth={0.8}
                        />

                        {info?.zone.warning && (
                          <polygon
                            points={points}
                            fill="url(#zone-warning-hatch)"
                          />
                        )}
                      </g>
                    );
                  },
                )}
              </g>

              {placed.map((node) => {
                const info =
                  node.zoneId === null
                    ? undefined
                    : zoneInfo.get(
                        node.zoneId,
                      );

                const description =
                  [
                    node.name,

                    `${copy.zone}: ${
                      info?.zone.name ??
                      copy.noZone
                    }`,

                    node.stale ||
                    node.lightLux === null
                      ? copy.stale
                      : `${Math.round(
                          node.lightLux,
                        )} lx`,

                    !node.stale &&
                    node.temperatureC !==
                      null
                      ? `${node.temperatureC.toFixed(
                          1,
                        )} °C`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");

                return (
                  <g
                    key={node.nodeId}
                    className={
                      node.stale
                        ? "plan-node is-stale"
                        : "plan-node"
                    }
                    transform={`translate(${node.x} ${node.y})`}
                    tabIndex={0}
                    role="img"
                    aria-label={description}
                  >
                    <title>
                      {description}
                    </title>

                    <circle
                      className="plan-node-dot"
                      r="8"
                      style={{
                        stroke:
                          node.stale
                            ? NO_ZONE_COLOR
                            : (info?.color ??
                              NO_ZONE_COLOR),
                      }}
                    />

                    <text
                      className="plan-node-label"
                      y="23"
                      textAnchor="middle"
                    >
                      {node.stale ||
                      node.lightLux ===
                        null
                        ? "–"
                        : Math.round(
                            node.lightLux,
                          )}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        <div className="plan-legend-wrap">
          <ul className="plan-legend">
            {zones.map(
              (zone, index) => (
                <li key={zone.areaId}>
                  <span
                    className="plan-legend-chip"
                    style={{
                      background:
                        ZONE_COLORS[
                          index %
                            ZONE_COLORS.length
                        ],
                    }}
                  />

                  {zone.name}
                </li>
              ),
            )}

            {placed.some(
              (node) =>
                node.zoneId === null ||
                !zoneInfo.has(
                  node.zoneId,
                ),
            ) && (
              <li>
                <span
                  className="plan-legend-chip"
                  style={{
                    background:
                      NO_ZONE_COLOR,
                  }}
                />

                {copy.noZone}
              </li>
            )}

            {nodes.some(
              (node) => node.stale,
            ) && (
              <li>
                <span className="plan-legend-chip plan-legend-stale" />

                {copy.stale}
              </li>
            )}
          </ul>

          <p className="plan-status">
            {lastUpdated === null
              ? copy.waiting
              : `${copy.updated} ${lastUpdated}`}

            {unplacedCount > 0 &&
              ` · ${copy.notPlaced(
                unplacedCount,
              )}`}
          </p>
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
