-- +goose Up

-- These are provisional illumination zones.
-- Their final boundaries / sensor membership can be changed
-- after the physical sensors have been installed and tested.

WITH room AS (
    SELECT id
    FROM rooms
    WHERE code = 'cpe-coworking'
)
INSERT INTO areas (
    room_id,
    code,
    name
)
SELECT id, 'ILL-A', 'Illumination Zone A'
FROM room

UNION ALL

SELECT id, 'ILL-B', 'Illumination Zone B'
FROM room

UNION ALL

SELECT id, 'ILL-C', 'Illumination Zone C'
FROM room

ON CONFLICT (room_id, code) DO NOTHING;


-- Start with warnings disabled.
-- 500 lux is stored as the initial editable threshold,
-- but nothing will alert until the admin selects
-- "Bright required".

INSERT INTO area_rules (
    area_id,
    sensor_type,
    min_value,
    max_value,
    notify_below,
    notify_above,
    is_enabled
)
SELECT
    id,
    'illuminance',
    500,
    NULL,
    FALSE,
    FALSE,
    FALSE
FROM areas
WHERE code IN (
    'ILL-A',
    'ILL-B',
    'ILL-C'
)
ON CONFLICT (area_id, sensor_type) DO NOTHING;


-- +goose Down

DELETE FROM area_rules
WHERE area_id IN (
    SELECT id
    FROM areas
    WHERE code IN (
        'ILL-A',
        'ILL-B',
        'ILL-C'
    )
)
AND sensor_type = 'illuminance';

DELETE FROM areas
WHERE code IN (
    'ILL-A',
    'ILL-B',
    'ILL-C'
);