// Package lighting works out whether each lighting circuit is ON or OFF from the lux its
// sensor nodes measure, remembers every change, and turns the ON time into an
// electricity estimate.
package lighting

import "time"

type State string

const (
	On      State = "on"
	Off     State = "off"
	Unknown State = "unknown"
)

// runtime is what the engine remembers about one circuit between checks.
type runtime struct {
	state State

	// A different state has been seen since pendingSince but not for long enough yet.
	pending      State
	pendingSince time.Time
}

func newRuntime() *runtime {
	return &runtime{state: Unknown}
}

// observe takes the circuit's latest average lux (nil when no node has recent data)
// and its two thresholds (nil when not calibrated), and reports whether the state changed.
//
// Two thresholds make a gap: a circuit that is OFF turns ON only at or above onAbove,
// and one that is ON turns OFF only at or below offBelow. A new state must also hold for
// confirmFor before it is accepted, so a passing cloud or a hand over a sensor is ignored.
// Losing the data (or the calibration) is acted on at once, because guessing would be worse.
func (r *runtime) observe(
	now time.Time,
	avgLux *float64,
	onAbove, offBelow *float64,
	confirmFor time.Duration,
) bool {
	target := Unknown

	if avgLux != nil && onAbove != nil && offBelow != nil {
		switch {
		case r.state == On && *avgLux <= *offBelow:
			target = Off
		case r.state == On:
			target = On
		case r.state == Off && *avgLux >= *onAbove:
			target = On
		case r.state == Off:
			target = Off
		// Unknown: only a clear reading tells us anything; the gap between the thresholds does not.
		case *avgLux >= *onAbove:
			target = On
		case *avgLux <= *offBelow:
			target = Off
		}
	}

	if target == r.state {
		r.pending = ""

		return false
	}

	if target == Unknown || confirmFor <= 0 {
		r.state = target
		r.pending = ""

		return true
	}

	if r.pending != target {
		r.pending = target
		r.pendingSince = now
	}

	if now.Sub(r.pendingSince) < confirmFor {
		return false
	}

	r.state = target
	r.pending = ""

	return true
}

// Event is one change of a circuit's state.
type Event struct {
	State State
	At    time.Time
}

// Durations adds up, between from and to, how long a circuit was ON and how long its
// state was known at all (ON or OFF). Events must be in time order. Events at or before
// `from` only set the starting state; before the first event the state is unknown.
func Durations(events []Event, from, to time.Time) (on, known time.Duration) {
	state := Unknown
	cursor := from

	add := func(until time.Time) {
		if !until.After(cursor) {
			return
		}

		d := until.Sub(cursor)

		switch state {
		case On:
			on += d
			known += d
		case Off:
			known += d
		}

		cursor = until
	}

	for _, event := range events {
		if event.At.After(to) || event.At.Equal(to) {
			break
		}

		if !event.At.After(from) {
			state = event.State

			continue
		}

		add(event.At)

		state = event.State
	}

	add(to)

	return on, known
}

// KWh is the estimated energy of a circuit that was ON for `on`.
// Rated VA is the connected load from the panelboard schedule; power factor converts it to watts.
func KWh(ratedVA, powerFactor float64, on time.Duration) float64 {
	return ratedVA * powerFactor * on.Hours() / 1000
}
