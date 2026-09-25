package domain

import "time"

// OccupancyEventType identifies the result produced by the doorway
// people-counting system.
type OccupancyEventType string

const (
	OccupancyOneIn  OccupancyEventType = "one_in"
	OccupancyOneOut OccupancyEventType = "one_out"

	OccupancyTwoIn  OccupancyEventType = "two_in"
	OccupancyTwoOut OccupancyEventType = "two_out"

	OccupancyCrossing         OccupancyEventType = "crossing"
	OccupancyManualAdjustment OccupancyEventType = "manual_adjustment"
)

// OccupancyEvent represents a people-counting result received from
// the doorway edge device.
//
// Raw VL53L5CX depth frames should normally not be stored here.
// The edge device performs the classification and sends the resulting event.
type OccupancyEvent struct {
	ID int64 `json:"id"`

	SensorID int64 `json:"sensorId"`

	EventType OccupancyEventType `json:"eventType"`

	// +1, +2, -1, -2, etc.
	Delta int `json:"delta"`

	// Optional TinyML confidence score between 0 and 1.
	Confidence *float64 `json:"confidence"`

	MeasuredAt time.Time `json:"measuredAt"`
	ReceivedAt time.Time `json:"receivedAt"`
}
