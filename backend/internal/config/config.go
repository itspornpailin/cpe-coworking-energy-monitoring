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

	ReadTimeout       time.Duration
	ReadHeaderTimeout time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
	ShutdownTimeout   time.Duration
}

func Load() (Config, error) {
	_ = godotenv.Load(".env")
	_ = godotenv.Load("backend/.env")

	port, err := getIntEnv("SERVER_PORT", 8080)
	if err != nil {
		return Config{}, fmt.Errorf("invalid SERVER_PORT: %w", err)
	}

	if port < 1 || port > 65535 {
		return Config{}, fmt.Errorf(
			"SERVER_PORT must be between 1 and 65535",
		)
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}

	cfg := Config{
		AppEnv:         getEnv("APP_ENV", "development"),
		ServerPort:     port,
		FrontendOrigin: getEnv("FRONTEND_ORIGIN", "http://localhost:5173"),

		DatabaseURL: databaseURL,

		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		ShutdownTimeout:   10 * time.Second,
	}

	return cfg, nil
}

func (c Config) ServerAddress() string {
	return fmt.Sprintf(":%d", c.ServerPort)
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)

	if value == "" {
		return fallback
	}

	return value
}

func getIntEnv(key string, fallback int) (int, error) {
	value := os.Getenv(key)

	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, err
	}

	return parsed, nil
}
