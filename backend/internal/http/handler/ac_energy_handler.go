package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/energy"
	"github.com/itspornpailin/cpe-coworking-energy-monitoring/backend/internal/telemetry"
)

const maxEnergyHours = 93 * 24

type ACEnergyHandler struct {
	db   *pgxpool.Pool
	live *telemetry.Store
}

func NewACEnergyHandler(db *pgxpool.Pool, live *telemetry.Store) *ACEnergyHandler {
	return &ACEnergyHandler{db: db, live: live}
}

type acSpecs struct {
	Brand string `json:"brand"`

	// Null until an admin has entered them.
	CapacityBtuH *int     `json:"capacityBtuH"`
	SEER         *float64 `json:"seer"`

	// Common Era year; null means no age correction.
	InstalledYear  *int `json:"installedYear"`
	ServicedYearly bool `json:"servicedYearly"`
}

type acUnitEnergy struct {
	NodeID string `json:"nodeId"`
	Name   string `json:"name"`

	acSpecs

	// Null when the node has not reported recently.
	Running *bool `json:"running"`

	OnHours     float64 `json:"onHours"`
	LoggedHours int     `json:"loggedHours"`

	// Both null until capacity and SEER are known.
	PowerW *float64 `json:"powerW"`
	KWh    *float64 `json:"kwh"`
}

type acEnergyResponse struct {
	Hours    int            `json:"hours"`
	TotalKWh float64        `json:"totalKwh"`
	Units    []acUnitEnergy `json:"units"`
}

// parseHours reads ?hours=. The default is the last 24 hours.
func parseHours(value string) (int, bool) {
	if value == "" {
		return 24, true
	}

	hours, err := strconv.Atoi(value)

	return hours, err == nil && hours >= 1 && hours <= maxEnergyHours
}

// estimate fills in the power and energy of a unit whose specs are known.
func estimate(unit *acUnitEnergy, onMinutes float64, year int) {
	unit.OnHours = onMinutes / 60

	if unit.CapacityBtuH == nil || unit.SEER == nil {
		return
	}

	seer := *unit.SEER
	if unit.InstalledYear != nil {
		seer = energy.AgedSEER(seer, year-*unit.InstalledYear, unit.ServicedYearly)
	}

	power := energy.PowerW(float64(*unit.CapacityBtuH), seer)
	kwh := energy.KWh(power, onMinutes)

	unit.PowerW = &power
	unit.KWh = &kwh
}

// Energy estimates what each air conditioner used in the last full hours:
// capacity / age-corrected SEER x the time it was ON.
func (h *ACEnergyHandler) Energy(w http.ResponseWriter, r *http.Request) {
	hours, ok := parseHours(r.URL.Query().Get("hours"))
	if !ok {
		writeLightingError(w, http.StatusBadRequest, "hours must be a whole number from 1 to 2232")
		return
	}

	now := time.Now()

	// shortcut: ON time is saved once per hour, so the running hour is not counted;
	// add the open bucket if the panel ever needs to be live.
	from := now.Truncate(time.Hour).Add(-time.Duration(hours) * time.Hour)

	rows, err := h.db.Query(r.Context(), `
SELECT n.node_id, COALESCE(NULLIF(n.name, ''), n.node_id),
       COALESCE(s.brand, ''), s.capacity_btu_h, s.seer, s.installed_year,
       COALESCE(s.serviced_yearly, TRUE),
       COALESCE(SUM(l.ac_on_minutes), 0), COUNT(l.ac_on_minutes)
FROM sensor_nodes n
LEFT JOIN ac_specs s ON s.node_id = n.node_id
LEFT JOIN sensor_hourly_logs l ON l.node_id = n.node_id AND l.recorded_at >= $1
WHERE n.node_type = 'ac' AND n.is_active
GROUP BY n.node_id, s.node_id
ORDER BY n.node_id;`, from)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to load air conditioners")
		return
	}
	defer rows.Close()

	result := acEnergyResponse{Hours: hours, Units: []acUnitEnergy{}}

	for rows.Next() {
		var (
			unit      acUnitEnergy
			onMinutes float64
		)

		if err := rows.Scan(
			&unit.NodeID, &unit.Name,
			&unit.Brand, &unit.CapacityBtuH, &unit.SEER, &unit.InstalledYear,
			&unit.ServicedYearly,
			&onMinutes, &unit.LoggedHours,
		); err != nil {
			writeLightingError(w, http.StatusInternalServerError, "unable to read air conditioner")
			return
		}

		if reading, found := h.live.Get(unit.NodeID); found && !telemetry.IsStale(reading, now) {
			unit.Running = reading.IsRunning
		}

		estimate(&unit, onMinutes, now.Year())

		if unit.KWh != nil {
			result.TotalKWh += *unit.KWh
		}

		result.Units = append(result.Units, unit)
	}

	if err := rows.Err(); err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to read air conditioners")
		return
	}

	writeLightingJSON(w, http.StatusOK, result)
}

// validateACSpecs returns what is wrong with the specs, or "".
func validateACSpecs(s acSpecs, year int) string {
	switch {
	case utf8.RuneCountInString(s.Brand) > 60:
		return "brand must be at most 60 characters"
	case s.CapacityBtuH == nil || *s.CapacityBtuH < 1000 || *s.CapacityBtuH > 200000:
		return "capacity must be from 1000 to 200000 BTU/h"
	case s.SEER == nil || *s.SEER < 1 || *s.SEER > 40:
		return "SEER must be from 1 to 40"
	case s.InstalledYear != nil && (*s.InstalledYear < 1980 || *s.InstalledYear > year):
		return "installed year must be a CE year from 1980 to this year"
	}

	return ""
}

// SetSpecs saves the rating of one air conditioner.
func (h *ACEnergyHandler) SetSpecs(w http.ResponseWriter, r *http.Request) {
	var specs acSpecs
	if !decodeAdminJSON(w, r, &specs) {
		return
	}

	specs.Brand = strings.TrimSpace(specs.Brand)

	if problem := validateACSpecs(specs, time.Now().Year()); problem != "" {
		writeLightingError(w, http.StatusBadRequest, problem)
		return
	}

	tag, err := h.db.Exec(r.Context(), `
INSERT INTO ac_specs (node_id, brand, capacity_btu_h, seer, installed_year, serviced_yearly)
SELECT node_id, $2, $3, $4, $5, $6
FROM sensor_nodes
WHERE node_id = $1 AND node_type = 'ac'
ON CONFLICT (node_id) DO UPDATE SET
    brand = EXCLUDED.brand,
    capacity_btu_h = EXCLUDED.capacity_btu_h,
    seer = EXCLUDED.seer,
    installed_year = EXCLUDED.installed_year,
    serviced_yearly = EXCLUDED.serviced_yearly,
    updated_at = NOW();`,
		chi.URLParam(r, "nodeID"),
		specs.Brand, specs.CapacityBtuH, specs.SEER, specs.InstalledYear, specs.ServicedYearly)
	if err != nil {
		writeLightingError(w, http.StatusInternalServerError, "unable to save air conditioner")
		return
	}
	if tag.RowsAffected() == 0 {
		writeLightingError(w, http.StatusNotFound, "air conditioner not found")
		return
	}

	writeLightingJSON(w, http.StatusOK, specs)
}
