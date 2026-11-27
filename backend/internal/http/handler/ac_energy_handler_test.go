package handler

import "testing"

func intp(v int) *int           { return &v }
func floatp(v float64) *float64 { return &v }

func TestParseHours(t *testing.T) {
	for value, want := range map[string]bool{"": true, "24": true, "168": true, "0": false, "-1": false, "abc": false, "99999": false} {
		if _, ok := parseHours(value); ok != want {
			t.Errorf("parseHours(%q) ok = %v, want %v", value, ok, want)
		}
	}
}

func TestEstimateNeedsSpecs(t *testing.T) {
	unit := acUnitEnergy{}
	estimate(&unit, 120, 2026)

	if unit.KWh != nil || unit.OnHours != 2 {
		t.Errorf("got kwh %v, hours %v", unit.KWh, unit.OnHours)
	}

	unit.acSpecs = acSpecs{CapacityBtuH: intp(18000), SEER: floatp(15)}
	estimate(&unit, 120, 2026)

	if unit.KWh == nil || *unit.KWh != 2.4 {
		t.Errorf("kwh = %v, want 2.4", unit.KWh)
	}
}

func TestValidateACSpecs(t *testing.T) {
	good := acSpecs{CapacityBtuH: intp(18000), SEER: floatp(15), InstalledYear: intp(2019)}
	if problem := validateACSpecs(good, 2026); problem != "" {
		t.Errorf("valid specs rejected: %s", problem)
	}

	// A Buddhist Era year typed by mistake.
	bad := good
	bad.InstalledYear = intp(2562)
	if validateACSpecs(bad, 2026) == "" {
		t.Error("year 2562 accepted")
	}

	bad = good
	bad.SEER = nil
	if validateACSpecs(bad, 2026) == "" {
		t.Error("missing SEER accepted")
	}
}
