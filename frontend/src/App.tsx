import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  createZone,
  deleteZone,
  renameZone,
  setNodePosition,
  setNodeZone,
} from "./api/admin";

import {
  getAuthState,
  loginAdmin,
  logoutAdmin,
} from "./api/auth";

import {
  ApiError,
} from "./api/client";

import {
  getEnvironmentNodes,
  getEnvironmentZones,
} from "./api/environment";

import {
  updateLightingRule,
} from "./api/lighting";

import {
  EnvironmentSidebar,
} from "./components/EnvironmentSidebar";

import {
  Header,
} from "./components/Header";

import {
  LoginModal,
} from "./components/LoginModal";

import {
  RoomPlanPanel,
} from "./components/RoomPlanPanel";

import {
  SensorEditor,
} from "./components/SensorEditor";

import {
  translations,
} from "./i18n/translations";

import type {
  Language,
  Theme,
} from "./i18n/translations";

import type {
  AuthState,
} from "./types/auth";

import type {
  EnvironmentNode,
  EnvironmentZone,
} from "./types/environment";

type AuthErrorKey =
  | "invalidCredentials"
  | "requestFailed";

const GUEST_AUTH_STATE: AuthState = {
  authenticated: false,
  role: "guest",
  user: null,
};

function getInitialLanguage(): Language {
  return window.localStorage.getItem(
    "cpe-language",
  ) === "th"
    ? "th"
    : "en";
}

