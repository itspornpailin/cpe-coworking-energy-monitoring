import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { getHealth } from "./api/health";

import { Header } from "./components/Header";
import { HealthPanel } from "./components/HealthPanel";
import { RoomPlanPanel } from "./components/RoomPlanPanel";

import type { HealthResponse } from "./types/health";

import type {
  Language,
  Theme,
} from "./i18n/translations";

function getInitialLanguage(): Language {
  const savedLanguage =
    window.localStorage.getItem(
      "cpe-language",
    );

  return savedLanguage === "th"
    ? "th"
    : "en";
}

function getInitialTheme(): Theme {
  const savedTheme =
    window.localStorage.getItem(
      "cpe-theme",
    );

  return savedTheme === "night"
    ? "night"
    : "day";
}

function App() {
  const [language, setLanguage] =
    useState<Language>(
      getInitialLanguage,
    );

  const [theme, setTheme] =
    useState<Theme>(
      getInitialTheme,
    );

  const [health, setHealth] =
    useState<HealthResponse | null>(
      null,
    );

  const [healthError, setHealthError] =
    useState<string | null>(null);

  const [healthLoading, setHealthLoading] =
    useState(true);

  /*
    Synchronize UI preferences with
    the browser.

    These effects modify external browser
    state rather than React component state,
    which is exactly what useEffect is for.
  */
  useEffect(() => {
    document.documentElement.dataset.theme =
      theme;

    window.localStorage.setItem(
      "cpe-theme",
      theme,
    );
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang =
      language;

    window.localStorage.setItem(
      "cpe-language",
      language,
    );
  }, [language]);

  const loadHealth =
    useCallback(
      async (
        signal?: AbortSignal,
      ) => {
        try {
          const result =
            await getHealth(signal);

          setHealth(result);
          setHealthError(null);
        } catch (requestError) {
          if (
            requestError instanceof
              DOMException &&
            requestError.name ===
              "AbortError"
          ) {
            return;
          }

          setHealth(null);

          if (
            requestError instanceof
            Error
          ) {
            setHealthError(
              requestError.message,
            );
          } else {
            setHealthError(
              "Unable to connect to backend.",
            );
          }
        } finally {
          setHealthLoading(false);
        }
      },
      [],
    );

  useEffect(() => {
    const controller =
      new AbortController();

    /*
      Schedule the first request instead of
      executing a state-updating function
      synchronously inside the effect body.

      This also satisfies:
      react-hooks/set-state-in-effect
    */
    const initialRequestId =
      window.setTimeout(() => {
        void loadHealth(
          controller.signal,
        );
      }, 0);

    const intervalId =
      window.setInterval(() => {
        void loadHealth(
          controller.signal,
        );
      }, 10_000);

    return () => {
      window.clearTimeout(
        initialRequestId,
      );

      window.clearInterval(
        intervalId,
      );

      controller.abort();
    };
  }, [loadHealth]);

  const handleHealthRefresh =
    async () => {
      setHealthLoading(true);

      await loadHealth();
    };

  return (
    <div className="app-shell">
      <Header
        language={language}
        theme={theme}
        role="guest"
        onLanguageChange={
          setLanguage
        }
        onThemeToggle={() => {
          setTheme(
            (currentTheme) =>
              currentTheme === "day"
                ? "night"
                : "day",
          );
        }}
      />

      <main className="main-content">
        <RoomPlanPanel
          language={language}
        />

        <HealthPanel
          language={language}
          health={health}
          error={healthError}
          loading={healthLoading}
          onRefresh={() => {
            void handleHealthRefresh();
          }}
        />
      </main>
    </div>
  );
}

export default App;