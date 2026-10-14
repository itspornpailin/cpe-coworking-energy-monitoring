package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/telemetry"
)

const (
	lightingModeBrightRequired = "bright_required"
	lightingModeDarkAllowed    = "dark_allowed"
)

type LightingHandler struct {
	db   *pgxpool.Pool
	live *telemetry.Store
}

type lightingZoneResponse struct {
	AreaID int64 `json:"areaId"`

	Code string `json:"code"`
	Name string `json:"name"`

	SensorCount int64 `json:"sensorCount"`

	AverageLux *float64   `json:"averageLux"`
	MeasuredAt *time.Time `json:"measuredAt"`

	MinLux float64 `json:"minLux"`

	Mode string `json:"mode"`

	Status string `json:"status"`

	Warning bool `json:"warning"`
}

type updateLightingRuleRequest struct {
	Mode   string   `json:"mode"`
	MinLux *float64 `json:"minLux"`
}

func NewLightingHandler(
	db *pgxpool.Pool,
	live *telemetry.Store,
) *LightingHandler {
	return &LightingHandler{
		db:   db,
		live: live,
	}
}

func (h *LightingHandler) List(
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
			"unable to load lighting zones",
		)

		return
	}

	defer rows.Close()

	zones :=
		make(
			[]lightingZoneResponse,
			0,
		)

	for rows.Next() {
		var (
			zone             lightingZoneResponse
			thresholdEnabled bool
		)

		if err := rows.Scan(
			&zone.AreaID,
			&zone.Code,
			&zone.Name,
			&zone.MinLux,
			&thresholdEnabled,
		); err != nil {

			writeLightingError(
				w,
				http.StatusInternalServerError,
				"unable to read lighting zone",
			)

			return
		}

		zone.Mode =
			lightingModeDarkAllowed

		if thresholdEnabled {
			zone.Mode =
				lightingModeBrightRequired
		}

		nodeRows, err :=
			h.db.Query(
				r.Context(),
				`
SELECT node_id
FROM zone_sensor_assignments
WHERE zone_id = $1;
`,
				zone.AreaID,
			)

		if err != nil {
			writeLightingError(
				w,
				http.StatusInternalServerError,
				"unable to load zone sensors",
			)

			return
		}

		var (
			luxSum   float64
			luxCount int64
			latest   *time.Time
		)

		for nodeRows.Next() {
			var nodeID string

			if err :=
				nodeRows.Scan(
					&nodeID,
				); err != nil {

				continue
			}

			zone.SensorCount++

			reading, ok :=
				h.live.Get(nodeID)

			if !ok ||
				time.Since(
					reading.UpdatedAt,
				) > liveReadingMaxAge ||
				reading.LightLux == nil {

				continue
			}

			luxSum +=
				*reading.LightLux

			luxCount++

			if latest == nil ||
				reading.UpdatedAt.After(
					*latest,
				) {

				value :=
					reading.UpdatedAt

				latest =
					&value
			}
		}

		nodeRows.Close()

		zone.MeasuredAt =
			latest

		zone.Status = "no_data"

		if luxCount > 0 {
			value :=
				luxSum /
					float64(luxCount)

			zone.AverageLux =
				&value

			zone.Status = "ok"

			if zone.Mode ==
				lightingModeBrightRequired &&
				value < zone.MinLux {

				zone.Status =
					"too_dark"

				zone.Warning =
					true
			}
		}

		zones = append(
			zones,
			zone,
		)
	}

	writeLightingJSON(
		w,
		http.StatusOK,
		zones,
	)
}

func (h *LightingHandler) UpdateRule(
	w http.ResponseWriter,
	r *http.Request,
) {
	if !hasJSONContentType(r) {
		writeLightingError(
			w,
			http.StatusUnsupportedMediaType,
			"content type must be application/json",
		)

		return
	}

	areaID, err :=
		strconv.ParseInt(
			chi.URLParam(
				r,
				"areaID",
			),
			10,
			64,
		)

	if err != nil ||
		areaID <= 0 {

		writeLightingError(
			w,
			http.StatusBadRequest,
			"invalid zone id",
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

	var request updateLightingRuleRequest

	decoder :=
		json.NewDecoder(
			r.Body,
		)

	decoder.DisallowUnknownFields()

	if err :=
		decoder.Decode(
			&request,
		); err != nil {

		writeLightingError(
			w,
			http.StatusBadRequest,
			"invalid request body",
		)

		return
	}

	request.Mode =
		strings.TrimSpace(
			request.Mode,
		)

	if request.Mode !=
		lightingModeBrightRequired &&
		request.Mode !=
			lightingModeDarkAllowed {

		writeLightingError(
			w,
			http.StatusBadRequest,
			"invalid lighting mode",
		)

		return
	}

	if request.Mode ==
		lightingModeBrightRequired &&
		request.MinLux == nil {

		writeLightingError(
			w,
			http.StatusBadRequest,
			"minLux is required",
		)

		return
	}

	if request.MinLux != nil &&
		(*request.MinLux <= 0 || *request.MinLux > 200000) {

		writeLightingError(
			w,
			http.StatusBadRequest,
			"invalid minLux",
		)

		return
	}

	enabled :=
		request.Mode ==
			lightingModeBrightRequired

	var minLux float64

	err =
		h.db.QueryRow(
			r.Context(),
			`
UPDATE zones
SET
    threshold_enabled = $2,

    min_lux =
        COALESCE(
            $3,
            min_lux
        ),

    updated_at = NOW()
WHERE id = $1
RETURNING min_lux;
`,
			areaID,
			enabled,
			request.MinLux,
		).Scan(
			&minLux,
		)

	if err != nil {
		writeLightingError(
			w,
			http.StatusNotFound,
			"zone not found",
		)

		return
	}

	writeLightingJSON(
		w,
		http.StatusOK,
		map[string]any{
			"areaId": areaID,
			"mode":   request.Mode,
			"minLux": minLux,
		},
	)
}

func writeLightingJSON(
	w http.ResponseWriter,
	status int,
	value any,
) {
	w.Header().Set(
		"Content-Type",
		"application/json",
	)

	w.WriteHeader(status)

	_ =
		json.NewEncoder(
			w,
		).Encode(value)
}

func writeLightingError(
	w http.ResponseWriter,
	status int,
	message string,
) {
	writeLightingJSON(
		w,
		status,
		map[string]string{
			"error": message,
		},
	)
}
