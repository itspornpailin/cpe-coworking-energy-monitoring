package telemetry

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type LiveReading struct {
	NodeID string

	TemperatureC *float64
	LightLux     *float64

	VibrationRaw *int
	IsRunning    *bool

	// UpdatedAt is the time the node says it measured (shown to users).
	UpdatedAt time.Time

	// ReceivedAt is when this server last heard from the node. Staleness uses it,
	// so a node with a wrong clock is not mistaken for a silent one.
	ReceivedAt time.Time

	// Interval is a smoothed estimate of the time between this node's messages.
	Interval time.Duration
}

const (
	// A node counts as silent after 3 missed messages.
	missedMessagesBeforeStale = 3

	minStaleAfter = 30 * time.Second
	maxStaleAfter = 15 * time.Minute

	// Used until two messages have been seen and the real interval is known.
	defaultStaleAfter = 5 * time.Minute
)

// StaleAfter is how long a node may stay quiet before its reading is treated as old.
// It follows the node's own reporting rhythm instead of a fixed number.
func StaleAfter(reading LiveReading) time.Duration {
	if reading.Interval <= 0 {
		return defaultStaleAfter
	}

	return min(
		max(missedMessagesBeforeStale*reading.Interval, minStaleAfter),
		maxStaleAfter,
	)
}

// IsStale reports whether the node has been quiet for too long.
func IsStale(reading LiveReading, now time.Time) bool {
	return now.Sub(reading.ReceivedAt) > StaleAfter(reading)
}

// smoothInterval folds a new gap between messages into the running estimate.
// Gaps longer than maxStaleAfter mean the node was offline, so they are ignored.
func smoothInterval(previous, gap time.Duration) time.Duration {
	if gap <= 0 || gap > maxStaleAfter {
		return previous
	}

	if previous <= 0 {
		return gap
	}

	return (7*previous + 3*gap) / 10
}

type hourlyBucket struct {
	NodeID   string
	NodeType string
	Hour     time.Time

	TemperatureSum   float64
	TemperatureCount int

	LightSum   float64
	LightCount int

	VibrationSum   float64
	VibrationCount int

	ACSamples      int
	RunningSamples int
	LastRunning    *bool

	SampleCount int
}

type Store struct {
	db *pgxpool.Pool

	mu sync.RWMutex

	live    map[string]LiveReading
	buckets map[string]*hourlyBucket
	known   map[string]bool

	// Environment readings are saved to the database at most once per saveInterval per node.
	saveInterval time.Duration
	lastSaved    map[string]time.Time
}

func NewStore(db *pgxpool.Pool, saveInterval time.Duration) *Store {
	return &Store{
		db:           db,
		live:         make(map[string]LiveReading),
		buckets:      make(map[string]*hourlyBucket),
		known:        make(map[string]bool),
		saveInterval: saveInterval,
		lastSaved:    make(map[string]time.Time),
	}
}

func (s *Store) Get(nodeID string) (LiveReading, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	value, ok := s.live[nodeID]
	return value, ok
}

func (s *Store) UpdateEnvironment(
	ctx context.Context,
	nodeID string,
	temperatureC *float64,
	lightLux *float64,
	measuredAt time.Time,
) error {
	if nodeID == "" {
		return fmt.Errorf("environment node_id is required")
	}

	if temperatureC == nil && lightLux == nil {
		return fmt.Errorf("environment reading contains no supported values")
	}

	if err := s.ensureNode(ctx, nodeID, "environment"); err != nil {
		return err
	}

	measuredAt = normalizeTime(measuredAt)
	now := time.Now()

	s.mu.Lock()

	live := s.live[nodeID]

	if !live.ReceivedAt.IsZero() {
		live.Interval = smoothInterval(live.Interval, now.Sub(live.ReceivedAt))
	}

	live.NodeID = nodeID
	live.UpdatedAt = measuredAt
	live.ReceivedAt = now

	if temperatureC != nil {
		value := *temperatureC
		live.TemperatureC = &value
	}

	if lightLux != nil {
		value := *lightLux
		live.LightLux = &value
	}

	s.live[nodeID] = live

	// Keep one saved reading per node per saveInterval. Averages over any longer
	// window (5 minutes, an hour, a day) are worked out later when asked for.
	save := now.Sub(s.lastSaved[nodeID]) >= s.saveInterval

	if save {
		s.lastSaved[nodeID] = now
	}

	s.mu.Unlock()

	if !save {
		return nil
	}

	if err := s.saveEnvironmentReading(ctx, nodeID, temperatureC, lightLux, measuredAt); err != nil {
		// Try again on the node's next message instead of waiting a full interval.
		s.mu.Lock()
		delete(s.lastSaved, nodeID)
		s.mu.Unlock()

		return err
	}

	return nil
}

// saveEnvironmentReading stores one raw reading. A repeated delivery of the same
// message (MQTT QoS 1 can do that) is ignored.
func (s *Store) saveEnvironmentReading(
	ctx context.Context,
	nodeID string,
	temperatureC *float64,
	lightLux *float64,
	measuredAt time.Time,
) error {
	_, err := s.db.Exec(ctx, `
INSERT INTO environment_readings (node_id, recorded_at, temperature_c, light_lux)
VALUES ($1, $2, $3, $4)
ON CONFLICT (node_id, recorded_at) DO NOTHING;`,
		nodeID, measuredAt, temperatureC, lightLux)
	if err != nil {
		return fmt.Errorf("save environment reading for %q: %w", nodeID, err)
	}

	return nil
}

