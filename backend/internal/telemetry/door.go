// People counting: each doorway node reports one person going IN or OUT, and the server
// keeps the count for the room. The nodes' own counters are ignored, because each door
// only knows about itself.
package telemetry

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/domain"
)

// doorEvent turns the direction a door node sends into the event to store.
func doorEvent(direction string) (domain.OccupancyEventType, int, error) {
	switch strings.ToUpper(strings.TrimSpace(direction)) {
	case "IN":
		return domain.OccupancyOneIn, 1, nil
	case "OUT":
		return domain.OccupancyOneOut, -1, nil
	}

	return "", 0, fmt.Errorf("direction must be IN or OUT")
}

// RecordDoor stores one crossing and updates the room's count, which never goes
// below zero. Only door nodes already registered in sensor_nodes are accepted.
func (s *Store) RecordDoor(
	ctx context.Context,
	nodeID string,
	direction string,
	measuredAt time.Time,
) error {
	eventType, delta, err := doorEvent(direction)
	if err != nil {
		return err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var registered bool

	if err := tx.QueryRow(ctx, `
SELECT EXISTS (
    SELECT 1 FROM sensor_nodes
    WHERE node_id = $1 AND node_type = 'door' AND is_active
);`, nodeID).Scan(&registered); err != nil {
		return err
	}

	if !registered {
		return fmt.Errorf("unregistered door node %q", nodeID)
	}

	if _, err := tx.Exec(ctx, `
INSERT INTO occupancy_events (node_id, event_type, delta, measured_at)
VALUES ($1, $2, $3, $4);`,
		nodeID, string(eventType), delta, normalizeTime(measuredAt),
	); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
UPDATE room_occupancy
SET current_count = GREATEST(0, current_count + $1), updated_at = NOW();`,
		delta,
	); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
