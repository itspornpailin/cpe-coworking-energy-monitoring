package httpserver

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/config"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/http/handler"
)

func NewRouter(
	cfg config.Config,
	startedAt time.Time,
	db *pgxpool.Pool,
) http.Handler {
	router := chi.NewRouter()

	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Logger)
	router.Use(middleware.Recoverer)

	router.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{
			cfg.FrontendOrigin,
		},

		AllowedMethods: []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodPatch,
			http.MethodDelete,
			http.MethodOptions,
		},

		AllowedHeaders: []string{
			"Accept",
			"Authorization",
			"Content-Type",
		},

		AllowCredentials: true,
		MaxAge:           300,
	}))

	healthHandler := handler.NewHealthHandler(
		startedAt,
		db,
	)

	router.Route("/api/v1", func(r chi.Router) {
		r.Get(
			"/health",
			healthHandler.Health,
		)
	})

	return router
}
