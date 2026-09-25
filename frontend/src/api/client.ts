const configuredBaseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:8080/api/v1";

// Remove a trailing slash so:
// http://localhost:8080/api/v1/
// does not become:
// http://localhost:8080/api/v1//health
export const API_BASE_URL =
  configuredBaseUrl.replace(/\/+$/, "");

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

function normalizePath(path: string): string {
  return path.startsWith("/")
    ? path
    : `/${path}`;
}

// Generic GET helper used by frontend API modules.
//
// credentials: "include" is already enabled because the authentication
// system will later use an HttpOnly session cookie.
export async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    `${API_BASE_URL}${normalizePath(path)}`,
    {
      method: "GET",

      credentials: "include",

      headers: {
        Accept: "application/json",
      },

      signal,
    },
  );

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}