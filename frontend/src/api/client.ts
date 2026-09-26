const configuredBaseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:8080/api/v1";

export const API_BASE_URL =
  configuredBaseUrl.replace(
    /\/+$/,
    "",
  );

export class ApiError extends Error {
  status: number;

  constructor(
    status: number,
    message: string,
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
  }
}

function normalizePath(
  path: string,
): string {
  return path.startsWith("/")
    ? path
    : `/${path}`;
}

function getErrorMessage(
  payload: unknown,
): string | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("error" in payload)
  ) {
    return null;
  }

  const error =
    (
      payload as {
        error?: unknown;
      }
    ).error;

  return typeof error === "string"
    ? error
    : null;
}

async function apiRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const headers =
    new Headers(
      init.headers,
    );

  headers.set(
    "Accept",
    "application/json",
  );

  const response =
    await fetch(
      `${API_BASE_URL}${normalizePath(path)}`,
      {
        ...init,

        credentials:
          "include",

        headers,
      },
    );

  let payload: unknown =
    null;

  const contentType =
    response.headers.get(
      "Content-Type",
    ) ?? "";

  if (
    contentType.includes(
      "application/json",
    )
  ) {
    try {
      payload =
        await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,

      getErrorMessage(
        payload,
      ) ??
        `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return payload as T;
}

export function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>(
    path,
    {
      method: "GET",
      signal,
    },
  );
}

export function apiPost<T>(
  path: string,
  body: unknown = {},
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>(
    path,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify(
          body,
        ),

      signal,
    },
  );
}