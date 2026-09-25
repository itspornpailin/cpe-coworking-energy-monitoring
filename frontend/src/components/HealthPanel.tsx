import type { HealthResponse } from "../types/health";

import type { Language } from "../i18n/translations";

import { translations } from "../i18n/translations";

interface HealthPanelProps {
  language: Language;

  health: HealthResponse | null;
  error: string | null;
  loading: boolean;

  onRefresh: () => void;
}

export function HealthPanel({
  language,
  health,
  error,
  loading,
  onRefresh,
}: HealthPanelProps) {
  const copy =
    translations[language].health;

  const backendConnected =
    health?.status === "ok";

  const databaseConnected =
    health?.database.status ===
    "connected";

  return (
    <details className="health-panel">
      <summary>
        <div>
          <strong>
            {copy.title}
          </strong>

          <span>
            {copy.subtitle}
          </span>
        </div>

        <span
          className={
            backendConnected &&
            databaseConnected
              ? "health-summary-dot healthy"
              : "health-summary-dot unhealthy"
          }
        />
      </summary>

      <div className="health-content">
        {error !== null && (
          <div
            className="error-message"
            role="alert"
          >
            {
              copy.backendUnavailable
            }
          </div>
        )}

        <div className="health-row">
          <div>
            <span>
              {copy.backend}
            </span>

            <strong>
              {loading &&
              health === null
                ? copy.checking
                : backendConnected
                  ? copy.connected
                  : copy.unavailable}
            </strong>
          </div>

          <div>
            <span>
              {copy.database}
            </span>

            <strong>
              {loading &&
              health === null
                ? copy.checking
                : databaseConnected
                  ? copy.connected
                  : copy.unavailable}
            </strong>
          </div>

          <div>
            <span>
              {copy.uptime}
            </span>

            <strong>
              {health?.uptime ?? "—"}
            </strong>
          </div>

          <div>
            <span>
              {copy.timestamp}
            </span>

            <strong>
              {health
                ? new Date(
                    health.timestamp,
                  ).toLocaleString(
                    language === "th"
                      ? "th-TH"
                      : "en-US",
                  )
                : "—"}
            </strong>
          </div>
        </div>

        <button
          type="button"
          className="refresh-button"
          disabled={loading}
          onClick={onRefresh}
        >
          {loading
            ? copy.checking
            : copy.refresh}
        </button>
      </div>
    </details>
  );
}