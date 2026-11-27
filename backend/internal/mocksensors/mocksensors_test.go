package mocksensors

import (
	"testing"
	"time"
)

func at(hour, minute int) time.Time {
	return time.Date(2026, 11, 25, hour, minute, 0, 0, time.Local)
}

func TestSampleStaysInRange(t *testing.T) {
	for _, n := range nodes {
		for h := 0; h < 24; h++ {
			lux, temp := Sample(n, at(h, 0))

			if lux < 0 {
				t.Errorf("%s at %02d:00: negative lux %v", n.ID, h, lux)
			}

			if temp < 20 || temp > 32 {
				t.Errorf("%s at %02d:00: implausible temperature %v", n.ID, h, temp)
			}
		}
	}
}

func TestLampsFollowOfficeHours(t *testing.T) {
	n := nodes[0]

	night, _ := Sample(n, at(2, 0))
	if night != 0 {
		t.Errorf("night lux should be 0, got %v", night)
	}

	before, _ := Sample(n, at(8, 0))
	after, _ := Sample(n, at(9, 0))
	if after-before < n.Lamp {
		t.Errorf("lamps should add at least %v lux after 08:30 (before %v, after %v)", n.Lamp, before, after)
	}
}

func TestNodesAreInsideTheDrawing(t *testing.T) {
	for _, n := range nodes {
		if n.X < 0 || n.X > 870 || n.Y < 0 || n.Y > 496 {
			t.Errorf("%s is outside the 870x496 drawing: (%v, %v)", n.ID, n.X, n.Y)
		}
	}
}
