package lighting

import (
	"math"
	"testing"
	"time"
)

func f(v float64) *float64 { return &v }

var t0 = time.Date(2026, 11, 25, 8, 0, 0, 0, time.UTC)

func minutes(n int) time.Time { return t0.Add(time.Duration(n) * time.Minute) }

func TestObserveNeedsCalibrationAndData(t *testing.T) {
	r := newRuntime()

	if r.observe(t0, nil, f(300), f(200), 0) {
		t.Error("no data must leave the state unknown")
	}

	if r.observe(t0, f(500), nil, nil, 0) || r.state != Unknown {
		t.Error("an uncalibrated circuit must stay unknown")
	}
}

func TestObserveHasAGapBetweenThresholds(t *testing.T) {
	r := newRuntime()

	// Clearly bright, no confirmation time: ON.
	if !r.observe(t0, f(400), f(300), f(200), 0) || r.state != On {
		t.Fatalf("expected ON, got %q", r.state)
	}

	// 250 lx is inside the gap (200-300): an ON circuit stays ON.
	if r.observe(minutes(1), f(250), f(300), f(200), 0) || r.state != On {
		t.Error("inside the gap an ON circuit must stay ON")
	}

	// At or below the OFF threshold: OFF.
	if !r.observe(minutes(2), f(200), f(300), f(200), 0) || r.state != Off {
		t.Error("expected OFF at the off threshold")
	}

	// 250 lx again: an OFF circuit stays OFF until it reaches the ON threshold.
	if r.observe(minutes(3), f(250), f(300), f(200), 0) || r.state != Off {
		t.Error("inside the gap an OFF circuit must stay OFF")
	}
}

func TestUnknownStaysUnknownInsideTheGap(t *testing.T) {
	r := newRuntime()

	if r.observe(t0, f(250), f(300), f(200), 0) || r.state != Unknown {
		t.Error("a first reading inside the gap says nothing")
	}
}

func TestObserveIgnoresShortChanges(t *testing.T) {
	r := newRuntime()
	r.observe(t0, f(400), f(300), f(200), 0) // ON

	confirm := 60 * time.Second

	// A dip below the OFF threshold for 30 seconds (a cloud): still ON.
	r.observe(t0.Add(10*time.Second), f(100), f(300), f(200), confirm)

	if r.observe(t0.Add(40*time.Second), f(100), f(300), f(200), confirm) || r.state != On {
		t.Error("a 30 second dip must not switch the circuit OFF")
	}

	// The light comes back: the pending change is forgotten.
	r.observe(t0.Add(50*time.Second), f(400), f(300), f(200), confirm)

	// A new dip must start its own 60 seconds.
	r.observe(t0.Add(60*time.Second), f(100), f(300), f(200), confirm)

	if r.observe(t0.Add(100*time.Second), f(100), f(300), f(200), confirm) {
		t.Error("the earlier dip must not count towards the new one")
	}

	if !r.observe(t0.Add(121*time.Second), f(100), f(300), f(200), confirm) || r.state != Off {
		t.Error("60 seconds of darkness must switch the circuit OFF")
	}
}

func TestLosingDataIsActedOnAtOnce(t *testing.T) {
	r := newRuntime()
	r.observe(t0, f(400), f(300), f(200), 0)

	if !r.observe(t0.Add(time.Second), nil, f(300), f(200), time.Hour) || r.state != Unknown {
		t.Error("no data must make the state unknown immediately")
	}
}

func TestDurations(t *testing.T) {
	events := []Event{
		{On, minutes(-30)},     // already ON when the range starts
		{Off, minutes(30)},     // OFF from 30 to 60
		{On, minutes(60)},      // ON from 60 to 90
		{Unknown, minutes(90)}, // not known from 90 to 100
		{Off, minutes(100)},    // OFF from 100 on
	}

	on, known := Durations(events, minutes(0), minutes(120))

	if on != 60*time.Minute {
		t.Errorf("on = %v, want 1h (0-30 and 60-90)", on)
	}

	if known != 110*time.Minute {
		t.Errorf("known = %v, want 110m (everything except 90-100)", known)
	}
}

func TestDurationsWithoutEventsIsUnknown(t *testing.T) {
	on, known := Durations(nil, minutes(0), minutes(60))

	if on != 0 || known != 0 {
		t.Errorf("on=%v known=%v, want 0 and 0", on, known)
	}
}

func TestDurationsStopsAtTheEndOfTheRange(t *testing.T) {
	events := []Event{{On, minutes(0)}, {Off, minutes(500)}}

	on, _ := Durations(events, minutes(0), minutes(60))

	if on != time.Hour {
		t.Errorf("on = %v, want 1h (the later OFF is outside the range)", on)
	}
}

func TestKWh(t *testing.T) {
	// LP-5 is 1400 VA. Two hours at power factor 0.9: 1400 x 0.9 x 2 / 1000 = 2.52 kWh.
	if got := KWh(1400, 0.9, 2*time.Hour); math.Abs(got-2.52) > 1e-9 {
		t.Errorf("got %v, want 2.52", got)
	}
}
