package telemetry

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestDoorEvent(t *testing.T) {
	for direction, want := range map[string]int{"IN": 1, "in": 1, " Out ": -1} {
		if _, delta, err := doorEvent(direction); err != nil || delta != want {
			t.Errorf("doorEvent(%q) = %d, %v; want %d", direction, delta, err, want)
		}
	}

	if _, _, err := doorEvent("sideways"); err == nil {
		t.Error("unknown direction accepted")
	}
}

// Runs only against a throwaway database that has the migrations applied:
// TEST_DATABASE_URL=postgres://... go test ./internal/telemetry
func TestRecordDoorKeepsTheRoomCount(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}

	ctx := context.Background()

	db, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if _, err := db.Exec(ctx, "UPDATE room_occupancy SET current_count = 0"); err != nil {
		t.Fatal(err)
	}

	s := NewStore(db, time.Minute)

	// Leaving an empty room must not give a negative count.
	for _, step := range []struct {
		node, direction string
		want            int
	}{
		{"door_left", "OUT", 0},
		{"door_left", "IN", 1},
		{"door_right", "IN", 2},
		{"door_right", "OUT", 1},
	} {
		if err := s.RecordDoor(ctx, step.node, step.direction, time.Now()); err != nil {
			t.Fatal(err)
		}

		var count int
		if err := db.QueryRow(ctx, "SELECT current_count FROM room_occupancy").Scan(&count); err != nil {
			t.Fatal(err)
		}

		if count != step.want {
			t.Fatalf("after %s %s: count %d, want %d", step.node, step.direction, count, step.want)
		}
	}

	if err := s.RecordDoor(ctx, "door_unknown", "IN", time.Now()); err == nil {
		t.Error("unregistered door accepted")
	}
}
