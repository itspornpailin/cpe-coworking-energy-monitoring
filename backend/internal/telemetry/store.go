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

	UpdatedAt time.Time
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
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{
		db:      db,
		live:    make(map[string]LiveReading),
		buckets: make(map[string]*hourlyBucket),
		known:   make(map[string]bool),
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

	s.mu.Lock()
	defer s.mu.Unlock()

	live := s.live[nodeID]
	live.NodeID = nodeID
	live.UpdatedAt = measuredAt

	if temperatureC != nil {
		value := *temperatureC
		live.TemperatureC = &value
	}

	if lightLux != nil {
		value := *lightLux
		live.LightLux = &value
	}

	s.live[nodeID] = live

	bucket := s.bucketLocked(nodeID, "environment", measuredAt)

	if temperatureC != nil {
		bucket.TemperatureSum += *temperatureC
		bucket.TemperatureCount++
	}

	if lightLux != nil {
		bucket.LightSum += *lightLux
		bucket.LightCount++
	}

	bucket.SampleCount++

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
