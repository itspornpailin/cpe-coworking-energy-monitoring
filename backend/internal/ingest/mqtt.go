package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"strconv"
	"strings"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Subscriber struct {
	db     *pgxpool.Pool
	client mqtt.Client
}

type envPayload struct {
	NodeID          string     `json:"node_id"`
	TemperatureC    *float64   `json:"temperature_c"`
	HumidityPercent *float64   `json:"humidity_percent"`
	LightLux        *float64   `json:"light_lux"`
	Timestamp       *time.Time `json:"timestamp"`
}

type acPayload struct {
	NodeID       string     `json:"node_id"`
	IsRunning    *bool      `json:"is_running"`
	VibrationRaw *int       `json:"vibration_raw"`
	Timestamp    *time.Time `json:"timestamp"`
}

type doorPayload struct {
	NodeID       string     `json:"node_id"`
	Direction    string     `json:"direction"`
	CurrentCount *int       `json:"current_count"`
	Timestamp    *time.Time `json:"timestamp"`
}

func StartFromEnv(db *pgxpool.Pool) (*Subscriber, error) {
	enabled, err := envBool("MQTT_ENABLED", false)
	if err != nil {
		return nil, err
	}

	if !enabled {
		log.Println("MQTT ingestion disabled")
		return nil, nil
	}

	brokerURL := envOr(
		"MQTT_BROKER_URL",
		"tcp://localhost:1883",
	)

	clientID := envOr(
		"MQTT_CLIENT_ID",
		"cpe-web-backend",
	)

	subscriber := &Subscriber{
		db: db,
	}

	options := mqtt.NewClientOptions().
		AddBroker(brokerURL).
		SetClientID(clientID).
		SetAutoReconnect(true)

	if username := os.Getenv("MQTT_USERNAME"); username != "" {
		options.SetUsername(username)
		options.SetPassword(os.Getenv("MQTT_PASSWORD"))
	}

	options.SetConnectionLostHandler(
		func(_ mqtt.Client, err error) {
			log.Printf(
				"MQTT connection lost: %v",
				err,
			)
		},
	)

	options.SetOnConnectHandler(
		func(client mqtt.Client) {
			log.Printf(
				"MQTT connected to %s",
				brokerURL,
			)

			subscriber.subscribe(
				client,
				"greenoffice/sensor/env/+",
			)

			subscriber.subscribe(
				client,
				"greenoffice/sensor/ac/+",
			)

			subscriber.subscribe(
				client,
				"greenoffice/sensor/door/+",
			)
		},
	)

	subscriber.client =
		mqtt.NewClient(options)

	token :=
		subscriber.client.Connect()

	if !token.WaitTimeout(10 * time.Second) {
		return nil,
			fmt.Errorf(
				"MQTT connection timed out",
			)
	}

	if err := token.Error(); err != nil {
		return nil,
			fmt.Errorf(
				"MQTT connection failed: %w",
				err,
			)
	}

	return subscriber, nil
}

func (s *Subscriber) Close() {
	if s == nil ||
		s.client == nil {

		return
	}

	s.client.Disconnect(250)
}

func (s *Subscriber) subscribe(
	client mqtt.Client,
	topic string,
) {
	token :=
		client.Subscribe(
			topic,
			1,
			s.handleMessage,
		)

	if !token.WaitTimeout(
		5 * time.Second,
	) {
		log.Printf(
			"MQTT subscribe timed out: %s",
			topic,
		)

		return
	}

	if err := token.Error(); err != nil {
		log.Printf(
			"MQTT subscribe failed for %s: %v",
			topic,
			err,
		)

		return
	}

	log.Printf(
		"MQTT subscribed: %s",
		topic,
	)
}

func (s *Subscriber) handleMessage(
	_ mqtt.Client,
	message mqtt.Message,
) {
	ctx, cancel :=
		context.WithTimeout(
			context.Background(),
			5*time.Second,
		)
	defer cancel()

	topic :=
		message.Topic()

	var err error

	switch {
	case strings.HasPrefix(
		topic,
		"greenoffice/sensor/env/",
	):
		err = s.handleEnvironment(
			ctx,
			topic,
			message.Payload(),
		)

	case strings.HasPrefix(
		topic,
		"greenoffice/sensor/ac/",
	):
		err = s.handleAC(
			ctx,
			topic,
			message.Payload(),
		)

	case strings.HasPrefix(
		topic,
		"greenoffice/sensor/door/",
	):
		err = s.handleDoor(
			ctx,
			topic,
			message.Payload(),
		)

	default:
		return
	}

	if err != nil {
		log.Printf(
			"MQTT ingest error on %s: %v",
			topic,
			err,
		)
	}
}

