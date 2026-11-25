package lighting

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/telemetry"
)

// Engine checks every lighting circuit regularly and records each change of state.
type Engine struct {
	db   *pgxpool.Pool
	live *telemetry.Store

	// How often the circuits are checked.
	interval time.Duration

	// How long a new state must hold before it is accepted.
	confirmFor time.Duration
}

func NewEngine(
	db *pgxpool.Pool,
	live *telemetry.Store,
	interval, confirmFor time.Duration,
) *Engine {
	return &Engine{db: db, live: live, interval: interval, confirmFor: confirmFor}
}

type circuitConfig struct {
	id       int64
	onAbove  *float64
	offBelow *float64
	nodeIDs  []string
}

// Run checks the circuits until ctx ends.
func (e *Engine) Run(ctx context.Context) {
	// After a restart nothing is known about the time the server was down, so any circuit that
	// was ON or OFF becomes "unknown" rather than being counted. The change is dated at the last
	// saved reading (the last moment the server was known to be running), not at the restart,
	// so the downtime itself is not counted as ON time.
	if _, err := e.db.Exec(ctx, `
INSERT INTO lighting_state_events (circuit_id, state, occurred_at)
SELECT c.id, 'unknown',
       GREATEST(last.occurred_at,
                COALESCE((SELECT MAX(recorded_at) FROM environment_readings WHERE recorded_at <= NOW()), NOW()))
FROM lighting_circuits c
JOIN LATERAL (
    SELECT e.state, e.occurred_at
    FROM lighting_state_events e
    WHERE e.circuit_id = c.id
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT 1
) last ON TRUE
WHERE last.state <> 'unknown';`); err != nil {
		log.Printf("lighting: could not reset states at startup: %v", err)
	}

	states := map[int64]*runtime{}

	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()

	for {
		e.check(ctx, states, time.Now())

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (e *Engine) check(ctx context.Context, states map[int64]*runtime, now time.Time) {
	circuits, err := e.loadCircuits(ctx)
	if err != nil {
		log.Printf("lighting: could not load circuits: %v", err)
		return
	}

	for _, circuit := range circuits {
		state := states[circuit.id]
		if state == nil {
			state = newRuntime()
			states[circuit.id] = state
		}

		avg := e.averageLux(circuit.nodeIDs, now)

		if !state.observe(now, avg, circuit.onAbove, circuit.offBelow, e.confirmFor) {
			continue
		}

		if _, err := e.db.Exec(ctx, `
INSERT INTO lighting_state_events (circuit_id, state, occurred_at, avg_lux)
VALUES ($1, $2, $3, $4);`, circuit.id, string(state.state), now, avg); err != nil {
			log.Printf("lighting: could not save state change of circuit %d: %v", circuit.id, err)
		}
	}
}

func (e *Engine) loadCircuits(ctx context.Context) ([]circuitConfig, error) {
	rows, err := e.db.Query(ctx, `
SELECT c.id, c.on_above_lux, c.off_below_lux,
       COALESCE(array_agg(n.node_id) FILTER (WHERE n.node_id IS NOT NULL), '{}')
FROM lighting_circuits c
LEFT JOIN lighting_circuit_nodes n ON n.circuit_id = c.id
GROUP BY c.id
ORDER BY c.id;`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var circuits []circuitConfig

	for rows.Next() {
		var c circuitConfig

		if err := rows.Scan(&c.id, &c.onAbove, &c.offBelow, &c.nodeIDs); err != nil {
			return nil, err
		}

		circuits = append(circuits, c)
	}

	return circuits, rows.Err()
}

// AverageLux is the mean of the latest lux of the given nodes, ignoring nodes with no
// recent reading. It returns nil when no node qualifies.
func AverageLux(live *telemetry.Store, nodeIDs []string, now time.Time) *float64 {
	var sum float64
	count := 0

	for _, nodeID := range nodeIDs {
		reading, ok := live.Get(nodeID)

		if !ok || reading.LightLux == nil || telemetry.IsStale(reading, now) {
			continue
		}

		sum += *reading.LightLux
		count++
	}

	if count == 0 {
		return nil
	}

	avg := sum / float64(count)

	return &avg
}

func (e *Engine) averageLux(nodeIDs []string, now time.Time) *float64 {
	return AverageLux(e.live, nodeIDs, now)
}
