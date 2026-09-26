package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/auth"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/domain"
)

type adminContextKey struct{}

func RequireAdmin(
	authService *auth.Service,
) func(http.Handler) http.Handler {
	return func(
		next http.Handler,
	) http.Handler {
		return http.HandlerFunc(
			func(
				w http.ResponseWriter,
				r *http.Request,
			) {
				cookie, err :=
					r.Cookie(
						auth.SessionCookieName,
					)

				if err != nil {
					writeAuthorizationError(
						w,
						http.StatusUnauthorized,
						"authentication required",
					)

					return
				}

				user, err :=
					authService.
						Authenticate(
							r.Context(),
							cookie.Value,
						)

				if errors.Is(
					err,
					auth.ErrUnauthenticated,
				) {
					writeAuthorizationError(
						w,
						http.StatusUnauthorized,
						"authentication required",
					)

					return
				}

				if err != nil {
					writeAuthorizationError(
						w,
						http.StatusInternalServerError,
						"unable to verify session",
					)

					return
				}

				if user.Role !=
					domain.RoleAdmin {

					writeAuthorizationError(
						w,
						http.StatusForbidden,
						"admin access required",
					)

					return
				}

				ctx :=
					context.WithValue(
						r.Context(),
						adminContextKey{},
						user,
					)

				next.ServeHTTP(
					w,
					r.WithContext(ctx),
				)
			},
		)
	}
}

func AdminFromContext(
	r *http.Request,
) (domain.User, bool) {
	user, ok :=
		r.Context().
			Value(
				adminContextKey{},
			).(domain.User)

	return user, ok
}

func writeAuthorizationError(
	w http.ResponseWriter,
	status int,
	message string,
) {
	w.Header().Set(
		"Content-Type",
		"application/json",
	)

	w.Header().Set(
		"Cache-Control",
		"no-store",
	)

	w.WriteHeader(status)

	_ = json.NewEncoder(w).
		Encode(
			map[string]string{
				"error": message,
			},
		)
}
