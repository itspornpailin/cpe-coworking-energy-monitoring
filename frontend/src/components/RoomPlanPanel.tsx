import {
  useRef,
  useState,
} from "react";

import type {
  CSSProperties,
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
  toPointsAttribute,
} from "../lib/roomGeometry";

import type {
  Point,
} from "../lib/roomGeometry";

import {
  labelSpots,
  zoneBorders,
  zonePaths,
} from "../lib/roomDistance";

import {
  NO_ZONE_COLOR,
  zoneColors,
  zoneDisplayName,
} from "../lib/zones";

import type {
  EnvironmentNode,
  EnvironmentZone,
} from "../types/environment";

import {
  LUX_SCALE,
  TEMPERATURE_SCALE,
  adaptiveScale,
  gradientCss,
  renderHeatmapCached,
} from "../lib/heatmap";

import { DEFAULT_MIN_LUX } from "../lib/luxMeter";

// What the map shows: a smooth brightness or temperature field. Zone borders are
// drawn on both.
type Layer =
  | "lux"
  | "temperature";

const UNITS: Record<Layer, string> = {
  lux: "lx",
  temperature: "°C",
};

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

  // Admin only: click a sensor to pick its zone in a popup beside it.
  zonePicker?: {
    onAssign: (
      nodeId: string,
      zoneId: number | null,
    ) => Promise<void>;
  };
}

type PlacedNode =
  EnvironmentNode & {
    x: number;
    y: number;
  };

const ROOM_PLAN_URL =
  `${import.meta.env.BASE_URL}roomplan/cpe-coworking.svg`;

