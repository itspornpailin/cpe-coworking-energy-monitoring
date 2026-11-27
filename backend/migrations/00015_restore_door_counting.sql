-- +goose Up

-- Door people counting, which migration 00010 removed, rebuilt on sensor_nodes.
-- Counts recorded before 00010 ran are not brought back.

ALTER TABLE sensor_nodes
    DROP CONSTRAINT sensor_nodes_node_type_check;

ALTER TABLE sensor_nodes
    ADD CONSTRAINT sensor_nodes_node_type_check
    CHECK (node_type IN ('environment', 'ac', 'door'));

-- Only registered doors are counted.
INSERT INTO sensor_nodes (node_id, node_type, name)
VALUES
    ('door_left', 'door', 'Left Door People Counter'),
    ('door_right', 'door', 'Right Door People Counter')
ON CONFLICT (node_id) DO NOTHING;

CREATE TABLE occupancy_events (
    id BIGSERIAL PRIMARY KEY,

    node_id VARCHAR(100) NOT NULL
        REFERENCES sensor_nodes(node_id) ON DELETE CASCADE,

    event_type VARCHAR(50) NOT NULL
        CHECK (event_type IN (
            'one_in', 'one_out', 'two_in', 'two_out', 'crossing', 'manual_adjustment'
        )),

    delta SMALLINT NOT NULL,

    confidence DOUBLE PRECISION
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

    measured_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_occupancy_events_node_measured
    ON occupancy_events(node_id, measured_at DESC);

-- One row: this system watches one room.
CREATE TABLE room_occupancy (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    current_count INTEGER NOT NULL DEFAULT 0 CHECK (current_count >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO room_occupancy DEFAULT VALUES;

-- +goose Down
DROP TABLE occupancy_events;
DROP TABLE room_occupancy;

DELETE FROM sensor_nodes WHERE node_type = 'door';

ALTER TABLE sensor_nodes
    DROP CONSTRAINT sensor_nodes_node_type_check;

ALTER TABLE sensor_nodes
    ADD CONSTRAINT sensor_nodes_node_type_check
    CHECK (node_type IN ('environment', 'ac'));
