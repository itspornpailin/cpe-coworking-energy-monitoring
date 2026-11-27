-- +goose Up

-- Lighting circuits of the room, from the LP panelboard schedule
-- (as-built drawing EE-06, dated 10/12/2568). Only the five circuits marked
-- "lighting" are listed; sockets and spare ways are not part of this estimate.
--
-- rated_va is the "connected load in VA" of the schedule.
-- power_factor turns VA into watts (watts = VA x power factor). It starts at 1.0,
-- which treats the whole rating as real power, so the estimate is an upper bound
-- until an admin sets a more realistic value.
--
-- on_above_lux / off_below_lux decide when the circuit counts as ON or OFF from the
-- lux of its nodes (two different values, so the state does not flicker around one
-- threshold). They start empty: the right values must be found by switching the
-- lights on and off after the sensors are installed, so until then the circuit's
-- state is "unknown" and nothing is counted.
CREATE TABLE lighting_circuits (
    id BIGSERIAL PRIMARY KEY,

    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,

    rated_va DOUBLE PRECISION NOT NULL CHECK (rated_va > 0),
    power_factor DOUBLE PRECISION NOT NULL DEFAULT 1.0
        CHECK (power_factor > 0 AND power_factor <= 1),

    on_above_lux DOUBLE PRECISION,
    off_below_lux DOUBLE PRECISION,

    CHECK ((on_above_lux IS NULL) = (off_below_lux IS NULL)),
    CHECK (on_above_lux IS NULL OR (off_below_lux >= 0 AND on_above_lux > off_below_lux))
);

INSERT INTO lighting_circuits (code, name, rated_va) VALUES
    ('LP-1', 'Lighting LP-1', 800),
    ('LP-3', 'Lighting LP-3', 600),
    ('LP-5', 'Lighting LP-5', 1400),
    ('LP-7', 'Lighting LP-7', 800),
    ('LP-9', 'Lighting LP-9', 1100);

-- Which sensor nodes show a circuit's state. A node may be listed for several
-- circuits when their light overlaps.
CREATE TABLE lighting_circuit_nodes (
    circuit_id BIGINT NOT NULL
        REFERENCES lighting_circuits(id)
        ON DELETE CASCADE,

    node_id VARCHAR(100) NOT NULL
        REFERENCES sensor_nodes(node_id)
        ON DELETE CASCADE,

    PRIMARY KEY (circuit_id, node_id)
);

-- One row each time a circuit's state changes. The time a circuit was ON is the
-- gap between an 'on' event and the next event, so no fixed time window is needed.
-- 'unknown' means we cannot tell (no recent data, or not calibrated yet) and that
-- time is never counted.
CREATE TABLE lighting_state_events (
    id BIGSERIAL PRIMARY KEY,

    circuit_id BIGINT NOT NULL
        REFERENCES lighting_circuits(id)
        ON DELETE CASCADE,

    state VARCHAR(10) NOT NULL CHECK (state IN ('on', 'off', 'unknown')),

    occurred_at TIMESTAMPTZ NOT NULL,

    -- Average lux of the circuit's nodes when the state changed.
    avg_lux DOUBLE PRECISION
);

CREATE INDEX idx_lighting_state_events_circuit_time
ON lighting_state_events(circuit_id, occurred_at DESC);

-- +goose Down

DROP TABLE lighting_state_events;
DROP TABLE lighting_circuit_nodes;
DROP TABLE lighting_circuits;
