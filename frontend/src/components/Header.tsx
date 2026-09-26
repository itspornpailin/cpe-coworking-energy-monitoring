import type {
  Language,
  Theme,
} from "../i18n/translations";

import {
  translations,
} from "../i18n/translations";

interface HeaderProps {
  language: Language;
  theme: Theme;

  role: "guest" | "admin";

  authLoading: boolean;

  onLanguageChange:
    (language: Language) => void;

  onThemeToggle: () => void;

  onLoginClick: () => void;

  onLogoutClick: () => void;
}

export function Header({
  language,
  theme,
  role,
  authLoading,
  onLanguageChange,
  onThemeToggle,
  onLoginClick,
  onLogoutClick,
}: HeaderProps) {
  const copy =
    translations[language];

  const isAdmin =
    role === "admin";

  const roleLabel =
    isAdmin
      ? copy.header.admin
      : copy.header.guest;

  return (
    <header className="app-header">
      <div className="brand">
        <h1>
          CPE Co-Working Space
        </h1>

        <p>
          {copy.header.subtitle}
        </p>
      </div>

      <div className="header-controls">
        <div
          className="language-toggle"
          aria-label={
            copy.header.languageLabel
          }
        >
          <button
            type="button"
            className={
              language === "th"
                ? "active"
                : ""
            }
            onClick={() =>
              onLanguageChange("th")
            }
          >
            TH
          </button>

          <button
            type="button"
            className={
              language === "en"
                ? "active"
                : ""
            }
            onClick={() =>
              onLanguageChange("en")
            }
          >
            EN
          </button>
        </div>

        <button
          type="button"
          className="theme-toggle"
          onClick={
            onThemeToggle
          }
          aria-label={
            theme === "day"
              ? copy.header.switchToNight
              : copy.header.switchToDay
          }
          title={
            theme === "day"
              ? copy.header.switchToNight
              : copy.header.switchToDay
          }
        >
          <span
            className="theme-toggle-icon"
            aria-hidden="true"
          >
            {theme === "day"
              ? "☀"
              : "☾"}
          </span>

          <span>
            {theme === "day"
              ? copy.header.dayMode
              : copy.header.nightMode}
          </span>
        </button>

        <div className="header-auth">
          <div
            className={
              isAdmin
                ? "role-badge admin"
                : "role-badge"
            }
          >
            {roleLabel}
          </div>

          {isAdmin ? (
            <button
              type="button"
              className="header-auth-button"
              disabled={
                authLoading
              }
              onClick={
                onLogoutClick
              }
            >
              {
                copy.header.logout
              }
            </button>
          ) : (
            <button
              type="button"
              className="header-auth-button"
              disabled={
                authLoading
              }
              onClick={
                onLoginClick
              }
            >
              {
                copy.header.login
              }
            </button>
          )}
        </div>
      </div>
    </header>
  );
}