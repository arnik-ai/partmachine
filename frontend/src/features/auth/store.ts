"use client";

import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { persist } from "zustand/middleware";
import { DEMO_MODE } from "@/lib/config";
import type { User } from "./types";

/** unknown: هنوز معلوم نیست (در حال بازیابی نشست)، authenticated / anonymous */
export type AuthStatus = "unknown" | "authenticated" | "anonymous";

interface AuthState {
  user: User | null;
  /** توکن دسترسی فقط در حافظه نگه داشته می‌شود — هرگز در localStorage */
  accessToken: string | null;
  status: AuthStatus;
  /** true یعنی نشست ساختگی نسخه‌ی نمایشی است */
  isDemo: boolean;
  setSession: (user: User, accessToken: string | null, isDemo?: boolean) => void;
  clear: () => void;
}

const creator: StateCreator<AuthState> = (set) => ({
  user: null,
  accessToken: null,
  status: "unknown",
  isDemo: false,
  setSession: (user, accessToken, isDemo = false) =>
    set({ user, accessToken, isDemo, status: "authenticated" }),
  clear: () =>
    set({ user: null, accessToken: null, isDemo: false, status: "anonymous" }),
});

/**
 * فقط در نسخه‌ی نمایشی (بدون بک‌اند) نشست ساختگی در localStorage می‌ماند.
 * در نسخه‌ی واقعی چیزی ذخیره نمی‌شود؛ نشست با کوکی HttpOnly بازیابی می‌شود.
 */
export const useAuthStore: UseBoundStore<StoreApi<AuthState>> = DEMO_MODE
  ? create<AuthState>()(
      persist(creator, {
        name: "partmachine-auth",
        partialize: (s) => ({ user: s.user, isDemo: s.isDemo }),
      }),
    )
  : create<AuthState>()(creator);
