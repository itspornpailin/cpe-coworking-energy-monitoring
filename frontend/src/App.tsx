import { useCallback, useEffect, useState } from "react";

import { getHealth } from "./api/health";
import { getAuthState, loginAdmin, logoutAdmin } from "./api/auth";
import { ApiError } from "./api/client";

import { Header } from "./components/Header";
import { HealthPanel } from "./components/HealthPanel";
import { RoomPlanPanel } from "./components/RoomPlanPanel";
import { EnvironmentSidebar } from "./components/EnvironmentSidebar";
import { LoginModal } from "./components/LoginModal";

import type { HealthResponse } from "./types/health";
import type { AuthState } from "./types/auth";
import type { EnvironmentZone } from "./types/environment";

import { translations } from "./i18n/translations";
import type { Language, Theme } from "./i18n/translations";

type AuthErrorKey =
  | "invalidCredentials"
  | "requestFailed";

const GUEST_AUTH_STATE: AuthState = {
  authenticated: false,
  role: "guest",
  user: null,
};

/*
 * ============================================================
 * MOCK DATA: START
 * ============================================================
 *
 * MOCK DATA:
 * These values exist only so that the environmental dashboard
 * can be developed before the real BH1750 and SHT31 sensors
 * are installed.
 *
 * MOCK DATA:
 * Remove this constant when environmental data comes from
 * the real backend API.
 * ============================================================
 */

const MOCK_ENVIRONMENT_ZONES: EnvironmentZone[] = [ // MOCK DATA
  { // MOCK DATA
    areaId: 1, // MOCK DATA
    code: "AREA-A", // MOCK DATA
    name: "Area A", // MOCK DATA
    averageLux: 500, // MOCK DATA
    averageTemperature: 25.0, // MOCK DATA
    minLux: 500, // MOCK DATA
    lightingMode: "bright_required", // MOCK DATA
    warning: false, // MOCK DATA
  }, // MOCK DATA

  { // MOCK DATA
    areaId: 2, // MOCK DATA
    code: "AREA-B", // MOCK DATA
    name: "Area B", // MOCK DATA
    averageLux: 420, // MOCK DATA
    averageTemperature: 25.7, // MOCK DATA
    minLux: 500, // MOCK DATA
    lightingMode: "bright_required", // MOCK DATA
    warning: true, // MOCK DATA
  }, // MOCK DATA

  { // MOCK DATA
    areaId: 3, // MOCK DATA
    code: "AREA-C", // MOCK DATA
    name: "Area C", // MOCK DATA
    averageLux: 180, // MOCK DATA
    averageTemperature: 24.9, // MOCK DATA
    minLux: 500, // MOCK DATA
    lightingMode: "dark_allowed", // MOCK DATA
    warning: false, // MOCK DATA
  }, // MOCK DATA
]; // MOCK DATA

/*
 * ============================================================
 * MOCK DATA: END
 * ============================================================
 */

function getInitialLanguage(): Language {
  const savedLanguage = window.localStorage.getItem("cpe-language");

  return savedLanguage === "th" ? "th" : "en";
}

