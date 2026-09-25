package domain

import "time"

// AreaRule controls when an environmental warning should be generated
// for one metric within one area.
//
// Thresholds are stored in PostgreSQL instead of being hardcoded so an
// administrator can change area behaviour without modifying firmware or Go.
//
// Examples:
//
// Bright-area rule:
//   MinValue = 500
//   NotifyBelow = true
//
// Dark-preferred rule:
//   MaxValue = 200
//   NotifyAbove = true
//
// No warning:
//   IsEnabled = false
type AreaRule struct {
	ID int64 `json:"id"`

	AreaID int64 `json:"areaId"`

	SensorType SensorType `json:"sensorType"`

	MinValue *float64 `json:"minValue"`
	MaxValue *float64 `json:"maxValue"`

	NotifyBelow bool `json:"notifyBelow"`
	NotifyAbove bool `json:"notifyAbove"`

	IsEnabled bool `json:"isEnabled"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
