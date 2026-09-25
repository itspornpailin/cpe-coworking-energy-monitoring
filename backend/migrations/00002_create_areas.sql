-- +goose Up

-- An area is a logical part of the room whose sensor readings
-- are evaluated together.
--
-- Example:
-- LUX-11 + LUX-12 + LUX-13 -> Area A

CREATE TABLE areas (
    id BIGSERIAL PRIMARY KEY,

    room_id BIGINT NOT NULL
        REFERENCES rooms(id)
        ON DELETE CASCADE,

    code VARCHAR(50) NOT NULL,

    name VARCHAR(255) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (room_id, code)
);

CREATE INDEX idx_areas_room_id
ON areas(room_id);


-- +goose Down

DROP TABLE IF EXISTS areas;