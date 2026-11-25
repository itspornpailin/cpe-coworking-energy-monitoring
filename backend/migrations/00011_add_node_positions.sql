-- +goose Up

-- Where a node sits on the 2D room drawing.
-- Units are the drawing's own coordinate space (frontend/public/roomplan/cpe-coworking.svg,
-- viewBox 0 0 870 496), so the position does not change when the page is resized.
-- NULL means "not placed yet".
ALTER TABLE sensor_nodes
    ADD COLUMN x_pos DOUBLE PRECISION,
    ADD COLUMN y_pos DOUBLE PRECISION,
    ADD CONSTRAINT sensor_nodes_position_pair
        CHECK ((x_pos IS NULL) = (y_pos IS NULL));

-- +goose Down

ALTER TABLE sensor_nodes
    DROP CONSTRAINT sensor_nodes_position_pair,
    DROP COLUMN x_pos,
    DROP COLUMN y_pos;
