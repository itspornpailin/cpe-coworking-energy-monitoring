-- +goose Up

-- Stores people-counting events produced by the doorway node.
--
-- The raw VL53L5CX 8x8 frames and TinyML inference should normally
-- remain on the edge device.
--
-- The backend receives only the resulting event.

CREATE TABLE occupancy_events (
    id BIGSERIAL PRIMARY KEY,

    sensor_id BIGINT NOT NULL
        REFERENCES sensors(id)
        ON DELETE CASCADE,

    event_type VARCHAR(50) NOT NULL,

    -- Examples:
    -- ONE_IN  -> +1
    -- TWO_IN  -> +2
    -- ONE_OUT -> -1
    -- TWO_OUT -> -2
    delta SMALLINT NOT NULL,

    confidence DOUBLE PRECISION,

    measured_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        event_type IN (
            'one_in',
            'one_out',
            'two_in',
            'two_out',
            'crossing',
            'manual_adjustment'
        )
    ),

    CHECK (
        confidence IS NULL
        OR (
            confidence >= 0
            AND confidence <= 1
        )
    )
);


-- Stores the current calculated occupancy of each room.
CREATE TABLE room_occupancy (
    room_id BIGINT PRIMARY KEY
        REFERENCES rooms(id)
        ON DELETE CASCADE,

    current_count INTEGER NOT NULL DEFAULT 0,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (current_count >= 0)
);


-- Initialize occupancy for the existing CPE room.
INSERT INTO room_occupancy (
    room_id,
    current_count
)
SELECT
    id,
    0
FROM rooms
WHERE code = 'cpe-coworking'
ON CONFLICT (room_id) DO NOTHING;


CREATE INDEX idx_occupancy_events_sensor_measured
ON occupancy_events(sensor_id, measured_at DESC);


-- +goose Down

DROP TABLE IF EXISTS room_occupancy;
DROP TABLE IF EXISTS occupancy_events;