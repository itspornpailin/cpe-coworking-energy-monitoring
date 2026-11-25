package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Averaging windows a caller may ask for. The window is chosen per request, so it
// can be changed at any time without touching the stored readings.
var historyBuckets = map[string]time.Duration{
	"1m":  time.Minute,
	"5m":  5 * time.Minute,
	"15m": 15 * time.Minute,
	"30m": 30 * time.Minute,
	"1h":  time.Hour,
	"6h":  6 * time.Hour,
	"1d":  24 * time.Hour,
}

const (
	defaultHistoryRange = 24 * time.Hour
	maxHistoryPoints    = 5000
)

type HistoryHandler struct {
	db *pgxpool.Pool
}

func NewHistoryHandler(db *pgxpool.Pool) *HistoryHandler {
	return &HistoryHandler{db: db}
}

type historyPoint struct {
	BucketStart time.Time `json:"bucketStart"`
	ZoneID      int64     `json:"zoneId"`

	AverageLux         *float64 `json:"averageLux"`
	AverageTemperature *float64 `json:"averageTemperature"`

	// NodeCount is how many nodes of the zone reported in this window.
	NodeCount int `json:"nodeCount"`
}

// parseHistoryRange reads ?from=&to=&bucket= (RFC 3339 times; default: the last 24 hours, 5m windows).
// It returns an error message for the client when something is wrong.
func parseHistoryRange(r *http.Request, now time.Time) (from, to time.Time, bucket time.Duration, problem string) {
	query := r.URL.Query()

	to = now
	if value := query.Get("to"); value != "" {
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil {
			return from, to, 0, "to must be an RFC 3339 time"
		}
		to = parsed
	}

	from = to.Add(-defaultHistoryRange)
	if value := query.Get("from"); value != "" {
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil {
			return from, to, 0, "from must be an RFC 3339 time"
		}
		from = parsed
	}

	if !from.Before(to) {
		return from, to, 0, "from must be before to"
	}

	name := query.Get("bucket")
	if name == "" {
		name = "5m"
	}

	bucket, ok := historyBuckets[name]
	if !ok {
		return from, to, 0, "bucket must be one of 1m, 5m, 15m, 30m, 1h, 6h, 1d"
	}

	if to.Sub(from)/bucket > maxHistoryPoints {
		return from, to, 0, "range is too long for this bucket (max " +
			strconv.Itoa(maxHistoryPoints) + " windows); use a larger bucket or a shorter range"
	}

	return from, to, bucket, ""
}

// List returns zone averages over time: for every window, each node's average is
// taken first and then the nodes of a zone are averaged, so a node that reports
// more often does not count for more.
//
// Zones are matched with the nodes' CURRENT assignments, so moving a node to
// another zone also changes how its past readings are grouped.
func (h *HistoryHandler) List(w http.ResponseWriter, r *http.Request) {
	from, to, bucket, problem := parseHistoryRange(r, time.Now())
	if problem != "" {
		writeLightingError(w, http.StatusBadRequest, problem)
		return
	}

	rows, err := h.db.Query(r.Context(), `
WITH per_node AS (
    SELECT
        date_bin(make_interval(secs => $1::double precision),
                 recorded_at,
                 TIMESTAMPTZ '2001-01-01 00:00:00+00') AS bucket,
        node_id,
        AVG(light_lux)      AS lux,
        AVG(temperature_c)  AS temperature
    FROM environment_readings
    WHERE recorded_at >= $2 AND recorded_at < $3
    GROUP BY 1, node_id
)
SELECT p.bucket, a.zone_id, AVG(p.lux), AVG(p.temperature), COUNT(*)
FROM per_node p
JOIN zone_sensor_assignments a ON a.node_id = p.node_id
GROUP BY 1, 2
ORDER BY 1, 2;`, bucket.Seconds(), from, to)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to load history")
		return
	}
	defer rows.Close()

	points := []historyPoint{}

	for rows.Next() {
		var p historyPoint

		if err := rows.Scan(&p.BucketStart, &p.ZoneID, &p.AverageLux, &p.AverageTemperature, &p.NodeCount); err != nil {
			writeLightingError(w, http.StatusInternalServerError, "unable to read history")
			return
		}

		points = append(points, p)
	}

	if err := rows.Err(); err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to read history")
		return
	}

	writeLightingJSON(w, http.StatusOK, points)
}
