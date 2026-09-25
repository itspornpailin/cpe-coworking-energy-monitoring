package domain

import "time"

// Room represents a physical room monitored by the system.
//
// For this project, the initial room is the CPE Co-Working Space.
// WidthMeters and HeightMeters are pointers because the exact room dimensions
// may not be configured yet. A nil value means the dimension is currently unknown.
//
// Room coordinates will later be used by the frontend to position sensors
// correctly on the 2D SVG floorplan.
type Room struct {
	ID int64 `json:"id"`

	// Code is a stable machine-readable identifier used in API URLs.
	// Example: "cpe-coworking"
	Code string `json:"code"`

	// Name is the human-readable room name shown on the dashboard.
	// Example: "CPE Co-Working Space"
	Name string `json:"name"`

	// Physical room dimensions in metres.
	// These are optional until the room plan has been finalized.
	WidthMeters  *float64 `json:"widthMeters"`
	HeightMeters *float64 `json:"heightMeters"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
