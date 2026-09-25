package domain

import (
	"time"

	"github.com/google/uuid"
)

// Session represents an authenticated admin login session.
//
// After a successful login, the backend creates a random session ID and stores
// the session in PostgreSQL. The browser receives only the session ID through
// an HttpOnly cookie.
//
// The browser never receives the user's password or password hash.
type Session struct {
	// ID is a cryptographically random UUID used as the session identifier.
	ID uuid.UUID `json:"id"`

	// UserID identifies the authenticated user who owns this session.
	UserID int64 `json:"userId"`

	// ExpiresAt determines when the session is no longer valid.
	ExpiresAt time.Time `json:"expiresAt"`

	CreatedAt time.Time `json:"createdAt"`
}

// IsExpired reports whether the session has passed its expiration time.
//
// Keeping this logic on the domain model gives the authentication service
// one consistent way to determine session validity.
func (s Session) IsExpired(now time.Time) bool {
	return !now.Before(s.ExpiresAt)
}
