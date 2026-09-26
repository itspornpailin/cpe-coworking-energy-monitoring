export type UserRole =
  | "guest"
  | "admin";

export interface AdminUser {
  id: number;

  username: string;

  role: "admin";

  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  authenticated: boolean;

  role: UserRole;

  user: AdminUser | null;
}

export interface LoginCredentials {
  username: string;
  password: string;
}