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

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/telemetry"
)

type Subscriber struct {
	store *telemetry.Store

	client mqtt.Client

	envTopic string
	acTopic  string
}

type envPayload struct {
	NodeID string `json:"node_id"`

	TemperatureC *float64 `json:"temperature_c"`
	LightLux     *float64 `json:"light_lux"`

	// The current hardware payload contains humidity,
	// but it is intentionally not persisted because it
	// is outside the confirmed dashboard requirements.
	HumidityPercent *float64 `json:"humidity_percent"`

	Timestamp *time.Time `json:"timestamp"`
}

type acPayload struct {
	NodeID string `json:"node_id"`

	VibrationRaw *int  `json:"vibration_raw"`
	IsRunning    *bool `json:"is_running"`

	Timestamp *time.Time `json:"timestamp"`
}

func StartFromEnv(
	store *telemetry.Store,
) (*Subscriber, error) {
	enabled, err := envBool(
		"MQTT_ENABLED",
		false,
	)

	if err != nil {
		return nil, err
	}

	if !enabled {
		log.Println("MQTT ingestion disabled")
		return nil, nil
	}

	subscriber := &Subscriber{
		store: store,

		envTopic: envOr(
			"MQTT_ENV_TOPIC",
			"greenoffice/sensor/env/+",
		),

		acTopic: envOr(
			"MQTT_AC_TOPIC",
			"greenoffice/sensor/ac/+",
		),
	}

	brokerURL := envOr(
		"MQTT_BROKER_URL",
		"tcp://localhost:1883",
	)

	options := mqtt.NewClientOptions().
		AddBroker(brokerURL).
		SetClientID(
			envOr(
				"MQTT_CLIENT_ID",
				"cpe-web-backend",
			),
		).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(5 * time.Second)

	if username := strings.TrimSpace(
		os.Getenv("MQTT_USERNAME"),
	); username != "" {

		options.SetUsername(username)
		options.SetPassword(
			os.Getenv("MQTT_PASSWORD"),
		)
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
				subscriber.envTopic,
				subscriber.handleEnvironment,
			)

			subscriber.subscribe(
				client,
				subscriber.acTopic,
				subscriber.handleAC,
			)
		},
	)

	subscriber.client =
		mqtt.NewClient(options)

	token := subscriber.client.Connect()

	if !token.WaitTimeout(5 * time.Second) {
		log.Println(
			"MQTT is not available yet; retrying in background",
		)

		return subscriber, nil
	}

	if err := token.Error(); err != nil {
		log.Printf(
			"initial MQTT connection failed: %v; retrying in background",
			err,
		)
	}

	return subscriber, nil
}

func (s *Subscriber) Close() {
	if s == nil || s.client == nil {
		return
	}

	s.client.Disconnect(250)
}

func (s *Subscriber) subscribe(
	client mqtt.Client,
	topic string,
	handler mqtt.MessageHandler,
) {
	token := client.Subscribe(
		topic,
		1,
		handler,
	)

	token.Wait()

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

func (s *Subscriber) handleEnvironment(
	_ mqtt.Client,
	message mqtt.Message,
) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		5*time.Second,
	)
	defer cancel()

	var payload envPayload

	if err := json.Unmarshal(
		message.Payload(),
		&payload,
	); err != nil {

		log.Printf(
			"invalid environment payload: %v",
			err,
		)

		return
	}

	payload.NodeID =
		strings.TrimSpace(
			payload.NodeID,
		)

	if payload.NodeID == "" {
		payload.NodeID =
			topicSuffix(
				message.Topic(),
			)
	}

	if payload.TemperatureC != nil &&
		(!finite(*payload.TemperatureC) ||
			*payload.TemperatureC < -50 ||
			*payload.TemperatureC > 150) {

		log.Printf(
			"invalid temperature from %s",
			payload.NodeID,
		)

		return
	}

	if payload.LightLux != nil &&
		(!finite(*payload.LightLux) ||
			*payload.LightLux < 0) {

		log.Printf(
			"invalid Lux from %s",
			payload.NodeID,
		)

		return
	}

	if err := s.store.UpdateEnvironment(
		ctx,
		payload.NodeID,
		payload.TemperatureC,
		payload.LightLux,
		chooseTimestamp(
			payload.Timestamp,
		),
	); err != nil {

		log.Printf(
			"environment ingest failed: %v",
			err,
		)
	}
}

func (s *Subscriber) handleAC(
	_ mqtt.Client,
	message mqtt.Message,
) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		5*time.Second,
	)
	defer cancel()

	var payload acPayload

	if err := json.Unmarshal(
		message.Payload(),
		&payload,
	); err != nil {

		log.Printf(
			"invalid AC payload: %v",
			err,
		)

		return
	}

	payload.NodeID =
		canonicalACNodeID(
			payload.NodeID,
		)

	if payload.NodeID == "" {
		payload.NodeID =
			canonicalACNodeID(
				topicSuffix(
					message.Topic(),
				),
			)
	}

	if err := s.store.UpdateAC(
		ctx,
		payload.NodeID,
		payload.VibrationRaw,
		payload.IsRunning,
		chooseTimestamp(
			payload.Timestamp,
		),
	); err != nil {

		log.Printf(
			"AC ingest failed: %v",
			err,
		)
	}
}

func chooseTimestamp(
	value *time.Time,
) time.Time {
	if value == nil ||
		value.IsZero() {

		return time.Now().UTC()
	}

	return value.UTC()
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

	if strings.HasPrefix(
		value,
		"ac_unit_",
	) {
		return value
	}

	if strings.HasPrefix(
		value,
		"unit_",
	) {
		return "ac_" + value
	}

	if strings.HasPrefix(
		value,
		"ac_",
	) {
		suffix :=
			strings.TrimPrefix(
				value,
				"ac_",
			)

		return "ac_unit_" +
			suffix
	}

	return value
}

func topicSuffix(
	topic string,
) string {
	parts := strings.Split(
		strings.Trim(topic, "/"),
		"/",
	)

	if len(parts) == 0 {
		return ""
	}

	return parts[len(parts)-1]
}

func finite(value float64) bool {
	return !math.IsNaN(value) &&
		!math.IsInf(value, 0)
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
		strconv.ParseBool(value)

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
