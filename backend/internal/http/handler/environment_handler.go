package handler

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

type EnvironmentHandler struct {
	db *pgxpool.Pool
}

type environmentZoneResponse struct {
	AreaID int64 `json:"areaId"`

	Code string `json:"code"`
	Name string `json:"name"`

	AverageLux *float64 `json:"averageLux"`

	AverageTemperature *float64 `json:"averageTemperature"`

	MinLux float64 `json:"minLux"`

	LightingMode string `json:"lightingMode"`

	Warning bool `json:"warning"`
}

func NewEnvironmentHandler(
	db *pgxpool.Pool,
) *EnvironmentHandler {
	return &EnvironmentHandler{
		db: db,
	}
}

func (h *EnvironmentHandler) List(
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
    ORDER BY
        sr.sensor_id,
        sr.measured_at DESC
),
area_values AS (
    SELECT
        a.id,
        a.code,
        a.name,

        AVG(lr.value)
            FILTER (
                WHERE s.type = 'illuminance'
            )::DOUBLE PRECISION
            AS average_lux,

        AVG(lr.value)
            FILTER (
                WHERE s.type = 'temperature'
            )::DOUBLE PRECISION
            AS average_temperature

    FROM areas a

    LEFT JOIN sensors s
        ON s.area_id = a.id
        AND s.is_active = TRUE

    LEFT JOIN latest_readings lr
        ON lr.sensor_id = s.id

    GROUP BY
        a.id,
        a.code,
        a.name
)
SELECT
    av.id,
    av.code,
    av.name,

    av.average_lux,
    av.average_temperature,

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

FROM area_values av

LEFT JOIN area_rules ar
    ON ar.area_id = av.id
    AND ar.sensor_type = 'illuminance'

WHERE
    av.code LIKE 'ILL-%'
    OR ar.id IS NOT NULL
    OR EXISTS (
        SELECT 1
        FROM sensors sx
        WHERE
            sx.area_id = av.id
            AND sx.is_active = TRUE
            AND sx.type IN (
                'illuminance',
                'temperature'
            )
    )

ORDER BY av.code;
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
			"unable to load environment zones",
		)

		return
	}

	defer rows.Close()

	result :=
		make(
			[]environmentZoneResponse,
			0,
		)

	for rows.Next() {
		var (
			zone environmentZoneResponse

			isEnabled   bool
			notifyBelow bool
		)

		err :=
			rows.Scan(
				&zone.AreaID,
				&zone.Code,
				&zone.Name,
				&zone.AverageLux,
				&zone.AverageTemperature,
				&zone.MinLux,
				&isEnabled,
				&notifyBelow,
			)

		if err != nil {
			writeLightingError(
				w,
				http.StatusInternalServerError,
				"unable to read environment zone",
			)

			return
		}

		zone.LightingMode =
			"dark_allowed"

		if isEnabled &&
			notifyBelow {

			zone.LightingMode =
				"bright_required"
		}

		if zone.AverageLux != nil &&
			zone.LightingMode ==
				"bright_required" &&
			*zone.AverageLux <
				zone.MinLux {

			zone.Warning = true
		}

		result =
			append(
				result,
				zone,
			)
	}

	if err :=
		rows.Err(); err != nil {

		writeLightingError(
			w,
			http.StatusInternalServerError,
			"unable to finish reading environment zones",
		)

		return
	}

	writeLightingJSON(
		w,
		http.StatusOK,
		result,
	)
}
