package main

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/auth"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/config"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/database"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/domain"
)

func main() {
	cfg, err :=
		config.Load()

	if err != nil {
		log.Fatalf(
			"failed to load configuration: %v",
			err,
		)
	}

	username :=
		strings.TrimSpace(
			os.Getenv(
				"ADMIN_USERNAME",
			),
		)

	password :=
		os.Getenv(
			"ADMIN_PASSWORD",
		)

	if len(username) < 3 ||
		len(username) > 64 {

		log.Fatal(
			"ADMIN_USERNAME must be between 3 and 64 characters",
		)
	}

	if password == "" {
		log.Fatal(
			"ADMIN_PASSWORD must not be empty",
		)
	}

	passwordHash, err :=
		auth.HashPassword(
			password,
		)

	if err != nil {
		log.Fatalf(
			"failed to hash password: %v",
			err,
		)
	}

	ctx :=
		context.Background()

	db, err :=
		database.Connect(
			ctx,
			cfg.DatabaseURL,
		)

	if err != nil {
		log.Fatalf(
			"failed to connect to PostgreSQL: %v",
			err,
		)
	}

	defer db.Close()

	var id int64

	err = db.QueryRow(
		ctx,
		`
			INSERT INTO users (
				username,
				password_hash,
				role
			)
			VALUES ($1, $2, $3)
			RETURNING id
		`,
		username,
		passwordHash,
		domain.RoleAdmin,
	).Scan(&id)

	if err != nil {
		log.Fatalf(
			"failed to create admin: %v",
			err,
		)
	}

	log.Printf(
		"admin created successfully: id=%d username=%q",
		id,
		username,
	)
}
