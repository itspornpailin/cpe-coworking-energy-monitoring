package domain

import "time"

// SensorType identifies what a registered sensor measures or detects.
type SensorType string

const (
	SensorTypeTemperature SensorType = "temperature"
	SensorTypeIlluminance SensorType = "illuminance"
	SensorTypeHumidity    SensorType = "humidity"

	// People counters produce occupancy events rather than normal
	// environmental sensor readings.
	SensorTypePeopleCounter SensorType = "people_counter"
)

// SensorUnit identifies the unit associated with sensor measurements.
type SensorUnit string

const (
	SensorUnitCelsius   SensorUnit = "celsius"
	SensorUnitLux       SensorUnit = "lux"
	SensorUnitPercentRH SensorUnit = "percent_rh"
	SensorUnitPeople    SensorUnit = "people"
)

// Sensor represents one registered physical/logical sensor.
//
// The Code is the important identifier shared with the hardware team.
// The ESP32 should publish the same sensor ID through MQTT.
//
// Examples:
//
//	TEMP-01
//	LUX-11
//	DOOR-01
//
// AreaID is optional because sensors have not yet been installed and a
// portable sensor may temporarily have no assigned area.
//
// XMeters and YMeters are also optional until physical placement is known.
type Sensor struct {
	ID int64 `json:"id"`

	RoomID int64 `json:"roomId"`

	AreaID *int64 `json:"areaId"`

	Code string `json:"code"`
	Name string `json:"name"`

	Type SensorType `json:"type"`
	Unit SensorUnit `json:"unit"`

	XMeters *float64 `json:"xMeters"`
	YMeters *float64 `json:"yMeters"`

	IsActive bool `json:"isActive"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
