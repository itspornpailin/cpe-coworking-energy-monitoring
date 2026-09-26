package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv         string
	ServerPort     int
	FrontendOrigin string

	DatabaseURL string

	SessionTTL   time.Duration
	CookieSecure bool

	ReadTimeout       time.Duration
	ReadHeaderTimeout time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
	ShutdownTimeout   time.Duration
}

func Load() (
	Config,
	error,
) {
	_ = godotenv.Load(".env")
	_ = godotenv.Load(
		"backend/.env",
	)

	port, err :=
		getIntEnv(
			"SERVER_PORT",
			8080,
		)

	if err != nil {
		return Config{},
			fmt.Errorf(
				"invalid SERVER_PORT: %w",
				err,
			)
	}

	if port < 1 ||
		port > 65535 {

		return Config{},
			fmt.Errorf(
				"SERVER_PORT must be between 1 and 65535",
			)
	}

	databaseURL :=
		os.Getenv(
			"DATABASE_URL",
		)

	if databaseURL == "" {
		return Config{},
			fmt.Errorf(
				"DATABASE_URL is required",
			)
	}

	sessionTTL, err :=
		getDurationEnv(
			"SESSION_TTL",
			8*time.Hour,
		)

	if err != nil {
		return Config{},
			fmt.Errorf(
				"invalid SESSION_TTL: %w",
				err,
			)
	}

	if sessionTTL <= 0 {
		return Config{},
			fmt.Errorf(
				"SESSION_TTL must be greater than zero",
			)
	}

	appEnv :=
		getEnv(
			"APP_ENV",
			"development",
		)

	return Config{
		AppEnv: appEnv,

		ServerPort: port,

		FrontendOrigin: getEnv(
			"FRONTEND_ORIGIN",
			"http://localhost:5173",
		),

		DatabaseURL: databaseURL,

		SessionTTL: sessionTTL,

		/*
			Local development uses HTTP,
			so Secure must be false.

			Production should use HTTPS,
			so Secure becomes true.
		*/
		CookieSecure: appEnv ==
			"production",

		ReadTimeout: 15 * time.Second,

		ReadHeaderTimeout: 5 * time.Second,

		WriteTimeout: 15 * time.Second,

		IdleTimeout: 60 * time.Second,

		ShutdownTimeout: 10 * time.Second,
	}, nil
}

func (c Config) ServerAddress() string {
	return fmt.Sprintf(
		":%d",
		c.ServerPort,
	)
}

func getEnv(
	key string,
	fallback string,
) string {
	value :=
		os.Getenv(key)

	if value == "" {
		return fallback
	}

	return value
}

func getIntEnv(
	key string,
	fallback int,
) (int, error) {
	value :=
		os.Getenv(key)

	if value == "" {
		return fallback, nil
	}

	return strconv.Atoi(value)
}

func getDurationEnv(
	key string,
	fallback time.Duration,
) (time.Duration, error) {
	value :=
		os.Getenv(key)

	if value == "" {
		return fallback, nil
	}

	return time.ParseDuration(
		value,
	)
}
