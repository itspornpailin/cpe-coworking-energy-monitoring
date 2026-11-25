package handler

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/lighting"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/telemetry"
)

const maxEnergyRange = 93 * 24 * time.Hour

type LightingCircuitHandler struct {
	db   *pgxpool.Pool
	live *telemetry.Store
}

func NewLightingCircuitHandler(db *pgxpool.Pool, live *telemetry.Store) *LightingCircuitHandler {
	return &LightingCircuitHandler{db: db, live: live}
}

type circuitResponse struct {
	ID   int64  `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`

	RatedVA     float64 `json:"ratedVa"`
	PowerFactor float64 `json:"powerFactor"`

	// Both null until the circuit has been calibrated.
	OnAboveLux  *float64 `json:"onAboveLux"`
	OffBelowLux *float64 `json:"offBelowLux"`

	NodeIDs []string `json:"nodeIds"`

	State      string     `json:"state"`
	StateSince *time.Time `json:"stateSince"`

	// Average lux of the circuit's nodes right now (null when none has recent data).
	AverageLux *float64 `json:"averageLux"`
}

// List returns every lighting circuit with its settings and current state.
func (h *LightingCircuitHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
SELECT c.id, c.code, c.name, c.rated_va, c.power_factor, c.on_above_lux, c.off_below_lux,
       COALESCE(array_agg(n.node_id ORDER BY n.node_id) FILTER (WHERE n.node_id IS NOT NULL), '{}'),
       COALESCE(last.state, 'unknown'), last.occurred_at
FROM lighting_circuits c
LEFT JOIN lighting_circuit_nodes n ON n.circuit_id = c.id
LEFT JOIN LATERAL (
    SELECT e.state, e.occurred_at
    FROM lighting_state_events e
    WHERE e.circuit_id = c.id
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT 1
) last ON TRUE
GROUP BY c.id, last.state, last.occurred_at
ORDER BY c.id;`)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to load lighting circuits")
		return
	}
	defer rows.Close()

	circuits := []circuitResponse{}
	now := time.Now()

	for rows.Next() {
		var c circuitResponse

		if err := rows.Scan(&c.ID, &c.Code, &c.Name, &c.RatedVA, &c.PowerFactor,
			&c.OnAboveLux, &c.OffBelowLux, &c.NodeIDs, &c.State, &c.StateSince); err != nil {
			writeLightingError(w, http.StatusInternalServerError, "unable to read lighting circuit")
			return
		}

		c.AverageLux = lighting.AverageLux(h.live, c.NodeIDs, now)

		circuits = append(circuits, c)
	}

	if err := rows.Err(); err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to read lighting circuits")
		return
	}

	writeLightingJSON(w, http.StatusOK, circuits)
}

type circuitEnergy struct {
	ID   int64  `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`

	RatedVA     float64 `json:"ratedVa"`
	PowerFactor float64 `json:"powerFactor"`

	OnMinutes    float64 `json:"onMinutes"`
	KnownMinutes float64 `json:"knownMinutes"`

	KWh float64 `json:"kwh"`
}

type energyResponse struct {
	From time.Time `json:"from"`
	To   time.Time `json:"to"`

	RangeMinutes float64 `json:"rangeMinutes"`

	// Always true: nothing is measured by a meter. The figures come from the circuits'
	// rated load and the time each circuit was seen ON.
	IsEstimate bool `json:"isEstimate"`

	TotalKWh float64 `json:"totalKwh"`

	Circuits []circuitEnergy `json:"circuits"`
}

// parseEnergyRange reads ?from=&to= (RFC 3339). The default is the last 24 hours.
// The end of the range is never later than now.
func parseEnergyRange(r *http.Request, now time.Time) (from, to time.Time, problem string) {
	query := r.URL.Query()

	to = now
	if value := query.Get("to"); value != "" {
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil {
			return from, to, "to must be an RFC 3339 time"
		}

		to = parsed
	}

	if to.After(now) {
		to = now
	}

	from = to.Add(-24 * time.Hour)
	if value := query.Get("from"); value != "" {
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil {
			return from, to, "from must be an RFC 3339 time"
		}

		from = parsed
	}

	if !from.Before(to) {
		return from, to, "from must be before to"
	}

	if to.Sub(from) > maxEnergyRange {
		return from, to, "range is too long (max 93 days)"
	}

	return from, to, ""
}

// Energy estimates the electricity used by the lighting circuits in a range:
// rated load x power factor x the time each circuit was ON.
func (h *LightingCircuitHandler) Energy(w http.ResponseWriter, r *http.Request) {
	from, to, problem := parseEnergyRange(r, time.Now())
	if problem != "" {
		writeLightingError(w, http.StatusBadRequest, problem)
		return
	}

	circuitRows, err := h.db.Query(r.Context(), `
SELECT id, code, name, rated_va, power_factor FROM lighting_circuits ORDER BY id;`)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to load lighting circuits")
		return
	}

	result := energyResponse{
		From:         from,
		To:           to,
		RangeMinutes: to.Sub(from).Minutes(),
		IsEstimate:   true,
		Circuits:     []circuitEnergy{},
	}

	for circuitRows.Next() {
		var c circuitEnergy

		if err := circuitRows.Scan(&c.ID, &c.Code, &c.Name, &c.RatedVA, &c.PowerFactor); err != nil {
			circuitRows.Close()
			writeLightingError(w, http.StatusInternalServerError, "unable to read lighting circuit")

			return
		}

		result.Circuits = append(result.Circuits, c)
	}

	circuitRows.Close()

	// The last event at or before `from` gives the starting state; the rest are inside the range.
	eventRows, err := h.db.Query(r.Context(), `
SELECT circuit_id, state, occurred_at FROM (
    SELECT DISTINCT ON (circuit_id) circuit_id, state, occurred_at
    FROM lighting_state_events
    WHERE occurred_at <= $1
    ORDER BY circuit_id, occurred_at DESC, id DESC
) before_range
UNION ALL
SELECT circuit_id, state, occurred_at
FROM lighting_state_events
WHERE occurred_at > $1 AND occurred_at < $2
ORDER BY circuit_id, occurred_at;`, from, to)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to load lighting history")
		return
	}
	defer eventRows.Close()

	events := map[int64][]lighting.Event{}

	for eventRows.Next() {
		var (
			circuitID int64
			state     string
			at        time.Time
		)

		if err := eventRows.Scan(&circuitID, &state, &at); err != nil {
			writeLightingError(w, http.StatusInternalServerError, "unable to read lighting history")
			return
		}

		events[circuitID] = append(events[circuitID], lighting.Event{State: lighting.State(state), At: at})
	}

	if err := eventRows.Err(); err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to read lighting history")
		return
	}

	for i := range result.Circuits {
		c := &result.Circuits[i]

		on, known := lighting.Durations(events[c.ID], from, to)

		c.OnMinutes = on.Minutes()
		c.KnownMinutes = known.Minutes()
		c.KWh = lighting.KWh(c.RatedVA, c.PowerFactor, on)

		result.TotalKWh += c.KWh
	}

	writeLightingJSON(w, http.StatusOK, result)
}

type updateCircuitRequest struct {
	RatedVA     *float64 `json:"ratedVa"`
	PowerFactor *float64 `json:"powerFactor"`

	// Set both together, or use ClearThresholds to make the circuit "not calibrated" again.
	OnAboveLux  *float64 `json:"onAboveLux"`
	OffBelowLux *float64 `json:"offBelowLux"`

	ClearThresholds bool `json:"clearThresholds"`
}

// validateCircuitUpdate checks an update and returns a message for the client when it is wrong.
func validateCircuitUpdate(req updateCircuitRequest) string {
	if req.RatedVA != nil && (*req.RatedVA <= 0 || *req.RatedVA > 100000) {
		return "ratedVa must be above 0 and at most 100000"
	}

	if req.PowerFactor != nil && (*req.PowerFactor <= 0 || *req.PowerFactor > 1) {
		return "powerFactor must be above 0 and at most 1"
	}

	if (req.OnAboveLux == nil) != (req.OffBelowLux == nil) {
		return "onAboveLux and offBelowLux must be set together"
	}

	if req.OnAboveLux != nil {
		if req.ClearThresholds {
			return "use either the thresholds or clearThresholds, not both"
		}

		if *req.OffBelowLux < 0 || *req.OnAboveLux <= *req.OffBelowLux || *req.OnAboveLux > 200000 {
			return "onAboveLux must be above offBelowLux, and offBelowLux must not be negative"
		}
	}

	return ""
}

// Update changes a circuit's rated load, power factor or ON/OFF thresholds.
func (h *LightingCircuitHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "circuitID"), 10, 64)
	if err != nil || id <= 0 {
		writeLightingError(w, http.StatusBadRequest, "invalid circuit id")
		return
	}

	var req updateCircuitRequest
	if !decodeAdminJSON(w, r, &req) {
		return
	}

	if problem := validateCircuitUpdate(req); problem != "" {
		writeLightingError(w, http.StatusBadRequest, problem)
		return
	}

	tag, err := h.db.Exec(r.Context(), `
UPDATE lighting_circuits
SET rated_va      = COALESCE($2, rated_va),
    power_factor  = COALESCE($3, power_factor),
    on_above_lux  = CASE WHEN $6 THEN NULL ELSE COALESCE($4, on_above_lux) END,
    off_below_lux = CASE WHEN $6 THEN NULL ELSE COALESCE($5, off_below_lux) END
WHERE id = $1;`, id, req.RatedVA, req.PowerFactor, req.OnAboveLux, req.OffBelowLux, req.ClearThresholds)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to update lighting circuit")
		return
	}

	if tag.RowsAffected() == 0 {
		writeLightingError(w, http.StatusNotFound, "lighting circuit not found")
		return
	}

	writeLightingJSON(w, http.StatusOK, map[string]any{"id": id})
}

type setCircuitNodesRequest struct {
	NodeIDs []string `json:"nodeIds"`
}

// SetNodes replaces the list of sensor nodes that show a circuit's state.
func (h *LightingCircuitHandler) SetNodes(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "circuitID"), 10, 64)
	if err != nil || id <= 0 {
		writeLightingError(w, http.StatusBadRequest, "invalid circuit id")
		return
	}

	var req setCircuitNodesRequest
	if !decodeAdminJSON(w, r, &req) {
		return
	}

	if len(req.NodeIDs) > 50 {
		writeLightingError(w, http.StatusBadRequest, "too many nodes")
		return
	}

	ctx := r.Context()

	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to update lighting circuit")
		return
	}
	defer tx.Rollback(ctx)

	var exists bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM lighting_circuits WHERE id = $1)`, id).Scan(&exists); err != nil || !exists {
		writeLightingError(w, http.StatusNotFound, "lighting circuit not found")
		return
	}

	if _, err := tx.Exec(ctx, `DELETE FROM lighting_circuit_nodes WHERE circuit_id = $1`, id); err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to update lighting circuit")
		return
	}

	for _, nodeID := range req.NodeIDs {
		_, err := tx.Exec(ctx, `
INSERT INTO lighting_circuit_nodes (circuit_id, node_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;`, id, nodeID)

		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" { // foreign key: no such node
			writeLightingError(w, http.StatusNotFound, "node not found: "+nodeID)
			return
		}

		if err != nil {
			writeLightingError(w, http.StatusInternalServerError, "unable to update lighting circuit")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to update lighting circuit")
		return
	}

	writeLightingJSON(w, http.StatusOK, map[string]any{"id": id, "nodeIds": req.NodeIDs})
}
