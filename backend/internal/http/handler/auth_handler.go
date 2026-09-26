package handler

import (
	"encoding/json"
	"errors"
	"mime"
	"net/http"
	"strings"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/auth"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/domain"
)

type AuthHandler struct {
	auth         *auth.Service
	cookieSecure bool
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authResponse struct {
	Authenticated bool            `json:"authenticated"`
	Role          domain.UserRole `json:"role"`
	User          *domain.User    `json:"user"`
}

func NewAuthHandler(
	authService *auth.Service,
	cookieSecure bool,
) *AuthHandler {
	return &AuthHandler{
		auth:         authService,
		cookieSecure: cookieSecure,
	}
}

func (h *AuthHandler) Login(
	w http.ResponseWriter,
	r *http.Request,
) {
	if !hasJSONContentType(r) {
		writeAuthError(
			w,
			http.StatusUnsupportedMediaType,
			"content type must be application/json",
		)

		return
	}

	r.Body =
		http.MaxBytesReader(
			w,
			r.Body,
			4096,
		)

	defer r.Body.Close()

	var request loginRequest

	decoder :=
		json.NewDecoder(r.Body)

	decoder.DisallowUnknownFields()

	if err :=
		decoder.Decode(
			&request,
		); err != nil {

		writeAuthError(
			w,
			http.StatusBadRequest,
			"invalid request body",
		)

		return
	}

	request.Username =
		strings.TrimSpace(
			request.Username,
		)

	if request.Username == "" ||
		request.Password == "" {

		writeAuthError(
			w,
			http.StatusBadRequest,
			"username and password are required",
		)

		return
	}

	result, err :=
		h.auth.Login(
			r.Context(),
			request.Username,
			request.Password,
		)

	if errors.Is(
		err,
		auth.ErrInvalidCredentials,
	) {
		/*
			Always return the same response for:
			  - wrong username
			  - wrong password

			This avoids user enumeration.
		*/
		writeAuthError(
			w,
			http.StatusUnauthorized,
			"invalid username or password",
		)

		return
	}

	if err != nil {
		writeAuthError(
			w,
			http.StatusInternalServerError,
			"authentication failed",
		)

		return
	}

	h.setSessionCookie(
		w,
		result.Token,
	)

	writeAuthJSON(
		w,
		http.StatusOK,
		authResponse{
			Authenticated: true,
			Role:          domain.RoleAdmin,
			User:          &result.User,
		},
	)
}

func (h *AuthHandler) Me(
	w http.ResponseWriter,
	r *http.Request,
) {
	cookie, err :=
		r.Cookie(
			auth.SessionCookieName,
		)

	if err != nil {
		writeAuthJSON(
			w,
			http.StatusOK,
			guestAuthResponse(),
		)

		return
	}

	user, err :=
		h.auth.Authenticate(
			r.Context(),
			cookie.Value,
		)

	if errors.Is(
		err,
		auth.ErrUnauthenticated,
	) {
		h.clearSessionCookie(w)

		writeAuthJSON(
			w,
			http.StatusOK,
			guestAuthResponse(),
		)

		return
	}

	if err != nil {
		writeAuthError(
			w,
			http.StatusInternalServerError,
			"unable to verify session",
		)

		return
	}

	writeAuthJSON(
		w,
		http.StatusOK,
		authResponse{
			Authenticated: true,
			Role:          user.Role,
			User:          &user,
		},
	)
}

func (h *AuthHandler) Logout(
	w http.ResponseWriter,
	r *http.Request,
) {
	if !hasJSONContentType(r) {
		writeAuthError(
			w,
			http.StatusUnsupportedMediaType,
			"content type must be application/json",
		)

		return
	}

	cookie, err :=
		r.Cookie(
			auth.SessionCookieName,
		)

	if err == nil {
		if logoutErr :=
			h.auth.Logout(
				r.Context(),
				cookie.Value,
			); logoutErr != nil {

			writeAuthError(
				w,
				http.StatusInternalServerError,
				"logout failed",
			)

			return
		}
	}

	h.clearSessionCookie(w)

	writeAuthJSON(
		w,
		http.StatusOK,
		guestAuthResponse(),
	)
}

func (h *AuthHandler) setSessionCookie(
	w http.ResponseWriter,
	token string,
) {
	http.SetCookie(
		w,
		&http.Cookie{
			Name: auth.SessionCookieName,

			Value: token,
			Path:  "/",

			HttpOnly: true,

			/*
				false during localhost development.
				true automatically when
				APP_ENV=production.
			*/
			Secure: h.cookieSecure,

			SameSite: http.SameSiteLaxMode,
		},
	)
}

func (h *AuthHandler) clearSessionCookie(
	w http.ResponseWriter,
) {
	http.SetCookie(
		w,
		&http.Cookie{
			Name: auth.SessionCookieName,

			Value: "",
			Path:  "/",

			HttpOnly: true,
			Secure:   h.cookieSecure,

			SameSite: http.SameSiteLaxMode,

			MaxAge: -1,
		},
	)
}

func guestAuthResponse() authResponse {
	return authResponse{
		Authenticated: false,
		Role:          domain.RoleGuest,
		User:          nil,
	}
}

func hasJSONContentType(
	r *http.Request,
) bool {
	mediaType,
		_,
		err :=
		mime.ParseMediaType(
			r.Header.Get(
				"Content-Type",
			),
		)

	return err == nil &&
		mediaType ==
			"application/json"
}

func writeAuthError(
	w http.ResponseWriter,
	status int,
	message string,
) {
	writeAuthJSON(
		w,
		status,
		map[string]string{
			"error": message,
		},
	)
}

func writeAuthJSON(
	w http.ResponseWriter,
	status int,
	payload any,
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
		Encode(payload)
}
