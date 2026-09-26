import {
  apiGet,
  apiPost,
} from "./client";

import type {
  AuthState,
  LoginCredentials,
} from "../types/auth";

export function getAuthState(
  signal?: AbortSignal,
): Promise<AuthState> {
  return apiGet<AuthState>(
    "/auth/me",
    signal,
  );
}

export function loginAdmin(
  credentials:
    LoginCredentials,
): Promise<AuthState> {
  return apiPost<AuthState>(
    "/auth/login",
    credentials,
  );
}

export function logoutAdmin():
  Promise<AuthState> {
  return apiPost<AuthState>(
    "/auth/logout",
    {},
  );
}