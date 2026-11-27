// Package energy estimates the electricity an air conditioner uses from its rating
// and the time it was ON. These are estimates, not meter readings.
package energy

import "math"

// Share of efficiency an air conditioner loses each year, from the NREL Building
// America House Simulation Protocols (NREL/TP-550-49426), Equation 20 and Table 32.
const (
	lossServicedYearly = 0.01
	lossRarelyServiced = 0.03

	// The protocol applies the loss for at most 20 years.
	maxAgeYears = 20
)

// AgedSEER = SEER x (1 - M)^age.
func AgedSEER(seer float64, ageYears int, servicedYearly bool) float64 {
	loss := lossRarelyServiced
	if servicedYearly {
		loss = lossServicedYearly
	}

	age := min(max(ageYears, 0), maxAgeYears)

	return seer * math.Pow(1-loss, float64(age))
}

// PowerW is the average electrical draw while ON: cooling capacity (BTU/h)
// divided by SEER (BTU/h per W).
func PowerW(capacityBtuH, seer float64) float64 {
	return capacityBtuH / seer
}

// KWh is the energy used by a load of powerW that was ON for onMinutes.
func KWh(powerW, onMinutes float64) float64 {
	return powerW * onMinutes / 60 / 1000
}
