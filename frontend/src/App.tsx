import { useCallback, useEffect, useState } from "react";

import { getAuthState, loginAdmin, logoutAdmin } from "./api/auth";
import { ApiError } from "./api/client";
import { getEnvironmentZones } from "./api/environment";
import { getHealth } from "./api/health";
import { updateLightingRule } from "./api/lighting";

import { EnvironmentSidebar } from "./components/EnvironmentSidebar";
import { Header } from "./components/Header";
import { HealthPanel } from "./components/HealthPanel";
import { LoginModal } from "./components/LoginModal";
import { RoomPlanPanel } from "./components/RoomPlanPanel";

import { translations } from "./i18n/translations";
import type { Language, Theme } from "./i18n/translations";

import type { AuthState } from "./types/auth";
import type { EnvironmentZone } from "./types/environment";
import type { HealthResponse } from "./types/health";

type AuthErrorKey = "invalidCredentials" | "requestFailed";

const GUEST_AUTH_STATE: AuthState = {
  authenticated: false,
  role: "guest",
  user: null,
};

function getInitialLanguage(): Language {
  return window.localStorage.getItem("cpe-language") === "th" ? "th" : "en";
}

function getInitialTheme(): Theme {
  return window.localStorage.getItem("cpe-theme") === "night" ? "night" : "day";
}

function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const [auth, setAuth] = useState<AuthState>(GUEST_AUTH_STATE);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<AuthErrorKey | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [environmentZones, setEnvironmentZones] = useState<EnvironmentZone[]>([]);
  const [environmentLoading, setEnvironmentLoading] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("cpe-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem("cpe-language", language);
  }, [language]);

  const loadAuth = useCallback(async (signal?: AbortSignal) => {
    try {
      setAuth(await getAuthState(signal));
      setAuthError(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setAuth(GUEST_AUTH_STATE);
    } finally {
      if (!signal?.aborted) setAuthLoading(false);
    }
  }, []);

  const loadHealth = useCallback(async (signal?: AbortSignal) => {
    try {
      setHealth(await getHealth(signal));
      setHealthError(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;

      setHealth(null);
      setHealthError(
        error instanceof Error ? error.message : "Unable to connect to backend.",
      );
    } finally {
      if (!signal?.aborted) setHealthLoading(false);
    }
  }, []);

  const loadEnvironment = useCallback(async (signal?: AbortSignal) => {
    try {
      setEnvironmentZones(await getEnvironmentZones(signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Unable to load environment zones:", error);
    } finally {
      if (!signal?.aborted) setEnvironmentLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadAuth(controller.signal);

    return () => controller.abort();
  }, [loadAuth]);

  useEffect(() => {
    const controller = new AbortController();

    void loadHealth(controller.signal);

    const intervalId = window.setInterval(() => {
      void loadHealth(controller.signal);
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
      controller.abort();
    };
  }, [loadHealth]);

  useEffect(() => {
    const controller = new AbortController();

    void loadEnvironment(controller.signal);

    const intervalId = window.setInterval(() => {
      void loadEnvironment(controller.signal);
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
      controller.abort();
    };
  }, [loadEnvironment]);

  async function handleHealthRefresh() {
    setHealthLoading(true);
    await loadHealth();
  }

  async function handleAdminLogin(username: string, password: string) {
    setAuthLoading(true);
    setAuthError(null);

    try {
      setAuth(await loginAdmin({ username, password }));
      setLoginModalOpen(false);
    } catch (error) {
      setAuthError(
        error instanceof ApiError && error.status === 401
          ? "invalidCredentials"
          : "requestFailed",
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleAdminLogout() {
    setAuthLoading(true);
    setAuthError(null);

    try {
      setAuth(await logoutAdmin());
    } catch {
      setAuthError("requestFailed");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleEnvironmentZoneUpdate(
    areaId: number,
    mode: EnvironmentZone["lightingMode"],
    minLux: number,
  ) {
    await updateLightingRule(areaId, { mode, minLux });
    await loadEnvironment();
  }

  const authErrorMessage =
    authError === null ? null : translations[language].auth[authError];

  return (
    <div className="app-shell">
      <Header
        language={language}
        theme={theme}
        role={auth.role}
        authLoading={authLoading}
        onLanguageChange={setLanguage}
        onThemeToggle={() =>
          setTheme((current) => (current === "day" ? "night" : "day"))
        }
        onLoginClick={() => {
          setAuthError(null);
          setLoginModalOpen(true);
        }}
        onLogoutClick={() => void handleAdminLogout()}
      />

      <main className="main-content">
        <div className="digital-twin-layout">
          <RoomPlanPanel language={language} />

          <EnvironmentSidebar
            language={language}
            role={auth.role}
            zones={environmentZones}
            loading={environmentLoading}
            onUpdateZone={handleEnvironmentZoneUpdate}
          />
        </div>

        <HealthPanel
          language={language}
          health={health}
          error={healthError}
          loading={healthLoading}
          onRefresh={() => void handleHealthRefresh()}
        />
      </main>

      <LoginModal
        open={loginModalOpen}
        language={language}
        loading={authLoading}
        error={authErrorMessage}
        onClose={() => {
          setLoginModalOpen(false);
          setAuthError(null);
        }}
        onLogin={(username, password) =>
          void handleAdminLogin(username, password)
        }
      />
    </div>
  );
}

export default App;