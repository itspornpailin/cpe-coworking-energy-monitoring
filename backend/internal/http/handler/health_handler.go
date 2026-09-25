package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type HealthHandler struct {
	startedAt time.Time
	db        *pgxpool.Pool
}

type healthResponse struct {
	Status    string         `json:"status"`
	Service   string         `json:"service"`
	Timestamp time.Time      `json:"timestamp"`
	Uptime    string         `json:"uptime"`
	Database  databaseHealth `json:"database"`
}

type databaseHealth struct {
	Status string `json:"status"`
}

func NewHealthHandler(
	startedAt time.Time,
	db *pgxpool.Pool,
) *HealthHandler {
	return &HealthHandler{
		startedAt: startedAt,
		db:        db,
	}
}

func (h *HealthHandler) Health(
	w http.ResponseWriter,
	r *http.Request,
) {
	ctx, cancel := context.WithTimeout(
		r.Context(),
		2*time.Second,
	)
	defer cancel()

	dbStatus := "connected"
	httpStatus := http.StatusOK
	serviceStatus := "ok"

	if err := h.db.Ping(ctx); err != nil {
		dbStatus = "unavailable"
		serviceStatus = "degraded"
		httpStatus = http.StatusServiceUnavailable
	}

	response := healthResponse{
		Status:    serviceStatus,
		Service:   "cpe-coworking-backend",
		Timestamp: time.Now(),
		Uptime:    time.Since(h.startedAt).Round(time.Second).String(),

		Database: databaseHealth{
			Status: dbStatus,
		},
	}

	w.Header().Set(
		"Content-Type",
		"application/json",
	)

	w.WriteHeader(httpStatus)

	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(
			w,
			`{"error":"failed to encode response"}`,
			http.StatusInternalServerError,
		)
	}
}
