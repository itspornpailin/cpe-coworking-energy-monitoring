-- +goose Up

-- ============================================================
-- Hardware nodes
--
-- One row = one physical MQTT-producing node.
--
-- Examples:
-- env_desk_01
-- ac_unit_01
-- ============================================================

CREATE TABLE sensor_nodes (
    node_id VARCHAR(100) PRIMARY KEY,

    node_type VARCHAR(30) NOT NULL,

    name VARCHAR(255),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        node_type IN (
            'environment',
            'ac'
        )
    )
);


-- ============================================================
-- Configurable dashboard zones.
--
-- Zone membership is NOT stored on sensor_nodes.
-- An admin can move a node between zones later.
-- ============================================================

CREATE TABLE zones (
    id BIGSERIAL PRIMARY KEY,

    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,

    min_lux DOUBLE PRECISION NOT NULL DEFAULT 500,

    threshold_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (min_lux > 0)
);


-- Preserve the current A/B/C threshold configuration where possible.

INSERT INTO zones (
    code,
    name,
    min_lux,
    threshold_enabled
)
SELECT
    REPLACE(a.code, 'ILL-', 'ZONE-'),
    REPLACE(a.name, 'Illumination ', ''),
    COALESCE(ar.min_value, 500),
    COALESCE(ar.is_enabled, FALSE)
        AND COALESCE(ar.notify_below, FALSE)
FROM areas a
LEFT JOIN area_rules ar
    ON ar.area_id = a.id
    AND ar.sensor_type = 'illuminance'
WHERE a.code IN (
    'ILL-A',
    'ILL-B',
    'ILL-C'
)
ON CONFLICT (code) DO NOTHING;


-- Always make sure A/B/C exist.

INSERT INTO zones (
    code,
    name,
    min_lux,
    threshold_enabled
)
VALUES
    ('ZONE-A', 'Zone A', 500, FALSE),
    ('ZONE-B', 'Zone B', 500, FALSE),
    ('ZONE-C', 'Zone C', 500, FALSE)
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- Current node -> zone membership.
--
-- One hardware node belongs to one zone at a time.
-- Moving a node only changes this table.
-- ============================================================

CREATE TABLE zone_sensor_assignments (
    zone_id BIGINT NOT NULL
        REFERENCES zones(id)
        ON DELETE CASCADE,

    node_id VARCHAR(100) NOT NULL
        REFERENCES sensor_nodes(node_id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (zone_id, node_id),

    UNIQUE (node_id)
);


CREATE INDEX idx_zone_sensor_assignments_zone
ON zone_sensor_assignments(zone_id);


-- ============================================================
-- Long-term data.
--
-- One row per hardware node per hour.
--
-- Environment nodes normally use:
-- temperature_c + light_lux
--
-- AC nodes normally use:
-- vibration_raw + is_running + ac_on_minutes
-- ============================================================

CREATE TABLE sensor_hourly_logs (
    id BIGSERIAL PRIMARY KEY,

    node_id VARCHAR(100) NOT NULL
        REFERENCES sensor_nodes(node_id)
        ON DELETE CASCADE,

    temperature_c DOUBLE PRECISION,
    light_lux DOUBLE PRECISION,

    vibration_raw DOUBLE PRECISION,

    is_running BOOLEAN,

    ac_on_minutes DOUBLE PRECISION,

    sample_count INTEGER NOT NULL DEFAULT 0,

    recorded_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (node_id, recorded_at),

    CHECK (
        ac_on_minutes IS NULL
        OR (
            ac_on_minutes >= 0
            AND ac_on_minutes <= 60
        )
    ),

    CHECK (
        temperature_c IS NOT NULL
        OR light_lux IS NOT NULL
        OR vibration_raw IS NOT NULL
        OR is_running IS NOT NULL
    )
);


CREATE INDEX idx_sensor_hourly_logs_node_time
ON sensor_hourly_logs(node_id, recorded_at DESC);


-- ============================================================
-- Remove the old monitoring schema.
--
-- users + sessions are deliberately preserved.
-- ============================================================

DROP TABLE IF EXISTS ac_status_events;
DROP TABLE IF EXISTS ac_units;

DROP TABLE IF EXISTS room_occupancy;
DROP TABLE IF EXISTS occupancy_events;

DROP TABLE IF EXISTS area_rules;
DROP TABLE IF EXISTS sensor_readings;
DROP TABLE IF EXISTS sensors;

DROP TABLE IF EXISTS areas;
DROP TABLE IF EXISTS rooms;