package energy

import (
	"math"
	"testing"
)

func near(a, b float64) bool { return math.Abs(a-b) < 0.001 }

func TestAgedSEER(t *testing.T) {
	cases := []struct {
		age      int
		serviced bool
		want     float64
	}{
		{0, true, 15},
		{5, true, 14.2649},  // 15 x 0.99^5
		{5, false, 12.8810}, // 15 x 0.97^5
		{30, true, 12.2686}, // capped at 20 years
		{-1, true, 15},
	}

	for _, c := range cases {
		if got := AgedSEER(15, c.age, c.serviced); !near(got, c.want) {
			t.Errorf("AgedSEER(15, %d, %v) = %v, want %v", c.age, c.serviced, got, c.want)
		}
	}
}

func TestPowerAndEnergy(t *testing.T) {
	power := PowerW(18000, 15)
	if !near(power, 1200) {
		t.Fatalf("PowerW = %v, want 1200", power)
	}

	if got := KWh(power, 8*60); !near(got, 9.6) {
		t.Errorf("KWh = %v, want 9.6", got)
	}
}
