-- +goose Up

-- ============================================================
-- Map one physical ESP32 node to one or more logical sensors.
--
-- Example:
-- env_desk_01 publishes:
--   temperature_c
--   humidity_percent
--   light_lux
--
-- PostgreSQL represents those as three logical sensors that all
-- share source_node_id = 'env_desk_01'.
-- ============================================================

ALTER TABLE sensors
ADD COLUMN source_node_id VARCHAR(100);

CREATE UNIQUE INDEX idx_sensors_source_node_type
ON sensors(source_node_id, type)
WHERE source_node_id IS NOT NULL;


-- ============================================================
-- Register the seven environment nodes.
-- Area is deliberately NULL.
--
-- Do NOT guess zone membership before the physical sensors have
-- been installed and tested.
-- ============================================================

WITH room AS (
    SELECT id
    FROM rooms
    WHERE code = 'cpe-coworking'
)
INSERT INTO sensors (
    room_id,
    area_id,
    code,
    name,
    type,
    unit,
    source_node_id
)
SELECT
    room.id,
    NULL,
    'env_desk_' || LPAD(n::TEXT, 2, '0') || ':temperature',
    'Environment Desk ' || LPAD(n::TEXT, 2, '0') || ' Temperature',
    'temperature',
    'celsius',
    'env_desk_' || LPAD(n::TEXT, 2, '0')
FROM room
CROSS JOIN generate_series(1, 7) AS series(n)
ON CONFLICT (code) DO NOTHING;


WITH room AS (
    SELECT id
    FROM rooms
    WHERE code = 'cpe-coworking'
)
INSERT INTO sensors (
    room_id,
    area_id,
    code,
    name,
    type,
    unit,
    source_node_id
)
SELECT
    room.id,
    NULL,
    'env_desk_' || LPAD(n::TEXT, 2, '0') || ':humidity',
    'Environment Desk ' || LPAD(n::TEXT, 2, '0') || ' Humidity',
    'humidity',
    'percent_rh',
    'env_desk_' || LPAD(n::TEXT, 2, '0')
FROM room
CROSS JOIN generate_series(1, 7) AS series(n)
ON CONFLICT (code) DO NOTHING;


WITH room AS (
    SELECT id
    FROM rooms
    WHERE code = 'cpe-coworking'
)
INSERT INTO sensors (
    room_id,
    area_id,
    code,
    name,
    type,
    unit,
    source_node_id
)
SELECT
    room.id,
    NULL,
    'env_desk_' || LPAD(n::TEXT, 2, '0') || ':illuminance',
    'Environment Desk ' || LPAD(n::TEXT, 2, '0') || ' Illuminance',
    'illuminance',
    'lux',
    'env_desk_' || LPAD(n::TEXT, 2, '0')
FROM room
CROSS JOIN generate_series(1, 7) AS series(n)
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- Door sensors.
-- ============================================================

WITH room AS (
    SELECT id
    FROM rooms
    WHERE code = 'cpe-coworking'
)
INSERT INTO sensors (
    room_id,
    area_id,
    code,
    name,
    type,
    unit,
    source_node_id
)
SELECT
    room.id,
    NULL,
    values.code,
    values.name,
    'people_counter',
    'people',
    values.code
FROM room
CROSS JOIN (
    VALUES
        ('door_left', 'Left Door People Counter'),
        ('door_right', 'Right Door People Counter')
) AS values(code, name)
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- AC units are devices, not environmental measurements, so they
-- have their own status-event structure.
-- ============================================================

CREATE TABLE ac_units (
    id BIGSERIAL PRIMARY KEY,

    room_id BIGINT NOT NULL
        REFERENCES rooms(id)
        ON DELETE CASCADE,

    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


WITH room AS (
    SELECT id
    FROM rooms
    WHERE code = 'cpe-coworking'
)
INSERT INTO ac_units (
    room_id,
    code,
    name
)
SELECT
    room.id,
    'ac_unit_' || LPAD(n::TEXT, 2, '0'),
    'AC Unit ' || LPAD(n::TEXT, 2, '0')
FROM room
CROSS JOIN generate_series(1, 7) AS series(n)
ON CONFLICT (code) DO NOTHING;


CREATE TABLE ac_status_events (
    id BIGSERIAL PRIMARY KEY,

    ac_unit_id BIGINT NOT NULL
        REFERENCES ac_units(id)
        ON DELETE CASCADE,

    is_running BOOLEAN NOT NULL,

    -- Useful during installation for calibrating the
    -- vibration threshold.
    vibration_raw INTEGER,

    measured_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX idx_ac_status_events_unit_measured
ON ac_status_events(ac_unit_id, measured_at DESC);


-- +goose Down

DROP TABLE IF EXISTS ac_status_events;
DROP TABLE IF EXISTS ac_units;

DELETE FROM sensors
WHERE source_node_id LIKE 'env_desk_%'
   OR source_node_id IN ('door_left', 'door_right');

DROP INDEX IF EXISTS idx_sensors_source_node_type;

ALTER TABLE sensors
DROP COLUMN IF EXISTS source_node_id;