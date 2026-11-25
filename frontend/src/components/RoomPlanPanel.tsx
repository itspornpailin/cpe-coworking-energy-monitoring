import {
  useRef,
  useState,
} from "react";

import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
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

// Admin editing of sensor positions. Leave it out for a read-only map.
export interface PlanEditing {
  selectedId: string | null;

  onSelect: (
    nodeId: string | null,
  ) => void;

  // A marker was dropped, nudged with the keyboard, or an unplaced sensor was placed.
  onMove: (
    nodeId: string,
    x: number,
    y: number,
  ) => void;
}

interface RoomPlanPanelProps {
  language: Language;
  zones: EnvironmentZone[];
  nodes: EnvironmentNode[];
  editing?: PlanEditing;
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

function clamp(
  value: number,
  max: number,
): number {
  return Math.min(
    Math.max(value, 0),
    max,
  );
}

export function RoomPlanPanel({
  language,
  zones,
  nodes,
  editing,
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

  const svgRef =
    useRef<SVGSVGElement>(null);

  // While a marker is being dragged it follows the pointer;
  // the new position is only saved when it is dropped.
  const [
    drag,
    setDrag,
  ] =
    useState<{
      id: string;
      x: number;
      y: number;
      moved: boolean;
    } | null>(null);

  const placed =
    nodes
      .filter(isPlaced)
      .map((node) =>
        drag?.id === node.nodeId
          ? {
              ...node,
              x: drag.x,
              y: drag.y,
            }
          : node,
      );

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

  // Colours follow the zone's id, not its position in the list, so adding or
  // renaming a zone never changes the colour of the others.
  const zoneColor =
    new Map(
      [...zones]
        .sort(
          (a, b) =>
            a.areaId - b.areaId,
        )
        .map(
          (zone, index) => [
            zone.areaId,
            ZONE_COLORS[
              index %
                ZONE_COLORS.length
            ],
          ],
        ),
    );

  const zoneInfo =
    new Map(
      zones.map((zone) => [
        zone.areaId,
        {
          zone,

          color:
            zoneColor.get(
              zone.areaId,
            ) ?? NO_ZONE_COLOR,
        },
      ]),
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

  // Converts a pointer position on screen into drawing coordinates.
  function toPlanPoint(
    event: {
      clientX: number;
      clientY: number;
    },
  ): Point | null {
    const svg =
      svgRef.current;

    const matrix =
      svg?.getScreenCTM();

    if (!svg || !matrix) {
      return null;
    }

    const point =
      new DOMPoint(
        event.clientX,
        event.clientY,
      ).matrixTransform(
        matrix.inverse(),
      );

    return [
      clamp(point.x, PLAN_WIDTH),
      clamp(point.y, PLAN_HEIGHT),
    ];
  }

  // Clicking empty map: place the selected sensor if it has no position yet,
  // otherwise just clear the selection.
  function handleMapClick(
    event: MouseEvent<SVGSVGElement>,
  ) {
    if (!editing) {
      return;
    }

    const selected =
      nodes.find(
        (node) =>
          node.nodeId ===
          editing.selectedId,
      );

    const point =
      toPlanPoint(event);

    if (
      selected &&
      !isPlaced(selected) &&
      point
    ) {
      editing.onMove(
        selected.nodeId,
        point[0],
        point[1],
      );

      return;
    }

    editing.onSelect(null);
  }

  function handleNodePointerDown(
    event: PointerEvent<SVGGElement>,
    node: PlacedNode,
  ) {
    if (!editing) {
      return;
    }

    event.stopPropagation();

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    editing.onSelect(
      node.nodeId,
    );

    setDrag({
      id: node.nodeId,
      x: node.x,
      y: node.y,
      moved: false,
    });
  }

  function handleNodePointerMove(
    event: PointerEvent<SVGGElement>,
    node: PlacedNode,
  ) {
    if (drag?.id !== node.nodeId) {
      return;
    }

    const point =
      toPlanPoint(event);

    if (point) {
      setDrag({
        id: node.nodeId,
        x: point[0],
        y: point[1],
        moved: true,
      });
    }
  }

  function handleNodePointerUp(
    node: PlacedNode,
  ) {
    if (
      editing &&
      drag?.id === node.nodeId &&
      drag.moved
    ) {
      editing.onMove(
        node.nodeId,
        drag.x,
        drag.y,
      );
    }

    setDrag(null);
  }

  // Arrow keys nudge the focused sensor (hold Shift for bigger steps).
  function handleNodeKeyDown(
    event: KeyboardEvent<SVGGElement>,
    node: PlacedNode,
  ) {
    if (!editing) {
      return;
    }

    const step =
      event.shiftKey
        ? 20
        : 5;

    const moves: Record<
      string,
      [number, number]
    > = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };

    if (event.key in moves) {
      event.preventDefault();

      const [dx, dy] =
        moves[event.key];

      editing.onMove(
        node.nodeId,
        clamp(
          node.x + dx,
          PLAN_WIDTH,
        ),
        clamp(
          node.y + dy,
          PLAN_HEIGHT,
        ),
      );
    } else if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();

      editing.onSelect(
        node.nodeId,
      );
    }
  }

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
              ref={svgRef}
              className={
                editing
                  ? "room-plan-svg is-editing"
                  : "room-plan-svg"
              }
              viewBox={`0 0 ${PLAN_WIDTH} ${PLAN_HEIGHT}`}
              role="group"
              aria-label={copy.alt}
              onClick={handleMapClick}
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

                const selected =
                  editing?.selectedId ===
                  node.nodeId;

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
                    className={[
                      "plan-node",
                      node.stale
                        ? "is-stale"
                        : "",
                      selected
                        ? "is-selected"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    transform={`translate(${node.x} ${node.y})`}
                    tabIndex={0}
                    role="img"
                    aria-label={description}
                    onClick={(event) =>
                      event.stopPropagation()
                    }
                    onPointerDown={(
                      event,
                    ) =>
                      handleNodePointerDown(
                        event,
                        node,
                      )
                    }
                    onPointerMove={(
                      event,
                    ) =>
                      handleNodePointerMove(
                        event,
                        node,
                      )
                    }
                    onPointerUp={() =>
                      handleNodePointerUp(
                        node,
                      )
                    }
                    onPointerCancel={() =>
                      setDrag(null)
                    }
                    onKeyDown={(event) =>
                      handleNodeKeyDown(
                        event,
                        node,
                      )
                    }
                  >
                    <title>
                      {description}
                    </title>

                    {selected && (
                      <circle
                        className="plan-node-ring"
                        r="15"
                      />
                    )}

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
            {zones.map((zone) => (
              <li key={zone.areaId}>
                <span
                  className="plan-legend-chip"
                  style={{
                    background:
                      zoneColor.get(
                        zone.areaId,
                      ),
                  }}
                />

                {zone.name}
              </li>
            ))}

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
