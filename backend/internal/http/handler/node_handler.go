package handler

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/telemetry"
)

// Size of the room drawing's coordinate space (its SVG viewBox).
const (
	planWidth  = 870.0
	planHeight = 496.0
)

type NodeHandler struct {
	db   *pgxpool.Pool
	live *telemetry.Store
}

func NewNodeHandler(db *pgxpool.Pool, live *telemetry.Store) *NodeHandler {
	return &NodeHandler{db: db, live: live}
}

type nodeResponse struct {
	NodeID string `json:"nodeId"`
	Name   string `json:"name"`

	X *float64 `json:"x"`
	Y *float64 `json:"y"`

	ZoneID   *int64  `json:"zoneId"`
	ZoneCode *string `json:"zoneCode"`

	LightLux     *float64   `json:"lightLux"`
	TemperatureC *float64   `json:"temperatureC"`
	UpdatedAt    *time.Time `json:"updatedAt"`

	// Stale is true when the node has not reported recently (or never).
	Stale bool `json:"stale"`
}

// List returns every environment node with its position, zone and latest reading.
func (h *NodeHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
SELECT n.node_id, n.name, n.x_pos, n.y_pos, z.id, z.code
FROM sensor_nodes n
LEFT JOIN zone_sensor_assignments a ON a.node_id = n.node_id
LEFT JOIN zones z ON z.id = a.zone_id
WHERE n.node_type = 'environment' AND n.is_active
ORDER BY n.node_id;`)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to load nodes")
		return
	}
	defer rows.Close()

	nodes := []nodeResponse{}
	now := time.Now()

	for rows.Next() {
		var n nodeResponse
		var name *string

		if err := rows.Scan(&n.NodeID, &name, &n.X, &n.Y, &n.ZoneID, &n.ZoneCode); err != nil {
			writeLightingError(w, http.StatusInternalServerError, "unable to read node")
			return
		}

		n.Name = n.NodeID
		if name != nil && *name != "" {
			n.Name = *name
		}

		n.Stale = true

		if reading, ok := h.live.Get(n.NodeID); ok {
			updated := reading.UpdatedAt
			n.UpdatedAt = &updated
			n.LightLux = reading.LightLux
			n.TemperatureC = reading.TemperatureC
			n.Stale = telemetry.IsStale(reading, now)
		}

		nodes = append(nodes, n)
	}

	if err := rows.Err(); err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to read nodes")
		return
	}

	writeLightingJSON(w, http.StatusOK, nodes)
}

type setNodeZoneRequest struct {
	// null removes the node from its zone.
	ZoneID *int64 `json:"zoneId"`
}

// SetZone moves a node to a zone, or removes it from every zone (zoneId = null).
func (h *NodeHandler) SetZone(w http.ResponseWriter, r *http.Request) {
	var req setNodeZoneRequest
	if !decodeAdminJSON(w, r, &req) {
		return
	}

	nodeID := chi.URLParam(r, "nodeID")
	ctx := r.Context()

	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to update node")
		return
	}
	defer tx.Rollback(ctx)

	var exists bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM sensor_nodes WHERE node_id = $1 AND node_type = 'environment')`,
		nodeID).Scan(&exists); err != nil || !exists {
		writeLightingError(w, http.StatusNotFound, "node not found")
		return
	}

	if _, err := tx.Exec(ctx,
		`DELETE FROM zone_sensor_assignments WHERE node_id = $1`, nodeID); err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to update node")
		return
	}

	if req.ZoneID != nil {
		_, err := tx.Exec(ctx,
			`INSERT INTO zone_sensor_assignments (zone_id, node_id) VALUES ($1, $2)`,
			*req.ZoneID, nodeID)

		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" { // foreign key: no such zone
			writeLightingError(w, http.StatusNotFound, "zone not found")
			return
		}
		if err != nil {
			writeLightingError(w, http.StatusInternalServerError, "unable to update node")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to update node")
		return
	}

	writeLightingJSON(w, http.StatusOK, map[string]any{"nodeId": nodeID, "zoneId": req.ZoneID})
}

type setNodePositionRequest struct {
	// Both null removes the node from the drawing.
	X *float64 `json:"x"`
	Y *float64 `json:"y"`
}

// validPosition reports whether x and y are either both unset or both inside the drawing.
func validPosition(x, y *float64) bool {
	if x == nil || y == nil {
		return x == nil && y == nil
	}

	return !math.IsNaN(*x) && !math.IsNaN(*y) &&
		*x >= 0 && *x <= planWidth &&
		*y >= 0 && *y <= planHeight
}

// SetPosition places a node on the room drawing.
func (h *NodeHandler) SetPosition(w http.ResponseWriter, r *http.Request) {
	var req setNodePositionRequest
	if !decodeAdminJSON(w, r, &req) {
		return
	}

	if !validPosition(req.X, req.Y) {
		writeLightingError(w, http.StatusBadRequest,
			"x and y must both be set inside the drawing (870 x 496) or both be null")
		return
	}

	nodeID := chi.URLParam(r, "nodeID")

	tag, err := h.db.Exec(r.Context(), `
UPDATE sensor_nodes
SET x_pos = $2, y_pos = $3, updated_at = NOW()
WHERE node_id = $1 AND node_type = 'environment';`,
		nodeID, req.X, req.Y)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to update node")
		return
	}
	if tag.RowsAffected() == 0 {
		writeLightingError(w, http.StatusNotFound, "node not found")
		return
	}

	writeLightingJSON(w, http.StatusOK, map[string]any{"nodeId": nodeID, "x": req.X, "y": req.Y})
}

// decodeAdminJSON reads a small JSON body into dst and writes the error response itself.
func decodeAdminJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if !hasJSONContentType(r) {
		writeLightingError(w, http.StatusUnsupportedMediaType, "content type must be application/json")
		return false
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	defer r.Body.Close()

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(dst); err != nil {
		writeLightingError(w, http.StatusBadRequest, "invalid request body")
		return false
	}

	return true
}
