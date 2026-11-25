package handler

import (
	"math"
	"strings"
	"testing"
)

func ptr(v float64) *float64 { return &v }

func TestValidPosition(t *testing.T) {
	cases := []struct {
		name string
		x, y *float64
		want bool
	}{
		{"both null removes the node", nil, nil, true},
		{"inside", ptr(90.5), ptr(172), true},
		{"corners are inside", ptr(0), ptr(planHeight), true},
		{"only x", ptr(10), nil, false},
		{"only y", nil, ptr(10), false},
		{"x too large", ptr(planWidth + 1), ptr(10), false},
		{"y negative", ptr(10), ptr(-0.1), false},
		{"NaN", ptr(math.NaN()), ptr(10), false},
	}

	for _, c := range cases {
		if got := validPosition(c.x, c.y); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestCleanZoneName(t *testing.T) {
	if name, ok := cleanZoneName("  Eating area "); !ok || name != "Eating area" {
		t.Errorf("trim failed: %q %v", name, ok)
	}

	if _, ok := cleanZoneName("   "); ok {
		t.Error("blank name must be rejected")
	}

	if _, ok := cleanZoneName(strings.Repeat("ก", 61)); ok {
		t.Error("61 characters must be rejected (counted as characters, not bytes)")
	}

	if _, ok := cleanZoneName(strings.Repeat("ก", 60)); !ok {
		t.Error("60 Thai characters must be accepted")
	}
}
