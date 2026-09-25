-- +goose Up

-- Stores historical numerical measurements.
--
-- Examples:
-- TEMP-01 -> 25.4
-- LUX-11  -> 487
--
-- The sensor table determines what the number represents
-- and which unit it uses.

CREATE TABLE sensor_readings (
    id BIGSERIAL PRIMARY KEY,

    sensor_id BIGINT NOT NULL
        REFERENCES sensors(id)
        ON DELETE CASCADE,

    value DOUBLE PRECISION NOT NULL,

    measured_at TIMESTAMPTZ NOT NULL,

    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optimizes the most common query:
-- "Give me the newest reading for this sensor."
CREATE INDEX idx_sensor_readings_sensor_measured
ON sensor_readings(sensor_id, measured_at DESC);

CREATE INDEX idx_sensor_readings_measured_at
ON sensor_readings(measured_at DESC);


-- +goose Down

DROP TABLE IF EXISTS sensor_readings;