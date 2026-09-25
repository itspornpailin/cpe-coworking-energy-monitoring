// Defines the TypeScript representation of the response returned by
// GET /api/v1/health.
//
// Keeping API response types separate helps the frontend detect mismatches
// if the backend contract changes later.

export interface DatabaseHealth {
  status: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
  uptime: string;
  database: DatabaseHealth;
}