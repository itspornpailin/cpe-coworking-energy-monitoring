-- +goose Up

-- Stores physical/logical sensors registered with the backend.
--
-- area_id is nullable because:
--   1. hardware positions have not been finalized yet
--   2. portable sensors may temporarily have no assigned area
--
-- code must match the stable sensor ID published by the hardware.
-- Example:
--   TEMP-01
--   LUX-11
--   DOOR-01

CREATE TABLE sensors (
    id BIGSERIAL PRIMARY KEY,

    room_id BIGINT NOT NULL
        REFERENCES rooms(id)
        ON DELETE CASCADE,

    area_id BIGINT
        REFERENCES areas(id)
        ON DELETE SET NULL,

    code VARCHAR(100) NOT NULL UNIQUE,

    name VARCHAR(255) NOT NULL,

    type VARCHAR(50) NOT NULL,

    unit VARCHAR(50) NOT NULL,

    x_m DOUBLE PRECISION,
    y_m DOUBLE PRECISION,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        type IN (
            'temperature',
            'illuminance',
            'humidity',
            'people_counter'
        )
    )
);

CREATE INDEX idx_sensors_room_id
ON sensors(room_id);

CREATE INDEX idx_sensors_area_id
ON sensors(area_id);

CREATE INDEX idx_sensors_type
ON sensors(type);


-- +goose Down

DROP TABLE IF EXISTS sensors;