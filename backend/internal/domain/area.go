package domain

import "time"

// Area represents a logical monitoring zone inside a room.
//
// Several sensors can belong to the same area. Their latest readings can then
// be averaged before environmental rules are evaluated.
//
// Example:
//
//	LUX-11
//	LUX-12  -> Area A
//	LUX-13
type Area struct {
	ID     int64 `json:"id"`
	RoomID int64 `json:"roomId"`

	Code string `json:"code"`
	Name string `json:"name"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
