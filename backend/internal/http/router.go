package httpserver

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/auth"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/config"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/http/handler"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/telemetry"

	appmiddleware "github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/http/middleware"
)

func NewRouter(
	cfg config.Config,
	startedAt time.Time,
	db *pgxpool.Pool,
	live *telemetry.Store,
) http.Handler {
	router := chi.NewRouter()

	router.Use(
		middleware.RequestID,
	)

	router.Use(
		middleware.RealIP,
	)

	router.Use(
		middleware.Logger,
	)

	router.Use(
		middleware.Recoverer,
	)

	router.Use(
		cors.Handler(
			cors.Options{
				AllowedOrigins: []string{
					cfg.FrontendOrigin,
				},

				AllowedMethods: []string{
					http.MethodGet,
					http.MethodPost,
					http.MethodPatch,
					http.MethodPut,
					http.MethodDelete,
					http.MethodOptions,
				},

				AllowedHeaders: []string{
					"Accept",
					"Authorization",
					"Content-Type",
				},

				AllowCredentials: true,

				MaxAge: 300,
			},
		),
	)

	healthHandler :=
		handler.NewHealthHandler(
			startedAt,
			db,
		)

	authService :=
		auth.NewService(
			db,
			cfg.SessionTTL,
		)

	authHandler :=
		handler.NewAuthHandler(
			authService,
			cfg.CookieSecure,
		)

	lightingHandler :=
		handler.NewLightingHandler(
			db,
			live,
		)

	environmentHandler :=
		handler.NewEnvironmentHandler(
			db,
			live,
		)

	nodeHandler :=
		handler.NewNodeHandler(
			db,
			live,
		)

	historyHandler :=
		handler.NewHistoryHandler(
			db,
		)

	lightingCircuitHandler :=
		handler.NewLightingCircuitHandler(
			db,
			live,
		)

	router.Route(
		"/api/v1",
		func(r chi.Router) {
			r.Get(
				"/health",
				healthHandler.Health,
			)

			r.Get(
				"/lighting-zones",
				lightingHandler.List,
			)

			r.Get(
				"/environment-zones",
				environmentHandler.List,
			)

			r.Get(
				"/environment-nodes",
				nodeHandler.List,
			)

			r.Get(
				"/environment-history",
				historyHandler.List,
			)

			r.Get(
				"/lighting-circuits",
				lightingCircuitHandler.List,
			)

			r.Get(
				"/lighting-energy",
				lightingCircuitHandler.Energy,
			)

			r.Route(
				"/auth",
				func(r chi.Router) {
					r.Post(
						"/login",
						authHandler.Login,
					)

					r.Post(
						"/logout",
						authHandler.Logout,
					)

					r.Get(
						"/me",
						authHandler.Me,
					)
				},
			)

			r.Group(
				func(admin chi.Router) {
					admin.Use(
						appmiddleware.RequireAdmin(
							authService,
						),
					)

					admin.Patch(
						"/admin/lighting-zones/{areaID}",
						lightingHandler.UpdateRule,
					)

					admin.Patch(
						"/admin/lighting-circuits/{circuitID}",
						lightingCircuitHandler.Update,
					)

					admin.Put(
						"/admin/lighting-circuits/{circuitID}/nodes",
						lightingCircuitHandler.SetNodes,
					)

					admin.Post(
						"/admin/zones",
						environmentHandler.Create,
					)

					admin.Patch(
						"/admin/zones/{zoneID}",
						environmentHandler.Rename,
					)

					admin.Delete(
						"/admin/zones/{zoneID}",
						environmentHandler.Delete,
					)

					admin.Put(
						"/admin/nodes/{nodeID}/zone",
						nodeHandler.SetZone,
					)

					admin.Put(
						"/admin/nodes/{nodeID}/position",
						nodeHandler.SetPosition,
					)
				},
			)
		},
	)

	return router
}