function getInitialTheme(): Theme {
  const savedTheme = window.localStorage.getItem("cpe-theme");

  return savedTheme === "night" ? "night" : "day";
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

  /*
   * MOCK DATA:
   * This state currently starts from fake environmental readings.
   *
   * Later:
   * replace this with data loaded from an environmental API.
   */
  const [environmentZones, setEnvironmentZones] = // MOCK DATA
    useState<EnvironmentZone[]>(MOCK_ENVIRONMENT_ZONES); // MOCK DATA

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
      const result = await getAuthState(signal);

      setAuth(result);
      setAuthError(null);
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        return;
      }

      setAuth(GUEST_AUTH_STATE);
    } finally {
      if (signal?.aborted !== true) {
        setAuthLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const requestId = window.setTimeout(() => {
      void loadAuth(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(requestId);
      controller.abort();
    };
  }, [loadAuth]);

  const loadHealth = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await getHealth(signal);

      setHealth(result);
      setHealthError(null);
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        return;
      }

      setHealth(null);

      if (requestError instanceof Error) {
        setHealthError(requestError.message);
      } else {
        setHealthError("Unable to connect to backend.");
      }
    } finally {
      if (signal?.aborted !== true) {
        setHealthLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const initialRequestId = window.setTimeout(() => {
      void loadHealth(controller.signal);
    }, 0);

    const intervalId = window.setInterval(() => {
      void loadHealth(controller.signal);
    }, 10_000);

    return () => {
      window.clearTimeout(initialRequestId);
      window.clearInterval(intervalId);
      controller.abort();
    };
  }, [loadHealth]);

  const handleHealthRefresh = async () => {
    setHealthLoading(true);
    await loadHealth();
  };

  const handleAdminLogin = async (
    username: string,
    password: string,
  ) => {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const result = await loginAdmin({
        username,
        password,
      });

      setAuth(result);
      setLoginModalOpen(false);
    } catch (requestError) {
      if (
        requestError instanceof ApiError &&
        requestError.status === 401
      ) {
        setAuthError("invalidCredentials");
      } else {
        setAuthError("requestFailed");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const result = await logoutAdmin();
      setAuth(result);
    } catch {
      setAuthError("requestFailed");
    } finally {
      setAuthLoading(false);
    }
  };

  /*
   * ============================================================
   * MOCK DATA: START
   * ============================================================
   *
   * MOCK DATA:
   * This simulates what will eventually happen through:
   *
   * PATCH /api/v1/admin/lighting-zones/{areaID}
   *
   * Right now it only changes frontend state.
   *
   * MOCK DATA:
   * Remove/replace this function once the frontend is connected
   * to the real lighting-zone backend endpoint.
   * ============================================================
   */

  const handleEnvironmentZoneUpdate = async ( // MOCK DATA
    areaId: number, // MOCK DATA
    mode: EnvironmentZone["lightingMode"], // MOCK DATA
    minLux: number, // MOCK DATA
  ) => { // MOCK DATA
    setEnvironmentZones((currentZones) => // MOCK DATA
      currentZones.map((zone) => { // MOCK DATA
        if (zone.areaId !== areaId) { // MOCK DATA
          return zone; // MOCK DATA
        } // MOCK DATA

        const warning = // MOCK DATA
          mode === "bright_required" && // MOCK DATA
          zone.averageLux !== null && // MOCK DATA
          zone.averageLux < minLux; // MOCK DATA

        return { // MOCK DATA
          ...zone, // MOCK DATA
          lightingMode: mode, // MOCK DATA
          minLux, // MOCK DATA
          warning, // MOCK DATA
        }; // MOCK DATA
      }), // MOCK DATA
    ); // MOCK DATA
  }; // MOCK DATA

  /*
   * ============================================================
   * MOCK DATA: END
   * ============================================================
   */

  const authErrorMessage =
    authError === null
      ? null
      : translations[language].auth[authError];

  return (
    <div className="app-shell">
      <Header
        language={language}
        theme={theme}
        role={auth.role}
        authLoading={authLoading}
        onLanguageChange={setLanguage}
        onThemeToggle={() => {
          setTheme((currentTheme) =>
            currentTheme === "day" ? "night" : "day",
          );
        }}
        onLoginClick={() => {
          setAuthError(null);
          setLoginModalOpen(true);
        }}
        onLogoutClick={() => {
          void handleAdminLogout();
        }}
      />

      <main className="main-content">
        <div className="digital-twin-layout">
          <RoomPlanPanel
            language={language}
          />

          <EnvironmentSidebar
            language={language}
            role={auth.role}
            zones={environmentZones} // MOCK DATA
            onUpdateZone={handleEnvironmentZoneUpdate} // MOCK DATA
          />
        </div>

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

      <LoginModal
        open={loginModalOpen}
        language={language}
        loading={authLoading}
        error={authErrorMessage}
        onClose={() => {
          setLoginModalOpen(false);
          setAuthError(null);
        }}
        onLogin={(username, password) => {
          void handleAdminLogin(username, password);
        }}
      />
    </div>
  );
}

export default App;