func (s *Store) UpdateAC(
	ctx context.Context,
	nodeID string,
	vibrationRaw *int,
	isRunning *bool,
	measuredAt time.Time,
) error {
	if nodeID == "" {
		return fmt.Errorf("AC node_id is required")
	}

	if vibrationRaw == nil && isRunning == nil {
		return fmt.Errorf("AC reading contains no supported values")
	}

	if err := s.ensureNode(ctx, nodeID, "ac"); err != nil {
		return err
	}

	measuredAt = normalizeTime(measuredAt)

	s.mu.Lock()
	defer s.mu.Unlock()

	live := s.live[nodeID]
	live.NodeID = nodeID
	live.UpdatedAt = measuredAt

	if vibrationRaw != nil {
		value := *vibrationRaw
		live.VibrationRaw = &value
	}

	if isRunning != nil {
		value := *isRunning
		live.IsRunning = &value
	}

	s.live[nodeID] = live

	bucket := s.bucketLocked(nodeID, "ac", measuredAt)

	if vibrationRaw != nil {
		bucket.VibrationSum += float64(*vibrationRaw)
		bucket.VibrationCount++
	}

	if isRunning != nil {
		bucket.ACSamples++

		if *isRunning {
			bucket.RunningSamples++
		}

		value := *isRunning
		bucket.LastRunning = &value
	}

	bucket.SampleCount++

	return nil
}

func (s *Store) Run(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case <-ticker.C:
			if err := s.FlushClosedHours(ctx); err != nil {
				log.Printf(
					"failed to save hourly telemetry: %v",
					err,
				)
			}
		}
	}
}

func (s *Store) FlushClosedHours(ctx context.Context) error {
	cutoff := time.Now().UTC().Truncate(time.Hour)

	type pending struct {
		key    string
		bucket hourlyBucket
	}

	var items []pending

	s.mu.RLock()

	for key, bucket := range s.buckets {
		if bucket.Hour.Before(cutoff) {
			items = append(items, pending{
				key:    key,
				bucket: *bucket,
			})
		}
	}

	s.mu.RUnlock()

	for _, item := range items {
		if err := s.persistBucket(ctx, &item.bucket); err != nil {
			return err
		}

		s.mu.Lock()

		current, exists := s.buckets[item.key]

		if exists &&
			current.SampleCount == item.bucket.SampleCount {

			delete(s.buckets, item.key)
		}

		s.mu.Unlock()
	}

	return nil
}

func (s *Store) ensureNode(
	ctx context.Context,
	nodeID string,
	nodeType string,
) error {
	s.mu.RLock()
	known := s.known[nodeID]
	s.mu.RUnlock()

	if known {
		return nil
	}

	_, err := s.db.Exec(
		ctx,
		`
INSERT INTO sensor_nodes (
    node_id,
    node_type,
    name
)
VALUES ($1, $2, $1)
ON CONFLICT (node_id)
DO UPDATE SET
    node_type = EXCLUDED.node_type,
    is_active = TRUE,
    updated_at = NOW();
`,
		nodeID,
		nodeType,
	)

	if err != nil {
		return fmt.Errorf(
			"register sensor node %q: %w",
			nodeID,
			err,
		)
	}

	s.mu.Lock()
	s.known[nodeID] = true
	s.mu.Unlock()

	return nil
}

func (s *Store) bucketLocked(
	nodeID string,
	nodeType string,
	measuredAt time.Time,
) *hourlyBucket {
	hour := measuredAt.UTC().Truncate(time.Hour)
	key := bucketKey(nodeID, hour)

	if bucket, ok := s.buckets[key]; ok {
		return bucket
	}

	bucket := &hourlyBucket{
		NodeID:   nodeID,
		NodeType: nodeType,
		Hour:     hour,
	}

	s.buckets[key] = bucket

	return bucket
}

func (s *Store) persistBucket(
	ctx context.Context,
	bucket *hourlyBucket,
) error {
	var temperature any
	var light any
	var vibration any
	var running any
	var acOnMinutes any

	if bucket.TemperatureCount > 0 {
		temperature =
			bucket.TemperatureSum /
				float64(bucket.TemperatureCount)
	}

	if bucket.LightCount > 0 {
		light =
			bucket.LightSum /
				float64(bucket.LightCount)
	}

	if bucket.VibrationCount > 0 {
		vibration =
			bucket.VibrationSum /
				float64(bucket.VibrationCount)
	}

	if bucket.LastRunning != nil {
		running = *bucket.LastRunning
	}

	if bucket.ACSamples > 0 {
		acOnMinutes =
			60.0 *
				float64(bucket.RunningSamples) /
				float64(bucket.ACSamples)
	}

	_, err := s.db.Exec(
		ctx,
		`
INSERT INTO sensor_hourly_logs (
    node_id,
    temperature_c,
    light_lux,
    vibration_raw,
    is_running,
    ac_on_minutes,
    sample_count,
    recorded_at
)
VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
ON CONFLICT (
    node_id,
    recorded_at
)
DO UPDATE SET
    temperature_c = EXCLUDED.temperature_c,
    light_lux = EXCLUDED.light_lux,
    vibration_raw = EXCLUDED.vibration_raw,
    is_running = EXCLUDED.is_running,
    ac_on_minutes = EXCLUDED.ac_on_minutes,
    sample_count = EXCLUDED.sample_count;
`,
		bucket.NodeID,
		temperature,
		light,
		vibration,
		running,
		acOnMinutes,
		bucket.SampleCount,
		bucket.Hour,
	)

	return err
}

func bucketKey(
	nodeID string,
	hour time.Time,
) string {
	return fmt.Sprintf(
		"%s|%d",
		nodeID,
		hour.Unix(),
	)
}

func normalizeTime(value time.Time) time.Time {
	if value.IsZero() {
		return time.Now().UTC()
	}

	return value.UTC()
}
