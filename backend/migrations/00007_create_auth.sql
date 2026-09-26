-- +goose Up

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,

    username VARCHAR(64) NOT NULL,
    password_hash TEXT NOT NULL,

    role VARCHAR(20) NOT NULL DEFAULT 'admin',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        char_length(username) BETWEEN 3 AND 64
    ),

    CHECK (
        role = 'admin'
    )
);

-- Usernames are case-insensitive for login.
CREATE UNIQUE INDEX idx_users_username_lower
ON users (LOWER(username));


CREATE TABLE sessions (
    -- SHA-256 hash of the random session token.
    -- The raw token exists only in the browser cookie.
    token_hash BYTEA PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        octet_length(token_hash) = 32
    )
);

CREATE INDEX idx_sessions_user_id
ON sessions(user_id);

CREATE INDEX idx_sessions_expires_at
ON sessions(expires_at);


-- +goose Down

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;