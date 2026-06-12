"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthTokens, User } from "./types";

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  /** true یعنی سشن از Mock ساخته شده نه از بک‌اند واقعی */
  isDemo: boolean;
  setSession: (user: User, tokens: AuthTokens, isDemo?: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isDemo: false,
      setSession: (user, tokens, isDemo = false) =>
        set({ user, tokens, isDemo }),
      logout: () => set({ user: null, tokens: null, isDemo: false }),
    }),
    { name: "partmachine-auth" },
  ),
);
