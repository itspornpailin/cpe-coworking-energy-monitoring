package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	lightingModeBrightRequired = "bright_required"
	lightingModeDarkAllowed    = "dark_allowed"
)

type LightingHandler struct {
	db *pgxpool.Pool
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
	Mode string `json:"mode"`

	MinLux *float64 `json:"minLux"`
}

func NewLightingHandler(
	db *pgxpool.Pool,
) *LightingHandler {
	return &LightingHandler{
		db: db,
	}
}

// List returns all illumination zones.
//
// The average is calculated using the newest reading
// currently available from every active illuminance sensor
// assigned to that area.
func (h *LightingHandler) List(
	w http.ResponseWriter,
	r *http.Request,
) {
	const query = `
WITH latest_readings AS (
    SELECT DISTINCT ON (sr.sensor_id)
        sr.sensor_id,
        sr.value,
        sr.measured_at
    FROM sensor_readings sr
    INNER JOIN sensors s
        ON s.id = sr.sensor_id
    WHERE
        s.type = 'illuminance'
        AND s.is_active = TRUE
    ORDER BY
        sr.sensor_id,
        sr.measured_at DESC
)
SELECT
    a.id,
    a.code,
    a.name,

    COUNT(s.id)::BIGINT AS sensor_count,

    AVG(lr.value)::DOUBLE PRECISION
        AS average_lux,

    MAX(lr.measured_at)
        AS measured_at,

    COALESCE(
        ar.min_value,
        500
    )::DOUBLE PRECISION
        AS min_lux,

    COALESCE(
        ar.is_enabled,
        FALSE
    ) AS is_enabled,

    COALESCE(
        ar.notify_below,
        FALSE
    ) AS notify_below

FROM areas a

LEFT JOIN sensors s
    ON s.area_id = a.id
    AND s.type = 'illuminance'
    AND s.is_active = TRUE

LEFT JOIN latest_readings lr
    ON lr.sensor_id = s.id

LEFT JOIN area_rules ar
    ON ar.area_id = a.id
    AND ar.sensor_type = 'illuminance'

WHERE
    a.code LIKE 'ILL-%'
    OR ar.id IS NOT NULL
    OR EXISTS (
        SELECT 1
        FROM sensors sx
        WHERE
            sx.area_id = a.id
            AND sx.type = 'illuminance'
    )

GROUP BY
    a.id,
    a.code,
    a.name,
    ar.min_value,
    ar.is_enabled,
    ar.notify_below

ORDER BY
    a.code;
`

	rows, err :=
		h.db.Query(
			r.Context(),
			query,
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
			areaID      int64
			code        string
			name        string
			sensorCount int64
			averageLux  *float64
			measuredAt  *time.Time
			minLux      float64
			isEnabled   bool
			notifyBelow bool
		)

		err :=
			rows.Scan(
				&areaID,
				&code,
				&name,
				&sensorCount,
				&averageLux,
				&measuredAt,
				&minLux,
				&isEnabled,
				&notifyBelow,
			)

		if err != nil {
			writeLightingError(
				w,
				http.StatusInternalServerError,
				"unable to read lighting zone",
			)

			return
		}

		mode :=
			lightingModeDarkAllowed

		if isEnabled &&
			notifyBelow {

			mode =
				lightingModeBrightRequired
		}

		status := "no_data"
		warning := false

		if averageLux != nil {
			status = "ok"

			if mode ==
				lightingModeBrightRequired &&
				*averageLux < minLux {

				status = "too_dark"
				warning = true
			}
		}

		zones =
			append(
				zones,
				lightingZoneResponse{
					AreaID:      areaID,
					Code:        code,
					Name:        name,
					SensorCount: sensorCount,
					AverageLux:  averageLux,
					MeasuredAt:  measuredAt,
					MinLux:      minLux,
					Mode:        mode,
					Status:      status,
					Warning:     warning,
				},
			)
	}

	if err := rows.Err(); err != nil {
		writeLightingError(
			w,
			http.StatusInternalServerError,
			"unable to finish reading lighting zones",
		)

		return
	}

	writeLightingJSON(
		w,
		http.StatusOK,
		zones,
	)
}

// UpdateRule changes the illumination policy for one area.
//
// bright_required:
//   - rule enabled
//   - warn when average lux is below minLux
//
// dark_allowed:
//   - illumination warning disabled
//   - lux can be high or low without generating a warning
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

	areaIDText :=
		chi.URLParam(
			r,
			"areaID",
		)

	areaID, err :=
		strconv.ParseInt(
			areaIDText,
			10,
			64,
		)

	if err != nil ||
		areaID <= 0 {

		writeLightingError(
			w,
			http.StatusBadRequest,
			"invalid area id",
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
			"mode must be bright_required or dark_allowed",
		)

		return
	}

	// Preserve a sensible value even while the
	// rule is disabled.
	minLux := 500.0

	if request.MinLux != nil {
		minLux =
			*request.MinLux
	}

	if request.Mode ==
		lightingModeBrightRequired &&
		request.MinLux == nil {

		writeLightingError(
			w,
			http.StatusBadRequest,
			"minLux is required for bright_required mode",
		)

		return
	}

	if minLux <= 0 ||
		minLux > 200000 {

		writeLightingError(
			w,
			http.StatusBadRequest,
			"minLux must be greater than 0 and at most 200000",
		)

		return
	}

	var areaExists bool

	err =
		h.db.QueryRow(
			r.Context(),
			`
SELECT EXISTS (
    SELECT 1
    FROM areas
    WHERE id = $1
);
`,
			areaID,
		).Scan(
			&areaExists,
		)

	if err != nil {
		writeLightingError(
			w,
			http.StatusInternalServerError,
			"unable to verify area",
		)

		return
	}

	if !areaExists {
		writeLightingError(
			w,
			http.StatusNotFound,
			"area not found",
		)

		return
	}

	isEnabled :=
		request.Mode ==
			lightingModeBrightRequired

	notifyBelow :=
		request.Mode ==
			lightingModeBrightRequired

	_, err =
		h.db.Exec(
			r.Context(),
			`
INSERT INTO area_rules (
    area_id,
    sensor_type,
    min_value,
    max_value,
    notify_below,
    notify_above,
    is_enabled
)
VALUES (
    $1,
    'illuminance',
    $2,
    NULL,
    $3,
    FALSE,
    $4
)
ON CONFLICT (
    area_id,
    sensor_type
)
DO UPDATE SET
    min_value =
        EXCLUDED.min_value,

    max_value =
        NULL,

    notify_below =
        EXCLUDED.notify_below,

    notify_above =
        FALSE,

    is_enabled =
        EXCLUDED.is_enabled,

    updated_at =
        NOW();
`,
			areaID,
			minLux,
			notifyBelow,
			isEnabled,
		)

	if err != nil {
		writeLightingError(
			w,
			http.StatusInternalServerError,
			"unable to update lighting rule",
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

	w.Header().Set(
		"Cache-Control",
		"no-store",
	)

	w.WriteHeader(status)

	_ = json.NewEncoder(w).
		Encode(value)
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
