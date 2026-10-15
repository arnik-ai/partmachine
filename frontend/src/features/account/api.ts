"use client";

import { useQuery } from "@tanstack/react-query";
import { getAuthOptions, reloadUser } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import type { TwoFactorSetup, User } from "@/features/auth/types";
import { apiFetch } from "@/lib/api-client";

export function requestPhoneCode(phone: string): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>("/auth/phone/request", {
    method: "POST",
    body: { phone },
  });
}

/** شماره را با کد تأیید می‌کند و کاربر جاری را در حافظه به‌روز می‌کند */
export async function verifyPhone(phone: string, code: string): Promise<User> {
  const user = await apiFetch<User>("/auth/phone/verify", {
    method: "POST",
    body: { phone, code },
  });
  useAuthStore.setState((state) => (state.user ? { user: { ...state.user, ...user } } : state));
  return user;
}

/** قابلیت‌های وابسته به ارسال کد (بازیابی رمز، تأیید موبایل) */
export function useAuthOptions() {
  return useQuery({
    queryKey: ["auth", "options"],
    queryFn: getAuthOptions,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// --- ورود دومرحله‌ای ----------------------------------------------------------------------------

/** کلید تازه و QR برای اسکن در اپ Authenticator */
export function startTwoFactorSetup(): Promise<TwoFactorSetup> {
  return apiFetch<TwoFactorSetup>("/auth/2fa/setup", { method: "POST" });
}

/** روشن کردن با رمز و نخستین کد اپ؛ کدهای پشتیبان فقط همین یک بار برمی‌گردند */
export async function enableTwoFactor(
  setupToken: string,
  code: string,
  password: string,
): Promise<string[]> {
  const result = await apiFetch<{ recoveryCodes: string[] }>("/auth/2fa/enable", {
    method: "POST",
    body: { setupToken, code, password },
  });
  await reloadUser();
  return result.recoveryCodes;
}

export async function disableTwoFactor(password: string, code: string): Promise<void> {
  await apiFetch<void>("/auth/2fa/disable", { method: "POST", body: { password, code } });
  await reloadUser();
}

/** کدهای پشتیبان تازه؛ کدهای قبلی دیگر کار نمی‌کنند */
export async function newRecoveryCodes(password: string, code: string): Promise<string[]> {
  const result = await apiFetch<{ recoveryCodes: string[] }>("/auth/2fa/recovery-codes", {
    method: "POST",
    body: { password, code },
  });
  return result.recoveryCodes;
}
