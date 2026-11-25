package handler

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestParseHistoryRange(t *testing.T) {
	now := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)

	t.Run("defaults to the last 24 hours in 5 minute windows", func(t *testing.T) {
		from, to, bucket, problem := parseHistoryRange(httptest.NewRequest("GET", "/x", nil), now)

		if problem != "" || !to.Equal(now) || !from.Equal(now.Add(-24*time.Hour)) || bucket != 5*time.Minute {
			t.Errorf("got from=%v to=%v bucket=%v problem=%q", from, to, bucket, problem)
		}
	})

	bad := []struct{ name, query string }{
		{"unknown bucket", "?bucket=7m"},
		{"from after to", "?from=2026-11-25T10:00:00Z&to=2026-11-25T09:00:00Z"},
		{"not a time", "?from=yesterday"},
		{"too many windows", "?bucket=1m&from=2026-10-01T00:00:00Z"},
	}

	for _, c := range bad {
		t.Run(c.name, func(t *testing.T) {
			_, _, _, problem := parseHistoryRange(httptest.NewRequest("GET", "/x"+c.query, nil), now)

			if problem == "" {
				t.Error("expected a problem message")
			}
		})
	}

	t.Run("a month of hourly windows is allowed", func(t *testing.T) {
		_, _, bucket, problem := parseHistoryRange(
			httptest.NewRequest("GET", "/x?bucket=1h&from=2026-10-26T12:00:00Z", nil), now)

		if problem != "" || bucket != time.Hour {
			t.Errorf("bucket=%v problem=%q", bucket, problem)
		}
	})
}
