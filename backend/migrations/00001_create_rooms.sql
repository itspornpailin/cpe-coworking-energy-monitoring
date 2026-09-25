-- +goose Up

CREATE TABLE rooms (
    id BIGSERIAL PRIMARY KEY,

    code VARCHAR(50) NOT NULL UNIQUE,

    name VARCHAR(255) NOT NULL,

    width_m DOUBLE PRECISION,
    height_m DOUBLE PRECISION,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO rooms (
    code,
    name
)
VALUES (
    'cpe-coworking',
    'CPE Co-Working Space'
);

-- +goose Down

DROP TABLE IF EXISTS rooms;