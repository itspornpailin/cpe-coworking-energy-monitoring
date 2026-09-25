package domain

import "time"

type Reading struct {
	ID         int64     `json:"id"`
	SensorID   int64     `json:"sensorId"`
	Value      float64   `json:"value"`
	MeasuredAt time.Time `json:"measuredAt"`
}