const COPY = {
  en: {
    alt:
      "CPE Co-Working Space room layout",

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

    layers:
      "Map layer",

    layerNames: {
      lux: "Brightness",
      temperature: "Temperature",
    },

    heatNeedsSensors:
      "Needs at least 2 sensors with recent data.",

    zoneKey:
      "Zones",

    zoneFor: (name: string) =>
      `Zone for ${name}`,

    pickHint:
      "Click a sensor to change its zone",

    chooseZone:
      "Move to zone",

    close:
      "Close",

    assignFailed:
      "The zone was not saved. Please try again.",
  },

  th: {
    alt:
      "แผนผัง CPE Co-Working Space",

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

    layers:
      "ชั้นข้อมูลบนแผนผัง",

    layerNames: {
      lux: "ความสว่าง",
      temperature: "อุณหภูมิ",
    },

    heatNeedsSensors:
      "ต้องมีเซนเซอร์ที่ส่งข้อมูลล่าสุดอย่างน้อย 2 ตัว",

    zoneKey:
      "โซน",

    zoneFor: (name: string) =>
      `โซนของ ${name}`,

    pickHint:
      "คลิกเซนเซอร์เพื่อเปลี่ยนโซน",

    chooseZone:
      "ย้ายไปโซน",

    close:
      "ปิด",

    assignFailed:
      "บันทึกโซนไม่สำเร็จ กรุณาลองอีกครั้ง",
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
  zonePicker,
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

  const [
    layer,
    setLayer,
  ] =
    useState<Layer>("lux");

  // The sensor whose zone popup is open, and the marker to give focus back to.
  const [
    pickedId,
    setPickedId,
  ] =
    useState<string | null>(null);

  const openerRef =
    useRef<SVGGElement | null>(null);

  const [
    assignFailed,
    setAssignFailed,
  ] =
    useState(false);

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

  const zoneColor =
    zoneColors(zones);

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

  // Every spot on the floor belongs to the sensor nearest on foot, so a sensor's
  // zone decides which zone the floor around it is in. Sensors with no zone share
  // group 0 (zone ids start at 1).
  const sites =
    placed.map(
      (node): Point => [
        node.x,
        node.y,
      ],
    );

  const groups =
    placed.map((node) =>
      node.zoneId !== null &&
      zoneInfo.has(node.zoneId)
        ? node.zoneId
        : 0,
    );

  const cells =
    zonePaths(sites);

  const dividers =
    [
      ...zoneBorders(
        sites,
        groups,
      ).values(),
    ].join("");

  const nameSpots =
    labelSpots(sites, groups);

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

  // Heat map: only sensors with a recent value for this layer take part.
  const heatPoints =
    placed.flatMap(
      (node) => {
        const value =
          layer === "lux"
            ? node.lightLux
            : node.temperatureC;

        return node.stale ||
          value === null
          ? []
          : [
              {
                x: Math.round(
                  node.x,
                ),
                y: Math.round(
                  node.y,
                ),
                // Rounded so the picture is only redrawn when a value visibly changes.
                value:
                  Math.round(
                    value * 10,
                  ) / 10,
              },
            ];
      },
    );

  // Brightness keeps a fixed scale (500 lx looks the same all day). Temperature zooms
  // in on the range actually measured, so a 1-2 degree difference across the room shows.
  const heatScale =
    layer === "temperature"
      ? adaptiveScale(
          TEMPERATURE_SCALE,
          heatPoints.map(
            (point) =>
              point.value,
          ),
          4,
        )
      : LUX_SCALE;

  const heatUrl =
    renderHeatmapCached(
      heatPoints,
      heatScale,
    );

  // The number printed under a marker follows the chosen layer.
  function markerLabel(
    node: PlacedNode,
  ): string {
    const value =
      layer === "temperature"
        ? node.temperatureC
        : node.lightLux;

    if (
      node.stale ||
      value === null
    ) {
      return "–";
    }

    return layer ===
      "temperature"
      ? `${value.toFixed(1)} °C`
      : `${Math.round(value)} lx`;
  }

  // Opens the zone popup of a sensor.
  function pickNode(
    nodeId: string,
    marker: SVGGElement,
  ) {
    openerRef.current = marker;

    setAssignFailed(false);

    setPickedId(nodeId);
  }

  function closePicker() {
    setPickedId(null);

    openerRef.current?.focus();
  }

  async function assign(
    nodeId: string,
    zoneId: number | null,
  ) {
    setAssignFailed(false);

    try {
      await zonePicker?.onAssign(
        nodeId,
        zoneId,
      );

      closePicker();
    } catch {
      setAssignFailed(true);
    }
  }

  // Not while sensors are being dragged: the popup would be in the way.
  const picking =
    zonePicker !== undefined &&
    editing === undefined;

  const picked =
    picking
      ? placed.find(
          (node) =>
            node.nodeId === pickedId,
        )
      : undefined;

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
      setPickedId(null);

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
    if (
      picking &&
      (event.key === "Enter" ||
        event.key === " ")
    ) {
      event.preventDefault();

      pickNode(
        node.nodeId,
        event.currentTarget,
      );

      return;
    }

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
        <div
          className="plan-layers"
          role="group"
          aria-label={copy.layers}
        >
          {(
            [
              "lux",
              "temperature",
            ] as const
          ).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={
                layer === name
              }
              onClick={() =>
                setLayer(name)
              }
            >
              {
                copy.layerNames[
                  name
                ]
              }
            </button>
          ))}
        </div>

        {picking && (
          <p className="plan-hint">
            {copy.pickHint}
          </p>
        )}

        <div className="map-stage">
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
              className={[
                "room-plan-svg",
                editing ? "is-editing" : "",
                picking ? "is-picking" : "",
              ]
                .filter(Boolean)
                .join(" ")}
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

              {heatUrl && (
                <image
                  className="plan-heat-image"
                  href={heatUrl}
                  width={PLAN_WIDTH}
                  height={PLAN_HEIGHT}
                  preserveAspectRatio="none"
                  clipPath="url(#room-floor)"
                />
              )}

              <g
                className="plan-zones"
                clipPath="url(#room-floor)"
              >
                {[...new Set(groups)]
                  .filter(
                    (group) =>
                      zoneInfo.get(group)?.zone
                        .warning,
                  )
                  .map((group) => (
                    <path
                      key={group}
                      d={cells
                        .filter(
                          (_, index) =>
                            groups[index] ===
                            group,
                        )
                        .join("")}
                      fill="url(#zone-warning-hatch)"
                      shapeRendering="crispEdges"
                    />
                  ))}

                {/* A white line on a soft dark one shows on both yellow and grey. */}
                <path
                  className="plan-zone-casing"
                  d={dividers}
                />

                <path
                  className="plan-zone-divider"
                  d={dividers}
                />
              </g>

              {placed.map((node) => {
                const info =
                  node.zoneId === null
                    ? undefined
                    : zoneInfo.get(
                        node.zoneId,
                      );

                const selected =
                  (editing
                    ? editing.selectedId
                    : picked?.nodeId) ===
                  node.nodeId;

                const description =
                  [
                    node.name,

                    `${copy.zone}: ${
                      info
                        ? zoneDisplayName(
                            info.zone,
                            language,
                          )
                        : copy.noZone
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
                    role={
                      picking
                        ? "button"
                        : "img"
                    }
                    aria-label={description}
                    onClick={(event) => {
                      event.stopPropagation();

                      if (picking) {
                        pickNode(
                          node.nodeId,
                          event.currentTarget,
                        );
                      }
                    }}
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
                        fill: node.stale
                          ? undefined
                          : (info?.color ??
                            NO_ZONE_COLOR),
                      }}
                    />

                    <text
                      className="plan-node-label"
                      y="23"
                      textAnchor="middle"
                    >
                      {markerLabel(
                        node,
                      )}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          {/* Ordinary text on top of the drawing, so it stays readable at any width.
              Screen readers get the zone from each sensor and from the legend. */}
          {!mapFailed &&
            [...nameSpots].map(
              ([group, [x, y]]) => {
                const info =
                  zoneInfo.get(group);

                return (
                  <span
                    key={group}
                    className="plan-zone-name"
                    aria-hidden="true"
                    style={{
                      left: `${(x / PLAN_WIDTH) * 100}%`,
                      top: `${(y / PLAN_HEIGHT) * 100}%`,
                      "--zone":
                        info?.color ??
                        NO_ZONE_COLOR,
                    } as CSSProperties}
                  >
                    {info
                      ? zoneDisplayName(
                          info.zone,
                          language,
                        )
                      : copy.noZone}
                  </span>
                );
              },
            )}
        </div>

        {picked && (
          <div
            // A new sensor gets a new popup, so focus moves into it again.
            key={picked.nodeId}
            className="plan-pop"
            role="dialog"
            aria-label={copy.zoneFor(
              picked.name,
            )}
            style={{
              "--x": `${(picked.x / PLAN_WIDTH) * 100}%`,
              "--y": `${(picked.y / PLAN_HEIGHT) * 100}%`,
              // Beside the sensor, on the side with more room, and never off the map.
              "--shift-x":
                picked.x < PLAN_WIDTH / 2
                  ? "22px"
                  : "calc(-100% - 22px)",
              "--shift-y": `-${(picked.y / PLAN_HEIGHT) * 100}%`,
            } as CSSProperties}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                closePicker();
              }
            }}
          >
            <div className="plan-pop-title">
              <strong>{picked.name}</strong>

              <button
                type="button"
                className="plan-pop-close"
                aria-label={copy.close}
                onClick={closePicker}
              >
                ×
              </button>
            </div>

            <span className="plan-pop-label">
              {copy.chooseZone}
            </span>

            {[
              ...zones.map((zone) => ({
                id: zone.areaId,
                name: zoneDisplayName(
                  zone,
                  language,
                ),
                color:
                  zoneColor.get(
                    zone.areaId,
                  ),
              })),
              {
                id: null,
                name: copy.noZone,
                color: NO_ZONE_COLOR,
              },
            ].map((choice) => (
              <button
                key={choice.id ?? "none"}
                type="button"
                className="plan-assign-zone"
                style={{
                  "--zone": choice.color,
                } as CSSProperties}
                aria-pressed={
                  picked.zoneId ===
                  choice.id
                }
                autoFocus={
                  picked.zoneId ===
                  choice.id
                }
                onClick={() =>
                  void assign(
                    picked.nodeId,
                    choice.id,
                  )
                }
              >
                {choice.name}
              </button>
            ))}

            {assignFailed && (
              <p
                className="sensor-editor-error"
                role="alert"
              >
                {copy.assignFailed}
              </p>
            )}
          </div>
        )}
        </div>

        <div className="plan-legend-wrap">
          <ul
            className="plan-legend"
            aria-label={copy.zoneKey}
          >
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

                {zoneDisplayName(
                  zone,
                  language,
                )}
              </li>
            ))}

            {groups.includes(0) && (
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

          <div className="plan-heat-legend">
            <div className="plan-heat-scale">
              <div
                className="plan-heat-bar"
                style={{
                  background:
                    gradientCss(
                      heatScale,
                    ),
                }}
              />

              {layer === "lux" && (
                <span
                  className="plan-heat-mark"
                  aria-hidden="true"
                  style={{
                    left: `${((DEFAULT_MIN_LUX - heatScale.min) / (heatScale.max - heatScale.min)) * 100}%`,
                  }}
                />
              )}
            </div>

            <div className="plan-heat-ticks">
              {Array.from(
                { length: 5 },
                (_, index) => {
                  const {
                    min,
                    max,
                  } =
                    heatScale;

                  const tick =
                    min +
                    (index *
                      (max - min)) /
                      4;

                  return (
                    <span key={index}>
                      {Number(
                        tick.toFixed(1),
                      )}{" "}
                      {UNITS[layer]}
                    </span>
                  );
                },
              )}
            </div>

            {layer === "lux" && (
              <p className="plan-status">
                {language === "th"
                  ? `เส้นขีด = ${DEFAULT_MIN_LUX} ลักซ์ ค่าแนะนำสำหรับงานบนโต๊ะ `
                  : `Line = ${DEFAULT_MIN_LUX} lux, recommended for desk work. `}
                <a href="#awareness">
                  {language === "th" ? "ทำไม?" : "Why?"}
                </a>
              </p>
            )}

            {!heatUrl && (
              <p className="plan-status">
                {
                  copy.heatNeedsSensors
                }
              </p>
            )}
          </div>

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
