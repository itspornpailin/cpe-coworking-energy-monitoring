// Package mocksensors feeds fake readings into the live store so the dashboard can be
// developed and demonstrated before the real hardware is installed.
//
// Development only: main.go starts it when MOCK_SENSORS=true and APP_ENV=development.
// The demo nodes use the "demo_env_" prefix so they never clash with real node IDs.
package mocksensors

import (
	"context"
	"fmt"
	"log"
	"math"
	"math/rand/v2"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/telemetry"
)

type demoNode struct {
	ID   string
	Name string

	// Position on the room drawing (the 7 pink circles, drawing coordinates).
	X, Y float64

	// Zone the node starts in. Admin can move it later; this is only used when the node is first created.
	Zone string

	// Window is how much of the daylight reaches this node (0 = none, 1 = beside the window).
	Window float64

	// Lamp is the lux the ceiling lights add when they are on.
	Lamp float64

	// TempOffset is added to the room temperature (°C).
	TempOffset float64
}

var nodes = []demoNode{
	{"demo_env_01", "Demo node 1", 89, 171, "ZONE-A", 0.2, 380, -0.4},
	{"demo_env_02", "Demo node 2", 466.5, 210, "ZONE-B", 0.3, 420, 0.0},
	{"demo_env_03", "Demo node 3", 361, 389, "ZONE-B", 0.1, 350, 0.3},
	{"demo_env_04", "Demo node 4", 619, 115, "ZONE-C", 0.9, 300, 0.6},
	{"demo_env_05", "Demo node 5", 793.5, 115, "ZONE-C", 1.0, 280, 0.9},
	{"demo_env_06", "Demo node 6", 619, 333.5, "ZONE-C", 0.5, 450, 0.2},
	{"demo_env_07", "Demo node 7", 793.5, 333.5, "ZONE-C", 0.7, 400, 0.5},
}

// Sample returns the lux and temperature a node would measure at time t (no noise).
// Daylight runs 06:00-18:00 and the ceiling lights are on during office hours (08:30-19:00).
func Sample(n demoNode, t time.Time) (lux, tempC float64) {
	hour := float64(t.Hour()) + float64(t.Minute())/60

	daylight := math.Max(0, math.Sin(math.Pi*(hour-6)/12))
	lux = n.Window * 900 * daylight

	if hour >= 8.5 && hour < 19 {
		lux += n.Lamp
	}

	tempC = 26 + 2.5*math.Sin(math.Pi*(hour-9)/12) + n.TempOffset

	return lux, tempC
}

// Run seeds the demo nodes and then publishes a reading for each one every interval until ctx ends.
func Run(ctx context.Context, db *pgxpool.Pool, store *telemetry.Store, interval time.Duration) {
	if err := seed(ctx, db); err != nil {
		log.Printf("mock sensors: seeding failed: %v", err)
		return
	}

	log.Printf("mock sensors: publishing %d demo nodes every %s", len(nodes), interval)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		publish(ctx, store, time.Now())

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func publish(ctx context.Context, store *telemetry.Store, now time.Time) {
	for i, n := range nodes {
		// The last node goes quiet for 7 minutes in every 20 so the "no recent data" state can be seen.
		if i == len(nodes)-1 && now.Minute()%20 >= 13 {
			continue
		}

		lux, tempC := Sample(n, simulatedTime(now))

		lux = math.Max(0, lux*(1+0.03*(rand.Float64()*2-1)))
		tempC += 0.15 * (rand.Float64()*2 - 1)

		if err := store.UpdateEnvironment(ctx, n.ID, &tempC, &lux, now); err != nil {
			log.Printf("mock sensors: %s: %v", n.ID, err)
		}
	}

	for i := range acCount {
		running := ACRunning(i, simulatedTime(now))

		if err := store.UpdateAC(ctx, acID(i), nil, &running, now); err != nil {
			log.Printf("mock sensors: %s: %v", acID(i), err)
		}
	}
}

// simulatedTime returns now, or now moved to the hour in MOCK_SENSOR_HOUR (0-23) when that is set.
// It lets a demo show midday readings in the evening. Reading timestamps still use the real time.
func simulatedTime(now time.Time) time.Time {
	hour, err := strconv.Atoi(os.Getenv("MOCK_SENSOR_HOUR"))
	if err != nil || hour < 0 || hour > 23 {
		return now
	}

	return time.Date(now.Year(), now.Month(), now.Day(), hour, now.Minute(), 0, 0, now.Location())
}

// seed creates the demo nodes with a position and a starting zone.
// Nodes that already exist are left alone, so admin changes survive a restart.
func seed(ctx context.Context, db *pgxpool.Pool) error {
	for _, n := range nodes {
		tag, err := db.Exec(ctx, `
INSERT INTO sensor_nodes (node_id, node_type, name, x_pos, y_pos)
VALUES ($1, 'environment', $2, $3, $4)
ON CONFLICT (node_id) DO NOTHING;`, n.ID, n.Name, n.X, n.Y)
		if err != nil {
			return err
		}

		if tag.RowsAffected() == 0 {
			continue
		}

		if _, err := db.Exec(ctx, `
INSERT INTO zone_sensor_assignments (zone_id, node_id)
SELECT id, $2 FROM zones WHERE code = $1
ON CONFLICT DO NOTHING;`, n.Zone, n.ID); err != nil {
			return err
		}

	}

	for i := range acCount {
		if _, err := db.Exec(ctx, `
INSERT INTO sensor_nodes (node_id, node_type, name)
VALUES ($1, 'ac', $2)
ON CONFLICT (node_id) DO NOTHING;`, acID(i), fmt.Sprintf("AC %d", i+1)); err != nil {
			return err
		}
	}

	return nil
}

// The room has 7 ceiling-suspended air conditioners.
const acCount = 7

func acID(i int) string {
	return fmt.Sprintf("demo_ac_%02d", i+1)
}

// ACRunning says whether demo air conditioner i (0-based) is ON at time t:
// the first four run 09:00-18:00, the rest join for the busier afternoon.
func ACRunning(i int, t time.Time) bool {
	start := 9
	if i >= 4 {
		start = 13
	}

	return t.Hour() >= start && t.Hour() < 18
}
