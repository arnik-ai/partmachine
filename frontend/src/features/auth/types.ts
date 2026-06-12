import type { RoleValue } from "@/lib/constants";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: RoleValue;
  companyName?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  role: Exclude<RoleValue, "admin">;
  companyName?: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}
