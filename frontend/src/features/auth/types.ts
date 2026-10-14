import type { RoleValue } from "@/lib/constants";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: RoleValue;
  organizationId?: string;
  companyName?: string | null;
  verified?: boolean;
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

/** پاسخ ورود/ثبت‌نام/تازه‌سازی. refresh token در کوکی HttpOnly است و به JS نمی‌رسد. */
export interface AuthSession {
  user: User;
  accessToken: string;
  /** مدت اعتبار توکن دسترسی به ثانیه */
  expiresIn: number;
}
