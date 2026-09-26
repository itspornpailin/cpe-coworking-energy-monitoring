package domain

import "time"

// Session represents an authenticated admin session.
//
// The browser receives a cryptographically random token.
// PostgreSQL stores only the SHA-256 hash of that token.
//
// This means a database leak does not directly expose usable
// browser session tokens.
type Session struct {
	TokenHash []byte `json:"-"`

	UserID int64 `json:"userId"`

	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}

func (s Session) IsExpired(now time.Time) bool {
	return !now.Before(s.ExpiresAt)
}
