-- +goose Up

-- Raw lux / temperature readings, one row per node per save interval
-- (READING_SAVE_INTERVAL, default 60 s).
--
-- Averages over any window (5 minutes, an hour, a day) are calculated from
-- these rows when they are asked for, so the window is a choice made at query
-- time and can change later without losing data.
--
-- Rough size: 7 nodes x 1 row/minute = about 10,000 rows a day.
CREATE TABLE environment_readings (
    node_id VARCHAR(100) NOT NULL
        REFERENCES sensor_nodes(node_id)
        ON DELETE CASCADE,

    recorded_at TIMESTAMPTZ NOT NULL,

    temperature_c DOUBLE PRECISION,
    light_lux DOUBLE PRECISION,

    -- A repeated MQTT delivery of the same message is ignored.
    PRIMARY KEY (node_id, recorded_at),

    CHECK (temperature_c IS NOT NULL OR light_lux IS NOT NULL)
);

CREATE INDEX idx_environment_readings_time
ON environment_readings(recorded_at);

-- +goose Down

DROP TABLE environment_readings;
