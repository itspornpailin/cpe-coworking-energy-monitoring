package main

// The API executable is the entry point of the backend application.
//
// Its responsibility is application startup and shutdown:
//   - load configuration
//   - connect to PostgreSQL
//   - construct the HTTP router
//   - start the HTTP server
//   - gracefully shut down resources
//
// Business logic should not be implemented in this file.

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/config"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/database"

	httpserver "github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/http"
)

func main() {
	startedAt := time.Now()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf(
			"failed to load configuration: %v",
			err,
		)
	}

	appContext := context.Background()

	db, err := database.Connect(
		appContext,
		cfg.DatabaseURL,
	)
	if err != nil {
		log.Fatalf(
			"failed to initialize database: %v",
			err,
		)
	}

	defer db.Close()

	log.Println(
		"successfully connected to PostgreSQL",
	)

	router := httpserver.NewRouter(
		cfg,
		startedAt,
		db,
	)

	server := &http.Server{
		Addr:              cfg.ServerAddress(),
		Handler:           router,
		ReadTimeout:       cfg.ReadTimeout,
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
	}

	shutdownContext, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer stop()

	serverErrors := make(chan error, 1)

	go func() {
		log.Printf(
			"CPE Co-Working Space backend running on http://localhost:%d",
			cfg.ServerPort,
		)

		err := server.ListenAndServe()

		if err != nil &&
			!errors.Is(err, http.ErrServerClosed) {

			serverErrors <- err
			return
		}

		serverErrors <- nil
	}()

	select {
	case err := <-serverErrors:
		if err != nil {
			log.Fatalf(
				"HTTP server failed: %v",
				err,
			)
		}

	case <-shutdownContext.Done():
		log.Println(
			"shutdown signal received",
		)
	}

	ctx, cancel := context.WithTimeout(
		context.Background(),
		cfg.ShutdownTimeout,
	)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf(
			"graceful shutdown failed: %v",
			err,
		)

		if closeErr := server.Close(); closeErr != nil {
			log.Printf(
				"forced server shutdown failed: %v",
				closeErr,
			)
		}
	}

	log.Println(
		"closing PostgreSQL connection pool",
	)

	log.Println(
		"server stopped",
	)
}
