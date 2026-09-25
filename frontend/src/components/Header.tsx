import type {
  Language,
  Theme,
} from "../i18n/translations";

import { translations } from "../i18n/translations";

interface HeaderProps {
  language: Language;
  theme: Theme;

  role: "guest" | "admin";

  onLanguageChange:
    (language: Language) => void;

  onThemeToggle: () => void;
}

export function Header({
  language,
  theme,
  role,
  onLanguageChange,
  onThemeToggle,
}: HeaderProps) {
  const copy =
    translations[language];

  const roleLabel =
    role === "admin"
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
          onClick={onThemeToggle}
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
          {theme === "day"
            ? "☾"
            : "☀"}
        </button>

        <div className="role-badge">
          {roleLabel}
        </div>
      </div>
    </header>
  );
}