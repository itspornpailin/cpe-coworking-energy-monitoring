package telemetry

import (
	"context"
	"testing"
	"time"
)

func TestSmoothInterval(t *testing.T) {
	if got := smoothInterval(0, 10*time.Second); got != 10*time.Second {
		t.Errorf("first gap should be used as is, got %v", got)
	}

	if got := smoothInterval(10*time.Second, 20*time.Second); got != 13*time.Second {
		t.Errorf("0.7*10s + 0.3*20s = 13s, got %v", got)
	}

	// A node that was offline for hours must not inflate its normal interval.
	if got := smoothInterval(10*time.Second, 3*time.Hour); got != 10*time.Second {
		t.Errorf("long gap should be ignored, got %v", got)
	}

	if got := smoothInterval(10*time.Second, 0); got != 10*time.Second {
		t.Errorf("zero gap should be ignored, got %v", got)
	}
}

func TestStaleAfterFollowsTheNodesOwnRhythm(t *testing.T) {
	cases := []struct {
		name     string
		interval time.Duration
		want     time.Duration
	}{
		{"unknown interval uses the default", 0, defaultStaleAfter},
		{"3 missed messages", 20 * time.Second, 60 * time.Second},
		{"very chatty node still gets the minimum", time.Second, minStaleAfter},
		{"very slow node is capped", time.Hour, maxStaleAfter},
	}

	for _, c := range cases {
		if got := StaleAfter(LiveReading{Interval: c.interval}); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestIsStaleUsesArrivalTimeNotTheDeviceClock(t *testing.T) {
	now := time.Now()

	// The device clock says 1970, but we heard from it just now: not stale.
	fresh := LiveReading{
		UpdatedAt:  time.Unix(0, 0),
		ReceivedAt: now.Add(-5 * time.Second),
		Interval:   10 * time.Second,
	}

	if IsStale(fresh, now) {
		t.Error("a node heard from 5s ago must not be stale")
	}

	silent := LiveReading{
		ReceivedAt: now.Add(-2 * time.Minute),
		Interval:   10 * time.Second,
	}

	if !IsStale(silent, now) {
		t.Error("a 10s node silent for 2 minutes must be stale")
	}
}

func TestUpdateACMarksTheNodeAsHeardFrom(t *testing.T) {
	s := NewStore(nil, time.Minute)
	s.known["ac_01"] = true // already registered, so no database is needed

	running := true
	if err := s.UpdateAC(context.Background(), "ac_01", nil, &running, time.Now()); err != nil {
		t.Fatal(err)
	}

	reading, ok := s.Get("ac_01")
	if !ok || IsStale(reading, time.Now()) {
		t.Fatalf("fresh AC reading is stale: ok=%v, received %v", ok, reading.ReceivedAt)
	}
}
