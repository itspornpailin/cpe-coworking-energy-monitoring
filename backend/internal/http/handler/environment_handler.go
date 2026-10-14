package handler

import (
	"net/http"
	"time"

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
