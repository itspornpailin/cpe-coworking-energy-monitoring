package domain

import "time"

// UserRole identifies the authorization level of a user.
type UserRole string

const (
	// RoleGuest represents an unauthenticated visitor.
	//
	// Guests are not stored as User records in PostgreSQL.
	// The backend treats requests without a valid authenticated session
	// as guest requests.
	RoleGuest UserRole = "guest"

	// RoleAdmin represents an authenticated administrator.
	RoleAdmin UserRole = "admin"
)

// User represents an authenticated account stored in PostgreSQL.
//
// For the current project scope, only administrators require database accounts.
// Guests do not log in and therefore do not need User records.
//
// PasswordHash must never be returned through the API.
type User struct {
	ID int64 `json:"id"`

	Username string `json:"username"`

	// PasswordHash stores the secure hash of the user's password.
	//
	// json:"-" prevents the password hash from ever being serialized
	// into an API response accidentally.
	PasswordHash string `json:"-"`

	Role UserRole `json:"role"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
