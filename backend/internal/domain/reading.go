package domain

import "time"

// Reading represents one numerical measurement from an environmental sensor.
//
// The Sensor record determines what Value means.
//
// Examples:
//
//	TEMP-01 -> 25.4 -> Celsius
//	LUX-11  -> 487  -> Lux
//
// measuredAt is when the hardware took the measurement.
// receivedAt is when the backend received/stored it.
type Reading struct {
	ID int64 `json:"id"`

	SensorID int64 `json:"sensorId"`

	Value float64 `json:"value"`

	MeasuredAt time.Time `json:"measuredAt"`
	ReceivedAt time.Time `json:"receivedAt"`
}
