import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getHealth,
} from "./api/health";

import {
  getAuthState,
  loginAdmin,
  logoutAdmin,
} from "./api/auth";

import {
  ApiError,
} from "./api/client";

import {
  Header,
} from "./components/Header";

import {
  HealthPanel,
} from "./components/HealthPanel";

import {
  RoomPlanPanel,
} from "./components/RoomPlanPanel";

import {
  LoginModal,
} from "./components/LoginModal";

import type {
  HealthResponse,
} from "./types/health";

import type {
  AuthState,
} from "./types/auth";

import {
  translations,
} from "./i18n/translations";

import type {
  Language,
  Theme,
} from "./i18n/translations";

type AuthErrorKey =
  | "invalidCredentials"
  | "requestFailed";

const GUEST_AUTH_STATE:
  AuthState = {
    authenticated: false,
    role: "guest",
    user: null,
  };

function getInitialLanguage():
  Language {
  const savedLanguage =
    window.localStorage.getItem(
      "cpe-language",
    );

  return savedLanguage ===
    "th"
    ? "th"
    : "en";
}

function getInitialTheme():
  Theme {
  const savedTheme =
    window.localStorage.getItem(
      "cpe-theme",
    );

  return savedTheme ===
    "night"
    ? "night"
    : "day";
}

function App() {
  const [
    language,
    setLanguage,
  ] =
    useState<Language>(
      getInitialLanguage,
    );

  const [
    theme,
    setTheme,
  ] =
    useState<Theme>(
      getInitialTheme,
    );

  const [
    auth,
    setAuth,
  ] =
    useState<AuthState>(
      GUEST_AUTH_STATE,
    );

  const [
    authLoading,
    setAuthLoading,
  ] =
    useState(true);

  const [
    authError,
    setAuthError,
  ] =
    useState<
      AuthErrorKey | null
    >(null);

  const [
    loginModalOpen,
    setLoginModalOpen,
  ] =
    useState(false);

  const [
    health,
    setHealth,
  ] =
    useState<
      HealthResponse | null
    >(null);

  const [
    healthError,
    setHealthError,
  ] =
    useState<
      string | null
    >(null);

  const [
    healthLoading,
    setHealthLoading,
  ] =
    useState(true);

  useEffect(() => {
    document
      .documentElement
      .dataset
      .theme =
      theme;

    window.localStorage.setItem(
      "cpe-theme",
      theme,
    );
  }, [theme]);

  useEffect(() => {
    document
      .documentElement
      .lang =
      language;

    window.localStorage.setItem(
      "cpe-language",
      language,
    );
  }, [language]);

  const loadAuth =
    useCallback(
      async (
        signal?:
          AbortSignal,
      ) => {
        try {
          const result =
            await getAuthState(
              signal,
            );

          setAuth(result);
          setAuthError(null);
        } catch (
          requestError
        ) {
          if (
            requestError
              instanceof
                DOMException &&
            requestError.name ===
              "AbortError"
          ) {
            return;
          }

          setAuth(
            GUEST_AUTH_STATE,
          );
        } finally {
          if (
            signal?.aborted !==
            true
          ) {
            setAuthLoading(
              false,
            );
          }
        }
      },
      [],
    );

  useEffect(() => {
    const controller =
      new AbortController();

    const requestId =
      window.setTimeout(
        () => {
          void loadAuth(
            controller.signal,
          );
        },
        0,
      );

    return () => {
      window.clearTimeout(
        requestId,
      );

      controller.abort();
    };
  }, [loadAuth]);

  const loadHealth =
    useCallback(
      async (
        signal?:
          AbortSignal,
      ) => {
        try {
          const result =
            await getHealth(
              signal,
            );

          setHealth(result);

          setHealthError(
            null,
          );
        } catch (
          requestError
        ) {
          if (
            requestError
              instanceof
                DOMException &&
            requestError.name ===
              "AbortError"
          ) {
            return;
          }

          setHealth(null);

          if (
            requestError
              instanceof
                Error
          ) {
            setHealthError(
              requestError
                .message,
            );
          } else {
            setHealthError(
              "Unable to connect to backend.",
            );
          }
        } finally {
          setHealthLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(() => {
    const controller =
      new AbortController();

    const initialRequestId =
      window.setTimeout(
        () => {
          void loadHealth(
            controller.signal,
          );
        },
        0,
      );

    const intervalId =
      window.setInterval(
        () => {
          void loadHealth(
            controller.signal,
          );
        },
        10_000,
      );

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

  const handleAdminLogin =
    async (
      username: string,
      password: string,
    ) => {
      setAuthLoading(true);
      setAuthError(null);

      try {
        const result =
          await loginAdmin({
            username,
            password,
          });

        setAuth(result);

        setLoginModalOpen(
          false,
        );
      } catch (
        requestError
      ) {
        if (
          requestError
            instanceof
              ApiError &&
          requestError.status ===
            401
        ) {
          setAuthError(
            "invalidCredentials",
          );
        } else {
          setAuthError(
            "requestFailed",
          );
        }
      } finally {
        setAuthLoading(false);
      }
    };

  const handleAdminLogout =
    async () => {
      setAuthLoading(true);
      setAuthError(null);

      try {
        const result =
          await logoutAdmin();

        setAuth(result);
      } catch {
        setAuthError(
          "requestFailed",
        );
      } finally {
        setAuthLoading(false);
      }
    };

  const authErrorMessage =
    authError === null
      ? null
      : translations[
          language
        ].auth[
          authError
        ];

  return (
    <div className="app-shell">
      <Header
        language={
          language
        }
        theme={
          theme
        }
        role={
          auth.role
        }
        authLoading={
          authLoading
        }
        onLanguageChange={
          setLanguage
        }
        onThemeToggle={() => {
          setTheme(
            (
              currentTheme,
            ) =>
              currentTheme ===
              "day"
                ? "night"
                : "day",
          );
        }}
        onLoginClick={() => {
          setAuthError(null);

          setLoginModalOpen(
            true,
          );
        }}
        onLogoutClick={() => {
          void handleAdminLogout();
        }}
      />

      <main className="main-content">
        <RoomPlanPanel
          language={
            language
          }
        />

        <HealthPanel
          language={
            language
          }
          health={
            health
          }
          error={
            healthError
          }
          loading={
            healthLoading
          }
          onRefresh={() => {
            void handleHealthRefresh();
          }}
        />
      </main>

      <LoginModal
        open={
          loginModalOpen
        }
        language={
          language
        }
        loading={
          authLoading
        }
        error={
          authErrorMessage
        }
        onClose={() => {
          setLoginModalOpen(
            false,
          );

          setAuthError(null);
        }}
        onLogin={(
          username,
          password,
        ) => {
          void handleAdminLogin(
            username,
            password,
          );
        }}
      />
    </div>
  );
}

export default App;