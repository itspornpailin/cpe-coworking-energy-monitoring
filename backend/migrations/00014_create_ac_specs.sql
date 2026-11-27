-- +goose Up

-- Rating of each air conditioner, entered by an admin from its label.
-- Used to estimate electricity from the ON time in sensor_hourly_logs.
CREATE TABLE ac_specs (
    node_id VARCHAR(100) PRIMARY KEY
        REFERENCES sensor_nodes(node_id) ON DELETE CASCADE,

    brand VARCHAR(60) NOT NULL DEFAULT '',

    -- Cooling capacity.
    capacity_btu_h INTEGER NOT NULL CHECK (capacity_btu_h > 0),

    -- Seasonal energy efficiency ratio, BTU/h per W.
    seer DOUBLE PRECISION NOT NULL CHECK (seer > 0),

    -- Common Era year; NULL means no age correction.
    installed_year INTEGER,

    serviced_yearly BOOLEAN NOT NULL DEFAULT TRUE,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE ac_specs;
