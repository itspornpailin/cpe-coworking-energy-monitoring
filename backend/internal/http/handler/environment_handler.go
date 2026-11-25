package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/telemetry"
)

const liveReadingMaxAge = 5 * time.Minute

type EnvironmentHandler struct {
	db   *pgxpool.Pool
	live *telemetry.Store
}

type environmentZoneResponse struct {
	AreaID int64 `json:"areaId"`

	Code string `json:"code"`
	Name string `json:"name"`

	AverageLux         *float64 `json:"averageLux"`
	AverageTemperature *float64 `json:"averageTemperature"`

	MinLux float64 `json:"minLux"`

	LightingMode string `json:"lightingMode"`

	Warning bool `json:"warning"`
}

type environmentZoneState struct {
	response environmentZoneResponse

	luxSum   float64
	luxCount int

	tempSum   float64
	tempCount int
}

func NewEnvironmentHandler(
	db *pgxpool.Pool,
	live *telemetry.Store,
) *EnvironmentHandler {
	return &EnvironmentHandler{
		db:   db,
		live: live,
	}
}

func (h *EnvironmentHandler) List(
	w http.ResponseWriter,
	r *http.Request,
) {
	rows, err := h.db.Query(
		r.Context(),
		`
SELECT
    id,
    code,
    name,
    min_lux,
    threshold_enabled
FROM zones
ORDER BY code;
`,
	)

	if err != nil {
		writeLightingError(
			w,
			http.StatusInternalServerError,
			"unable to load zones",
		)

		return
	}

	defer rows.Close()

	var zones []*environmentZoneState

	byID :=
		make(
			map[int64]*environmentZoneState,
		)

	for rows.Next() {
		state :=
			&environmentZoneState{}

		var thresholdEnabled bool

		if err := rows.Scan(
			&state.response.AreaID,
			&state.response.Code,
			&state.response.Name,
			&state.response.MinLux,
			&thresholdEnabled,
		); err != nil {

			writeLightingError(
				w,
				http.StatusInternalServerError,
				"unable to read zone",
			)

			return
		}

		state.response.LightingMode =
			"dark_allowed"

		if thresholdEnabled {
			state.response.LightingMode =
				"bright_required"
		}

		zones = append(
			zones,
			state,
		)

		byID[state.response.AreaID] = state
	}

	assignmentRows, err :=
		h.db.Query(
			r.Context(),
			`
SELECT
    zone_id,
    node_id
FROM zone_sensor_assignments;
`,
		)

	if err != nil {
		writeLightingError(
			w,
			http.StatusInternalServerError,
			"unable to load zone assignments",
		)

		return
	}

	defer assignmentRows.Close()

	now := time.Now()

	for assignmentRows.Next() {
		var (
			zoneID int64
			nodeID string
		)

		if err := assignmentRows.Scan(
			&zoneID,
			&nodeID,
		); err != nil {

			continue
		}

		state :=
			byID[zoneID]

		if state == nil {
			continue
		}

		reading, ok :=
			h.live.Get(nodeID)

		if !ok ||
			now.Sub(
				reading.UpdatedAt,
			) > liveReadingMaxAge {

			continue
		}

		if reading.LightLux != nil {
			state.luxSum +=
				*reading.LightLux

			state.luxCount++
		}

		if reading.TemperatureC != nil {
			state.tempSum +=
				*reading.TemperatureC

			state.tempCount++
		}
	}

	result :=
		make(
			[]environmentZoneResponse,
			0,
			len(zones),
		)

	for _, state := range zones {

		if state.luxCount > 0 {
			value :=
				state.luxSum /
					float64(
						state.luxCount,
					)

			state.response.AverageLux =
				&value
		}

		if state.tempCount > 0 {
			value :=
				state.tempSum /
					float64(
						state.tempCount,
					)

			state.response.AverageTemperature =
				&value
		}

		state.response.Warning =
			state.response.LightingMode ==
				"bright_required" &&
				state.response.AverageLux != nil &&
				*state.response.AverageLux <
					state.response.MinLux

		result = append(
			result,
			state.response,
		)
	}

	writeLightingJSON(
		w,
		http.StatusOK,
		result,
	)
}

type zoneNameRequest struct {
	Name string `json:"name"`
}

// cleanZoneName trims the name and reports whether it is usable (1-60 characters).
func cleanZoneName(name string) (string, bool) {
	name = strings.TrimSpace(name)
	n := utf8.RuneCountInString(name)

	return name, n >= 1 && n <= 60
}

// Create adds an empty zone. Its code is generated, so admins only choose a name.
func (h *EnvironmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req zoneNameRequest
	if !decodeAdminJSON(w, r, &req) {
		return
	}

	name, ok := cleanZoneName(req.Name)
	if !ok {
		writeLightingError(w, http.StatusBadRequest, "zone name must be 1-60 characters")
		return
	}

	var id int64
	var code string

	// The code is built from the new id, so take the id from the sequence first.
	err := h.db.QueryRow(r.Context(), `
WITH next AS (
    SELECT nextval(pg_get_serial_sequence('zones', 'id')) AS id
)
INSERT INTO zones (id, code, name)
SELECT id, 'ZONE-' || id, $1 FROM next
RETURNING id, code;`, name).Scan(&id, &code)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to create zone")
		return
	}

	writeLightingJSON(w, http.StatusCreated, map[string]any{"areaId": id, "code": code, "name": name})
}

// Rename changes a zone's display name.
func (h *EnvironmentHandler) Rename(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "zoneID"), 10, 64)
	if err != nil || id <= 0 {
		writeLightingError(w, http.StatusBadRequest, "invalid zone id")
		return
	}

	var req zoneNameRequest
	if !decodeAdminJSON(w, r, &req) {
		return
	}

	name, ok := cleanZoneName(req.Name)
	if !ok {
		writeLightingError(w, http.StatusBadRequest, "zone name must be 1-60 characters")
		return
	}

	tag, err := h.db.Exec(r.Context(),
		`UPDATE zones SET name = $2, updated_at = NOW() WHERE id = $1`, id, name)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to rename zone")
		return
	}
	if tag.RowsAffected() == 0 {
		writeLightingError(w, http.StatusNotFound, "zone not found")
		return
	}

	writeLightingJSON(w, http.StatusOK, map[string]any{"areaId": id, "name": name})
}

// Delete removes a zone. Its nodes become unassigned (the assignments cascade).
func (h *EnvironmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "zoneID"), 10, 64)
	if err != nil || id <= 0 {
		writeLightingError(w, http.StatusBadRequest, "invalid zone id")
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM zones WHERE id = $1`, id)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to delete zone")
		return
	}
	if tag.RowsAffected() == 0 {
		writeLightingError(w, http.StatusNotFound, "zone not found")
		return
	}

	writeLightingJSON(w, http.StatusOK, map[string]any{"areaId": id})
}
