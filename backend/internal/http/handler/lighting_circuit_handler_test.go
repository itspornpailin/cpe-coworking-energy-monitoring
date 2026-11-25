package handler

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestValidateCircuitUpdate(t *testing.T) {
	cases := []struct {
		name string
		req  updateCircuitRequest
		ok   bool
	}{
		{"thresholds with a gap", updateCircuitRequest{OnAboveLux: ptr(300), OffBelowLux: ptr(200)}, true},
		{"only one threshold", updateCircuitRequest{OnAboveLux: ptr(300)}, false},
		{"no gap between thresholds", updateCircuitRequest{OnAboveLux: ptr(200), OffBelowLux: ptr(200)}, false},
		{"on below off", updateCircuitRequest{OnAboveLux: ptr(100), OffBelowLux: ptr(200)}, false},
		{"negative off", updateCircuitRequest{OnAboveLux: ptr(100), OffBelowLux: ptr(-1)}, false},
		{"clear thresholds", updateCircuitRequest{ClearThresholds: true}, true},
		{"clear and set", updateCircuitRequest{ClearThresholds: true, OnAboveLux: ptr(300), OffBelowLux: ptr(200)}, false},
		{"power factor 0.9", updateCircuitRequest{PowerFactor: ptr(0.9)}, true},
		{"power factor above 1", updateCircuitRequest{PowerFactor: ptr(1.2)}, false},
		{"power factor zero", updateCircuitRequest{PowerFactor: ptr(0)}, false},
		{"rated load", updateCircuitRequest{RatedVA: ptr(1400)}, true},
		{"rated load zero", updateCircuitRequest{RatedVA: ptr(0)}, false},
	}

	for _, c := range cases {
		if got := validateCircuitUpdate(c.req) == ""; got != c.ok {
			t.Errorf("%s: valid = %v, want %v", c.name, got, c.ok)
		}
	}
}

func TestParseEnergyRange(t *testing.T) {
	now := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)

	from, to, problem := parseEnergyRange(httptest.NewRequest("GET", "/x", nil), now)
	if problem != "" || !to.Equal(now) || !from.Equal(now.Add(-24*time.Hour)) {
		t.Errorf("default range wrong: %v - %v (%q)", from, to, problem)
	}

	// The end of the range is never in the future.
	_, to, problem = parseEnergyRange(httptest.NewRequest("GET", "/x?to=2027-01-01T00:00:00Z", nil), now)
	if problem != "" || !to.Equal(now) {
		t.Errorf("future end must be cut to now, got %v (%q)", to, problem)
	}

	for _, query := range []string{
		"?from=2026-11-25T13:00:00Z",
		"?from=yesterday",
		"?from=2026-01-01T00:00:00Z",
	} {
		if _, _, problem := parseEnergyRange(httptest.NewRequest("GET", "/x"+query, nil), now); problem == "" {
			t.Errorf("%s should be rejected", query)
		}
	}
}
