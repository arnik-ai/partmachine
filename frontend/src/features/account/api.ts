"use client";

import { useQuery } from "@tanstack/react-query";
import { getAuthOptions } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import type { User } from "@/features/auth/types";
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
