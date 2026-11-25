import {
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import type {
  Language,
} from "../i18n/translations";

import type {
  EnvironmentNode,
  EnvironmentZone,
} from "../types/environment";

interface SensorEditorProps {
  language: Language;

  nodes: EnvironmentNode[];
  zones: EnvironmentZone[];

  editMode: boolean;
  onEditModeChange: (value: boolean) => void;

  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;

  onSetNodeZone: (
    nodeId: string,
    zoneId: number | null,
  ) => Promise<void>;

  onRemoveFromPlan: (nodeId: string) => Promise<void>;

  onCreateZone: (name: string) => Promise<void>;

  onRenameZone: (
    areaId: number,
    name: string,
  ) => Promise<void>;

  onDeleteZone: (areaId: number) => Promise<void>;
}

const COPY = {
  en: {
    title: "Sensors and zones",

    intro:
      "Choose which zone each sensor belongs to. The zone's lux and the map colours follow right away.",

    editOn: "Move sensors on the map",
    editOff: "Done moving",

    editHint:
      "Drag a sensor on the map, or select it and use the arrow keys.",

    placeHint: (name: string) =>
      `Click the map to place ${name}.`,

    sensors: "Sensors",
    noSensors: "No sensors have reported yet.",

    zoneFor: (name: string) => `Zone for ${name}`,
    noZone: "No zone",

    onPlan: "On the plan",
    notPlaced: "Not placed",
    removeFromPlan: "Remove from plan",

    zones: "Zones",
    newZone: "New zone name",
    addZone: "Add zone",
    deleteZone: "Delete",

    confirmDelete: (name: string) =>
      `Delete "${name}"? Its sensors will have no zone.`,

    renameZone: (name: string) => `Rename ${name}`,

    failed: "Something went wrong. Please try again.",
  },

  th: {
    title: "เซนเซอร์และโซน",

    intro:
      "เลือกว่าเซนเซอร์แต่ละตัวอยู่ในโซนใด ค่าความสว่างของโซนและสีบนแผนผังจะเปลี่ยนตามทันที",

    editOn: "ย้ายเซนเซอร์บนแผนผัง",
    editOff: "เสร็จสิ้น",

    editHint:
      "ลากเซนเซอร์บนแผนผัง หรือเลือกแล้วใช้ปุ่มลูกศร",

    placeHint: (name: string) =>
      `คลิกบนแผนผังเพื่อวาง ${name}`,

    sensors: "เซนเซอร์",
    noSensors: "ยังไม่มีเซนเซอร์ส่งข้อมูลเข้ามา",

    zoneFor: (name: string) => `โซนของ ${name}`,
    noZone: "ไม่มีโซน",

    onPlan: "อยู่บนแผนผัง",
    notPlaced: "ยังไม่ได้วาง",
    removeFromPlan: "เอาออกจากแผนผัง",

    zones: "โซน",
    newZone: "ชื่อโซนใหม่",
    addZone: "เพิ่มโซน",
    deleteZone: "ลบ",

    confirmDelete: (name: string) =>
      `ลบ "${name}" หรือไม่ เซนเซอร์ในโซนนี้จะไม่มีโซน`,

    renameZone: (name: string) => `เปลี่ยนชื่อ ${name}`,

    failed: "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง",
  },
} as const;

export function SensorEditor({
  language,
  nodes,
  zones,
  editMode,
  onEditModeChange,
  selectedNodeId,
  onSelectNode,
  onSetNodeZone,
  onRemoveFromPlan,
  onCreateZone,
  onRenameZone,
  onDeleteZone,
}: SensorEditorProps) {
  const copy =
    COPY[language];

  const [
    error,
    setError,
  ] =
    useState<string | null>(null);

  const [
    newZoneName,
    setNewZoneName,
  ] =
    useState("");

  // Runs one admin action and shows its error, if any, instead of throwing.
  async function run(
    action: () => Promise<void>,
  ) {
    setError(null);

    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof Error &&
          caught.message
          ? caught.message
          : copy.failed,
      );
    }
  }

  function handleAddZone(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const name =
      newZoneName.trim();

    if (name === "") {
      return;
    }

    void run(async () => {
      await onCreateZone(name);

      setNewZoneName("");
    });
  }

  const selectedUnplaced =
    editMode
      ? nodes.find(
          (node) =>
            node.nodeId ===
              selectedNodeId &&
            (node.x === null ||
              node.y === null),
        )
      : undefined;

  return (
    <section
      className="room-card sensor-editor"
      aria-label={copy.title}
    >
      <div className="sensor-editor-header">
        <h2>{copy.title}</h2>

        <button
          type="button"
          className="sensor-editor-toggle"
          aria-pressed={editMode}
          onClick={() =>
            onEditModeChange(
              !editMode,
            )
          }
        >
          {editMode
            ? copy.editOff
            : copy.editOn}
        </button>
      </div>

      <p className="sensor-editor-note">
        {copy.intro}
      </p>

      {editMode && (
        <p
          className="sensor-editor-note sensor-editor-hint"
          role="status"
        >
          {selectedUnplaced
            ? copy.placeHint(
                selectedUnplaced.name,
              )
            : copy.editHint}
        </p>
      )}

      {error !== null && (
        <p
          className="sensor-editor-error"
          role="alert"
        >
          {error}
        </p>
      )}

      <h3>{copy.sensors}</h3>

      {nodes.length === 0 ? (
        <p className="sensor-editor-note">
          {copy.noSensors}
        </p>
      ) : (
        <ul className="sensor-list">
          {nodes.map((node) => {
            const isPlaced =
              node.x !== null &&
              node.y !== null;

            return (
              <li
                key={node.nodeId}
                className={
                  node.nodeId ===
                  selectedNodeId
                    ? "sensor-row is-selected"
                    : "sensor-row"
                }
              >
                <button
                  type="button"
                  className="sensor-name"
                  onClick={() =>
                    onSelectNode(
                      node.nodeId,
                    )
                  }
                >
                  {node.name}
                </button>

                <select
                  value={
                    node.zoneId ?? ""
                  }
                  aria-label={copy.zoneFor(
                    node.name,
                  )}
                  onChange={(event) => {
                    const value =
                      event.target.value;

                    void run(() =>
                      onSetNodeZone(
                        node.nodeId,
                        value === ""
                          ? null
                          : Number(
                              value,
                            ),
                      ),
                    );
                  }}
                >
                  <option value="">
                    {copy.noZone}
                  </option>

                  {zones.map((zone) => (
                    <option
                      key={zone.areaId}
                      value={zone.areaId}
                    >
                      {zone.name}
                    </option>
                  ))}
                </select>

                <span className="sensor-state">
                  {isPlaced
                    ? copy.onPlan
                    : copy.notPlaced}
                </span>

                {isPlaced && (
                  <button
                    type="button"
                    className="sensor-action"
                    onClick={() =>
                      void run(() =>
                        onRemoveFromPlan(
                          node.nodeId,
                        ),
                      )
                    }
                  >
                    {copy.removeFromPlan}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h3>{copy.zones}</h3>

      <ul className="zone-list">
        {zones.map((zone) => (
          <li
            key={`${zone.areaId}-${zone.name}`}
            className="zone-row"
          >
            <input
              type="text"
              defaultValue={zone.name}
              maxLength={60}
              aria-label={copy.renameZone(
                zone.name,
              )}
              onBlur={(event) => {
                const name =
                  event.target.value.trim();

                if (
                  name === "" ||
                  name === zone.name
                ) {
                  event.target.value =
                    zone.name;

                  return;
                }

                void run(() =>
                  onRenameZone(
                    zone.areaId,
                    name,
                  ),
                );
              }}
              onKeyDown={(event) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  event.currentTarget.blur();
                }
              }}
            />

            <button
              type="button"
              className="sensor-action"
              onClick={() => {
                if (
                  window.confirm(
                    copy.confirmDelete(
                      zone.name,
                    ),
                  )
                ) {
                  void run(() =>
                    onDeleteZone(
                      zone.areaId,
                    ),
                  );
                }
              }}
            >
              {copy.deleteZone}
            </button>
          </li>
        ))}
      </ul>

      <form
        className="zone-add"
        onSubmit={handleAddZone}
      >
        <input
          type="text"
          value={newZoneName}
          maxLength={60}
          placeholder={copy.newZone}
          aria-label={copy.newZone}
          onChange={(event) =>
            setNewZoneName(
              event.target.value,
            )
          }
        />

        <button
          type="submit"
          className="sensor-action"
          disabled={
            newZoneName.trim() === ""
          }
        >
          {copy.addZone}
        </button>
      </form>
    </section>
  );
}
