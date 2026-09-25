-- +goose Up

-- Defines configurable environmental rules for each area.
--
-- No threshold is hardcoded in Go or ESP32 firmware.
--
-- Examples:
--
-- Bright area:
--   sensor_type = illuminance
--   min_value = 500
--   notify_below = true
--
-- Dark area with no light warning:
--   is_enabled = false
--
-- Dark-preferred area:
--   max_value = 200
--   notify_above = true
--
-- Temperature example:
--   min_value = 24
--   max_value = 27
--   notify_below = true
--   notify_above = true

CREATE TABLE area_rules (
    id BIGSERIAL PRIMARY KEY,

    area_id BIGINT NOT NULL
        REFERENCES areas(id)
        ON DELETE CASCADE,

    sensor_type VARCHAR(50) NOT NULL,

    min_value DOUBLE PRECISION,
    max_value DOUBLE PRECISION,

    notify_below BOOLEAN NOT NULL DEFAULT FALSE,
    notify_above BOOLEAN NOT NULL DEFAULT FALSE,

    -- Disabled by default so the system does not generate
    -- warnings until the team intentionally configures a rule.
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (area_id, sensor_type),

    CHECK (
        sensor_type IN (
            'temperature',
            'illuminance',
            'humidity'
        )
    ),

    CHECK (
        min_value IS NULL
        OR max_value IS NULL
        OR min_value <= max_value
    )
);

CREATE INDEX idx_area_rules_area_id
ON area_rules(area_id);


-- +goose Down

DROP TABLE IF EXISTS area_rules;