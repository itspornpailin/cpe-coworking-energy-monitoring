package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/argon2"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/domain"
)

const SessionCookieName = "cpe_admin_session"

const (
	argonMemory       uint32 = 19 * 1024
	argonIterations   uint32 = 2
	argonParallelism  uint8  = 1
	argonSaltLength          = 16
	argonKeyLength    uint32 = 32
	sessionTokenBytes        = 32
)

var (
	ErrInvalidCredentials = errors.New(
		"invalid username or password",
	)

	ErrUnauthenticated = errors.New(
		"unauthenticated",
	)
)

type Service struct {
	db         *pgxpool.Pool
	sessionTTL time.Duration
}

type LoginResult struct {
	User      domain.User
	Token     string
	ExpiresAt time.Time
}

func NewService(
	db *pgxpool.Pool,
	sessionTTL time.Duration,
) *Service {
	return &Service{
		db:         db,
		sessionTTL: sessionTTL,
	}
}

func (s *Service) Login(
	ctx context.Context,
	username string,
	password string,
) (LoginResult, error) {
	username = strings.TrimSpace(username)

	if username == "" ||
		password == "" {

		return LoginResult{},
			ErrInvalidCredentials
	}

	var user domain.User

	err := s.db.QueryRow(
		ctx,
		`
			SELECT
				id,
				username,
				password_hash,
				role,
				created_at,
				updated_at
			FROM users
			WHERE LOWER(username) = LOWER($1)
		`,
		username,
	).Scan(
		&user.ID,
		&user.Username,
		&user.PasswordHash,
		&user.Role,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if errors.Is(
		err,
		pgx.ErrNoRows,
	) {
		/*
			Still perform expensive password work
			when the username does not exist.

			This reduces timing differences between:
			  - unknown username
			  - wrong password
		*/
		consumePasswordWork(password)

		return LoginResult{},
			ErrInvalidCredentials
	}

	if err != nil {
		return LoginResult{},
			fmt.Errorf(
				"find admin user: %w",
				err,
			)
	}

	valid, err :=
		VerifyPassword(
			user.PasswordHash,
			password,
		)

	if err != nil {
		return LoginResult{},
			fmt.Errorf(
				"verify password: %w",
				err,
			)
	}

	if !valid ||
		user.Role != domain.RoleAdmin {

		return LoginResult{},
			ErrInvalidCredentials
	}

	token,
		tokenHash,
		err := newSessionToken()

	if err != nil {
		return LoginResult{},
			fmt.Errorf(
				"create session token: %w",
				err,
			)
	}

	now := time.Now().UTC()

	expiresAt :=
		now.Add(
			s.sessionTTL,
		)

	_, err = s.db.Exec(
		ctx,
		`
			INSERT INTO sessions (
				token_hash,
				user_id,
				expires_at,
				created_at
			)
			VALUES ($1, $2, $3, $4)
		`,
		tokenHash,
		user.ID,
		expiresAt,
		now,
	)

	if err != nil {
		return LoginResult{},
			fmt.Errorf(
				"store session: %w",
				err,
			)
	}

	return LoginResult{
		User:      user,
		Token:     token,
		ExpiresAt: expiresAt,
	}, nil
}

func (s *Service) Authenticate(
	ctx context.Context,
	token string,
) (domain.User, error) {
	tokenHash, err :=
		sessionTokenHash(token)

	if err != nil {
		return domain.User{},
			ErrUnauthenticated
	}

	var user domain.User

	err = s.db.QueryRow(
		ctx,
		`
			SELECT
				u.id,
				u.username,
				u.password_hash,
				u.role,
				u.created_at,
				u.updated_at
			FROM sessions s
			JOIN users u
				ON u.id = s.user_id
			WHERE
				s.token_hash = $1
				AND s.expires_at > NOW()
		`,
		tokenHash,
	).Scan(
		&user.ID,
		&user.Username,
		&user.PasswordHash,
		&user.Role,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if errors.Is(
		err,
		pgx.ErrNoRows,
	) {
		return domain.User{},
			ErrUnauthenticated
	}

	if err != nil {
		return domain.User{},
			fmt.Errorf(
				"authenticate session: %w",
				err,
			)
	}

	return user, nil
}

func (s *Service) Logout(
	ctx context.Context,
	token string,
) error {
	tokenHash, err :=
		sessionTokenHash(token)

	/*
		An invalid token is already effectively
		logged out.
	*/
	if err != nil {
		return nil
	}

	_, err = s.db.Exec(
		ctx,
		`
			DELETE FROM sessions
			WHERE token_hash = $1
		`,
		tokenHash,
	)

	if err != nil {
		return fmt.Errorf(
			"delete session: %w",
			err,
		)
	}

	return nil
}

// HashPassword creates a new Argon2id password hash.
//
// Parameters follow OWASP's current minimum recommendation
// for Argon2id.
func HashPassword(
	password string,
) (string, error) {
	salt :=
		make(
			[]byte,
			argonSaltLength,
		)

	if _, err :=
		rand.Read(salt); err != nil {

		return "",
			fmt.Errorf(
				"generate password salt: %w",
				err,
			)
	}

	hash :=
		argon2.IDKey(
			[]byte(password),
			salt,
			argonIterations,
			argonMemory,
			argonParallelism,
			argonKeyLength,
		)

	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		argonMemory,
		argonIterations,
		argonParallelism,
		base64.RawStdEncoding.
			EncodeToString(salt),
		base64.RawStdEncoding.
			EncodeToString(hash),
	), nil
}

func VerifyPassword(
	encodedHash string,
	password string,
) (bool, error) {
	parts :=
		strings.Split(
			encodedHash,
			"$",
		)

	if len(parts) != 6 ||
		parts[1] != "argon2id" {

		return false,
			errors.New(
				"invalid password hash format",
			)
	}

	var version int

	if _, err :=
		fmt.Sscanf(
			parts[2],
			"v=%d",
			&version,
		); err != nil ||
		version != argon2.Version {

		return false,
			errors.New(
				"unsupported argon2 version",
			)
	}

	var memory uint32
	var iterations uint32
	var parallelism uint8

	if _, err :=
		fmt.Sscanf(
			parts[3],
			"m=%d,t=%d,p=%d",
			&memory,
			&iterations,
			&parallelism,
		); err != nil {

		return false,
			errors.New(
				"invalid argon2 parameters",
			)
	}

	if memory == 0 ||
		iterations == 0 ||
		parallelism == 0 ||
		memory > 256*1024 ||
		iterations > 10 ||
		parallelism > 8 {

		return false,
			errors.New(
				"unsafe argon2 parameters",
			)
	}

	salt, err :=
		base64.RawStdEncoding.
			DecodeString(
				parts[4],
			)

	if err != nil {
		return false,
			errors.New(
				"invalid password salt",
			)
	}

	expectedHash, err :=
		base64.RawStdEncoding.
			DecodeString(
				parts[5],
			)

	if err != nil ||
		len(expectedHash) < 16 ||
		len(expectedHash) > 64 {

		return false,
			errors.New(
				"invalid password hash",
			)
	}

	actualHash :=
		argon2.IDKey(
			[]byte(password),
			salt,
			iterations,
			memory,
			parallelism,
			uint32(
				len(expectedHash),
			),
		)

	return subtle.ConstantTimeCompare(
		actualHash,
		expectedHash,
	) == 1, nil
}

func consumePasswordWork(
	password string,
) {
	argon2.IDKey(
		[]byte(password),
		[]byte(
			"0123456789abcdef",
		),
		argonIterations,
		argonMemory,
		argonParallelism,
		argonKeyLength,
	)
}

func newSessionToken() (
	string,
	[]byte,
	error,
) {
	raw :=
		make(
			[]byte,
			sessionTokenBytes,
		)

	if _, err :=
		rand.Read(raw); err != nil {

		return "", nil, err
	}

	sum :=
		sha256.Sum256(raw)

	hash :=
		make(
			[]byte,
			len(sum),
		)

	copy(
		hash,
		sum[:],
	)

	return base64.
			RawURLEncoding.
			EncodeToString(raw),
		hash,
		nil
}

func sessionTokenHash(
	token string,
) ([]byte, error) {
	raw, err :=
		base64.
			RawURLEncoding.
			DecodeString(token)

	if err != nil ||
		len(raw) != sessionTokenBytes {

		return nil,
			errors.New(
				"invalid session token",
			)
	}

	sum :=
		sha256.Sum256(raw)

	hash :=
		make(
			[]byte,
			len(sum),
		)

	copy(
		hash,
		sum[:],
	)

	return hash, nil
}