func (s *Subscriber) handleEnvironment(
	ctx context.Context,
	topic string,
	raw []byte,
) error {
	var payload envPayload

	if err :=
		json.Unmarshal(
			raw,
			&payload,
		); err != nil {

		return fmt.Errorf(
			"invalid environment JSON: %w",
			err,
		)
	}

	payload.NodeID =
		canonicalEnvNodeID(
			payload.NodeID,
		)

	if payload.NodeID == "" {
		payload.NodeID =
			canonicalEnvNodeID(
				topicSuffix(topic),
			)
	}

	if payload.NodeID == "" ||
		payload.TemperatureC == nil ||
		payload.HumidityPercent == nil ||
		payload.LightLux == nil {

		return fmt.Errorf(
			"environment payload is missing required fields",
		)
	}

	if !finite(
		*payload.TemperatureC,
	) ||
		*payload.TemperatureC < -50 ||
		*payload.TemperatureC > 150 {

		return fmt.Errorf(
			"temperature_c is out of range",
		)
	}

	if !finite(
		*payload.HumidityPercent,
	) ||
		*payload.HumidityPercent < 0 ||
		*payload.HumidityPercent > 100 {

		return fmt.Errorf(
			"humidity_percent is out of range",
		)
	}

	if !finite(
		*payload.LightLux,
	) ||
		*payload.LightLux < 0 {

		return fmt.Errorf(
			"light_lux must be non-negative",
		)
	}

	receivedAt :=
		time.Now().UTC()

	measuredAt :=
		chooseTimestamp(
			payload.Timestamp,
			receivedAt,
		)

	tx, err :=
		s.db.Begin(ctx)

	if err != nil {
		return err
	}

	defer tx.Rollback(ctx)

	readings := []struct {
		sensorType string
		value      float64
	}{
		{
			"temperature",
			*payload.TemperatureC,
		},
		{
			"humidity",
			*payload.HumidityPercent,
		},
		{
			"illuminance",
			*payload.LightLux,
		},
	}

	for _, reading := range readings {

		var sensorID int64

		err :=
			tx.QueryRow(
				ctx,
				`
SELECT id
FROM sensors
WHERE source_node_id = $1
  AND type = $2
  AND is_active = TRUE;
`,
				payload.NodeID,
				reading.sensorType,
			).Scan(
				&sensorID,
			)

		if err != nil {
			if err ==
				pgx.ErrNoRows {

				return fmt.Errorf(
					"unregistered environment node %q for type %q",
					payload.NodeID,
					reading.sensorType,
				)
			}

			return err
		}

		_, err =
			tx.Exec(
				ctx,
				`
INSERT INTO sensor_readings (
    sensor_id,
    value,
    measured_at,
    received_at
)
VALUES ($1, $2, $3, $4);
`,
				sensorID,
				reading.value,
				measuredAt,
				receivedAt,
			)

		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (s *Subscriber) handleAC(
	ctx context.Context,
	topic string,
	raw []byte,
) error {
	var payload acPayload

	if err :=
		json.Unmarshal(
			raw,
			&payload,
		); err != nil {

		return fmt.Errorf(
			"invalid AC JSON: %w",
			err,
		)
	}

	payload.NodeID =
		canonicalACNodeID(
			payload.NodeID,
		)

	if payload.NodeID == "" {
		payload.NodeID =
			canonicalACNodeID(
				topicSuffix(topic),
			)
	}

	if payload.NodeID == "" ||
		payload.IsRunning == nil {

		return fmt.Errorf(
			"AC payload is missing required fields",
		)
	}

	receivedAt :=
		time.Now().UTC()

	measuredAt :=
		chooseTimestamp(
			payload.Timestamp,
			receivedAt,
		)

	var acUnitID int64

	err :=
		s.db.QueryRow(
			ctx,
			`
SELECT id
FROM ac_units
WHERE code = $1
  AND is_active = TRUE;
`,
			payload.NodeID,
		).Scan(
			&acUnitID,
		)

	if err != nil {
		if err ==
			pgx.ErrNoRows {

			return fmt.Errorf(
				"unregistered AC node %q",
				payload.NodeID,
			)
		}

		return err
	}

	_, err =
		s.db.Exec(
			ctx,
			`
INSERT INTO ac_status_events (
    ac_unit_id,
    is_running,
    vibration_raw,
    measured_at,
    received_at
)
VALUES ($1, $2, $3, $4, $5);
`,
			acUnitID,
			*payload.IsRunning,
			payload.VibrationRaw,
			measuredAt,
			receivedAt,
		)

	return err
}

func (s *Subscriber) handleDoor(
	ctx context.Context,
	topic string,
	raw []byte,
) error {
	var payload doorPayload

	if err :=
		json.Unmarshal(
			raw,
			&payload,
		); err != nil {

		return fmt.Errorf(
			"invalid door JSON: %w",
			err,
		)
	}

	payload.NodeID =
		canonicalDoorNodeID(
			payload.NodeID,
		)

	if payload.NodeID == "" {
		payload.NodeID =
			canonicalDoorNodeID(
				topicSuffix(topic),
			)
	}

	direction :=
		strings.ToUpper(
			strings.TrimSpace(
				payload.Direction,
			),
		)

	var (
		eventType string
		delta     int
	)

	switch direction {
	case "IN":
		eventType = "one_in"
		delta = 1

	case "OUT":
		eventType = "one_out"
		delta = -1

	default:
		return fmt.Errorf(
			"direction must be IN or OUT",
		)
	}

	receivedAt :=
		time.Now().UTC()

	measuredAt :=
		chooseTimestamp(
			payload.Timestamp,
			receivedAt,
		)

	tx, err :=
		s.db.Begin(ctx)

	if err != nil {
		return err
	}

	defer tx.Rollback(ctx)

	var (
		sensorID int64
		roomID   int64
	)

	err =
		tx.QueryRow(
			ctx,
			`
SELECT id, room_id
FROM sensors
WHERE source_node_id = $1
  AND type = 'people_counter'
  AND is_active = TRUE;
`,
			payload.NodeID,
		).Scan(
			&sensorID,
			&roomID,
		)

	if err != nil {
		if err ==
			pgx.ErrNoRows {

			return fmt.Errorf(
				"unregistered door node %q",
				payload.NodeID,
			)
		}

		return err
	}

	_, err =
		tx.Exec(
			ctx,
			`
INSERT INTO occupancy_events (
    sensor_id,
    event_type,
    delta,
    measured_at,
    received_at
)
VALUES ($1, $2, $3, $4, $5);
`,
			sensorID,
			eventType,
			delta,
			measuredAt,
			receivedAt,
		)

	if err != nil {
		return err
	}

	/*
		The hardware's current_count is deliberately ignored.

		door_left and door_right each maintain their own
		local counter, so neither value represents the
		room-wide occupancy.

		The backend is the authoritative room counter.
	*/
	_, err =
		tx.Exec(
			ctx,
			`
INSERT INTO room_occupancy (
    room_id,
    current_count,
    updated_at
)
VALUES (
    $1,
    GREATEST(0, $2),
    NOW()
)
ON CONFLICT (room_id)
DO UPDATE SET
    current_count =
        GREATEST(
            0,
            room_occupancy.current_count + $2
        ),
    updated_at = NOW();
`,
			roomID,
			delta,
		)

	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func canonicalEnvNodeID(
	value string,
) string {
	value =
		strings.ToLower(
			strings.TrimSpace(
				value,
			),
		)

	if strings.HasPrefix(
		value,
		"desk_",
	) {
		return "env_" + value
	}

	return value
}

func canonicalACNodeID(
	value string,
) string {
	value =
		strings.ToLower(
			strings.TrimSpace(
				value,
			),
		)

	switch {
	case strings.HasPrefix(
		value,
		"ac_unit_",
	):
		return value

	case strings.HasPrefix(
		value,
		"unit_",
	):
		return "ac_" + value

	case strings.HasPrefix(
		value,
		"ac_",
	):
		suffix :=
			strings.TrimPrefix(
				value,
				"ac_",
			)

		if !strings.HasPrefix(
			suffix,
			"unit_",
		) {
			return "ac_unit_" +
				suffix
		}
	}

	return value
}

func canonicalDoorNodeID(
	value string,
) string {
	value =
		strings.ToLower(
			strings.TrimSpace(
				value,
			),
		)

	if value == "left" ||
		value == "right" {

		return "door_" +
			value
	}

	return value
}

func topicSuffix(topic string) string {
	parts := strings.Split(strings.Trim(topic, "/"), "/")

	if len(parts) == 0 {
		return ""
	}

	return parts[len(parts)-1]
}

func chooseTimestamp(value *time.Time, fallback time.Time) time.Time {
	if value == nil || value.IsZero() {
		return fallback
	}

	return value.UTC()
}

func finite(
	value float64,
) bool {
	return !math.IsNaN(
		value,
	) &&
		!math.IsInf(
			value,
			0,
		)
}

func envOr(
	key string,
	fallback string,
) string {
	value :=
		strings.TrimSpace(
			os.Getenv(key),
		)

	if value == "" {
		return fallback
	}

	return value
}

func envBool(
	key string,
	fallback bool,
) (bool, error) {
	value :=
		strings.TrimSpace(
			os.Getenv(key),
		)

	if value == "" {
		return fallback, nil
	}

	result, err :=
		strconv.ParseBool(
			value,
		)

	if err != nil {
		return false,
			fmt.Errorf(
				"invalid %s: %w",
				key,
				err,
			)
	}

	return result, nil
}
