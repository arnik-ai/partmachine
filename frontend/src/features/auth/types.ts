import type { AcceptedAgreement } from "@/features/agreements/types";
import type { RoleValue } from "@/lib/constants";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: RoleValue;
  organizationId?: string;
  companyName?: string | null;
  verified?: boolean;
  /** نقش در سازمان: مدیر یا عضو */
  orgRole?: "owner" | "member";
  /** موبایل تأییدشده (قالب +989xxxxxxxxx) */
  phone?: string | null;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface PasswordResetConfirmInput {
  email: string;
  code: string;
  newPassword: string;
}

/** قابلیت‌هایی که به سرویس ارسال کد وابسته‌اند */
export interface AuthOptions {
  passwordReset: boolean;
  phoneVerification: boolean;
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
  acceptedAgreements?: AcceptedAgreement[];
  /** ثبت‌نام با لینک دعوت: سازمان و نقش از دعوت می‌آید */
  inviteToken?: string;
}

/** پاسخ ورود/ثبت‌نام/تازه‌سازی. refresh token در کوکی HttpOnly است و به JS نمی‌رسد. */
export interface AuthSession {
  user: User;
  accessToken: string;
  /** مدت اعتبار توکن دسترسی به ثانیه */
  expiresIn: number;
}