function getInitialTheme(): Theme {
  return window.localStorage.getItem(
    "cpe-theme",
  ) === "night"
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
    useState<AuthErrorKey | null>(
      null,
    );

  const [
    loginModalOpen,
    setLoginModalOpen,
  ] =
    useState(false);

  const [
    environmentZones,
    setEnvironmentZones,
  ] =
    useState<EnvironmentZone[]>(
      [],
    );

  const [
    environmentNodes,
    setEnvironmentNodes,
  ] =
    useState<EnvironmentNode[]>(
      [],
    );

  const [
    environmentLoading,
    setEnvironmentLoading,
  ] =
    useState(true);

  // Admin sensor editing: whether markers can be dragged, and which sensor is selected.
  const [
    editMode,
    setEditMode,
  ] =
    useState(false);

  const [
    selectedNodeId,
    setSelectedNodeId,
  ] =
    useState<string | null>(
      null,
    );

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

  const loadAuth =
    useCallback(
      async (
        signal?: AbortSignal,
      ) => {
        try {
          setAuth(
            await getAuthState(
              signal,
            ),
          );

          setAuthError(
            null,
          );
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }

          setAuth(
            GUEST_AUTH_STATE,
          );
        } finally {
          if (!signal?.aborted) {
            setAuthLoading(
              false,
            );
          }
        }
      },
      [],
    );

  const loadEnvironment =
    useCallback(
      async (
        signal?: AbortSignal,
      ) => {
        // Zones and nodes load independently, so one failing
        // endpoint never freezes the other part of the page.
        const [
          zones,
          nodes,
        ] =
          await Promise.allSettled([
            getEnvironmentZones(
              signal,
            ),

            getEnvironmentNodes(
              signal,
            ),
          ]);

        if (
          zones.status ===
          "fulfilled"
        ) {
          // Oldest zone first, so a newly added zone goes to the end of the list.
          setEnvironmentZones(
            [...zones.value].sort(
              (a, b) =>
                a.areaId -
                b.areaId,
            ),
          );
        }

        if (
          nodes.status ===
          "fulfilled"
        ) {
          setEnvironmentNodes(
            nodes.value,
          );
        }

        for (const result of [
          zones,
          nodes,
        ]) {
          if (
            result.status ===
              "rejected" &&
            !(
              result.reason instanceof
                DOMException &&
              result.reason.name ===
                "AbortError"
            )
          ) {
            console.error(
              "Unable to load environment data:",
              result.reason,
            );
          }
        }

        if (!signal?.aborted) {
          setEnvironmentLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(() => {
    const controller =
      new AbortController();

    void loadAuth(
      controller.signal,
    );

    return () =>
      controller.abort();
  }, [loadAuth]);

  useEffect(() => {
    const controller =
      new AbortController();

    void loadEnvironment(
      controller.signal,
    );

    const intervalId =
      window.setInterval(
        () => {
          void loadEnvironment(
            controller.signal,
          );
        },
        2_000,
      );

    return () => {
      window.clearInterval(
        intervalId,
      );

      controller.abort();
    };
  }, [loadEnvironment]);

  async function handleAdminLogin(
    username: string,
    password: string,
  ) {
    setAuthLoading(true);
    setAuthError(null);

    try {
      setAuth(
        await loginAdmin({
          username,
          password,
        }),
      );

      setLoginModalOpen(
        false,
      );
    } catch (error) {
      setAuthError(
        error instanceof ApiError &&
          error.status === 401
          ? "invalidCredentials"
          : "requestFailed",
      );
    } finally {
      setAuthLoading(
        false,
      );
    }
  }

  async function handleAdminLogout() {
    setAuthLoading(true);
    setAuthError(null);

    try {
      setAuth(
        await logoutAdmin(),
      );

      setEditMode(false);
      setSelectedNodeId(null);
    } catch {
      setAuthError(
        "requestFailed",
      );
    } finally {
      setAuthLoading(
        false,
      );
    }
  }

  async function handleEnvironmentZoneUpdate(
    areaId: number,
    mode:
      EnvironmentZone["lightingMode"],
    minLux: number,
  ) {
    await updateLightingRule(
      areaId,
      {
        mode,
        minLux,
      },
    );

    await loadEnvironment();
  }

  // Admin sensor editing. Each handler saves, then reloads so the page shows what the server has.
  // Errors are thrown on purpose: SensorEditor shows them to the admin.
  async function handleNodeMove(
    nodeId: string,
    x: number,
    y: number,
  ) {
    // Show the new position straight away so the marker does not jump back
    // while the save is in flight.
    setEnvironmentNodes(
      (current) =>
        current.map((node) =>
          node.nodeId === nodeId
            ? { ...node, x, y }
            : node,
        ),
    );

    try {
      await setNodePosition(
        nodeId,
        { x, y },
      );
    } finally {
      await loadEnvironment();
    }
  }

  async function handleRemoveFromPlan(
    nodeId: string,
  ) {
    try {
      await setNodePosition(
        nodeId,
        null,
      );
    } finally {
      await loadEnvironment();
    }
  }

  async function handleSetNodeZone(
    nodeId: string,
    zoneId: number | null,
  ) {
    try {
      await setNodeZone(
        nodeId,
        zoneId,
      );
    } finally {
      await loadEnvironment();
    }
  }

  async function handleCreateZone(
    name: string,
  ) {
    await createZone(name);

    await loadEnvironment();
  }

  async function handleRenameZone(
    areaId: number,
    name: string,
  ) {
    try {
      await renameZone(
        areaId,
        name,
      );
    } finally {
      await loadEnvironment();
    }
  }

  async function handleDeleteZone(
    areaId: number,
  ) {
    try {
      await deleteZone(areaId);
    } finally {
      await loadEnvironment();
    }
  }

  const isAdmin =
    auth.role === "admin";

  const authErrorMessage =
    authError === null
      ? null
      : translations[
          language
        ].auth[authError];

  return (
    <div className="app-shell">
      <Header
        language={language}
        theme={theme}
        role={auth.role}
        authLoading={
          authLoading
        }
        onLanguageChange={
          setLanguage
        }
        onThemeToggle={() =>
          setTheme(
            (current) =>
              current === "day"
                ? "night"
                : "day",
          )
        }
        onLoginClick={() => {
          setAuthError(null);

          setLoginModalOpen(
            true,
          );
        }}
        onLogoutClick={() =>
          void handleAdminLogout()
        }
      />

      <main className="main-content">
        <div className="digital-twin-layout">
          <RoomPlanPanel
            language={language}
            zones={
              environmentZones
            }
            nodes={
              environmentNodes
            }
            editing={
              isAdmin && editMode
                ? {
                    selectedId:
                      selectedNodeId,
                    onSelect:
                      setSelectedNodeId,
                    onMove: (
                      nodeId,
                      x,
                      y,
                    ) => {
                      void handleNodeMove(
                        nodeId,
                        x,
                        y,
                      ).catch(
                        (error) =>
                          console.error(
                            "Unable to move sensor:",
                            error,
                          ),
                      );
                    },
                  }
                : undefined
            }
          />

          <EnvironmentSidebar
            language={language}
            role={auth.role}
            zones={
              environmentZones
            }
            loading={
              environmentLoading
            }
            onUpdateZone={
              handleEnvironmentZoneUpdate
            }
          />
        </div>

        {isAdmin && (
          <SensorEditor
            language={language}
            nodes={
              environmentNodes
            }
            zones={
              environmentZones
            }
            editMode={editMode}
            onEditModeChange={
              setEditMode
            }
            selectedNodeId={
              selectedNodeId
            }
            onSelectNode={
              setSelectedNodeId
            }
            onSetNodeZone={
              handleSetNodeZone
            }
            onRemoveFromPlan={
              handleRemoveFromPlan
            }
            onCreateZone={
              handleCreateZone
            }
            onRenameZone={
              handleRenameZone
            }
            onDeleteZone={
              handleDeleteZone
            }
          />
        )}
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

          setAuthError(
            null,
          );
        }}
        onLogin={(
          username,
          password,
        ) =>
          void handleAdminLogin(
            username,
            password,
          )
        }
      />
    </div>
  );
}

export default App;