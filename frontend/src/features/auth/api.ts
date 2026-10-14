"use client";

import { ApiError, CSRF_HEADERS, apiFetch, configureAuth } from "@/lib/api-client";
import { DEMO_MODE } from "@/lib/config";
import { useAuthStore } from "./store";
import type {
  AuthOptions,
  AuthSession,
  ChangePasswordInput,
  LoginInput,
  PasswordResetConfirmInput,
  RegisterInput,
  User,
} from "./types";

/**
 * نشانه‌ی غیرحساس «احتمالاً نشست داریم» — فقط برای اینکه بازدیدکننده‌ی ناشناس با هر
 * بار باز کردن سایت یک درخواست refresh بی‌فایده نفرستد. توکنی در آن نیست.
 */
const SESSION_HINT_KEY = "pm_session_hint";

/** کلیدهای localStorage نسخه‌های قبلی و حالت دمو که هنگام خروج پاک می‌شوند */
const LOCAL_KEYS = [
  "partmachine-auth",
  "partmachine-demo-rfqs",
  "partmachine-demo-awards",
  "partmachine-demo-signatures",
  "partmachine-demo-gallery",
];

function setHint(on: boolean) {
  try {
    if (on) localStorage.setItem(SESSION_HINT_KEY, "1");
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // localStorage در دسترس نیست (حالت خصوصی و...) — مشکلی نیست
  }
}

function hasHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

function applySession(session: AuthSession): AuthSession {
  useAuthStore.getState().setSession(session.user, session.accessToken);
  setHint(true);
  return session;
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const session = await apiFetch<AuthSession>("/auth/login", {
    method: "POST",
    body: input,
    auth: false,
    credentials: "include",
  });
  return applySession(session);
}

export async function register(input: RegisterInput): Promise<AuthSession> {
  const session = await apiFetch<AuthSession>("/auth/register", {
    method: "POST",
    body: input,
    auth: false,
    credentials: "include",
  });
  return applySession(session);
}

/** رمز را عوض می‌کند؛ سرور نشست‌های دیگر را می‌بندد و برای همین مرورگر نشست تازه می‌دهد */
export async function changePassword(input: ChangePasswordInput): Promise<AuthSession> {
  const session = await apiFetch<AuthSession>("/auth/change-password", {
    method: "POST",
    body: input,
    credentials: "include",
  });
  return applySession(session);
}

export function getAuthOptions(): Promise<AuthOptions> {
  if (DEMO_MODE) return Promise.resolve({ passwordReset: false, phoneVerification: false });
  return apiFetch<AuthOptions>("/auth/options", { auth: false });
}

export function requestPasswordReset(email: string): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>("/auth/password-reset/request", {
    method: "POST",
    body: { email },
    auth: false,
  });
}

/** کد درست ⇒ رمز تازه و ورود مستقیم (همه‌ی نشست‌های قبلی بسته می‌شوند) */
export async function confirmPasswordReset(input: PasswordResetConfirmInput): Promise<AuthSession> {
  const session = await apiFetch<AuthSession>("/auth/password-reset/confirm", {
    method: "POST",
    body: input,
    auth: false,
    credentials: "include",
  });
  return applySession(session);
}

let inflightRefresh: Promise<string | null> | null = null;

/**
 * نشست را با کوکی HttpOnly تازه می‌کند و توکن دسترسی جدید را برمی‌گرداند (یا null).
 * درخواست‌های هم‌زمان فقط یک refresh واقعی می‌فرستند.
 */
export function refreshSession(): Promise<string | null> {
  if (DEMO_MODE) return Promise.resolve(null);
  inflightRefresh ??= (async () => {
    try {
      const session = await apiFetch<AuthSession>("/auth/refresh", {
        method: "POST",
        auth: false,
        credentials: "include",
        headers: CSRF_HEADERS,
      });
      return applySession(session).accessToken;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        useAuthStore.getState().clear();
        setHint(false);
      }
      return null;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

/** هنگام باز شدن سایت: نشست قبلی را بی‌صدا بازیابی می‌کند */
export async function restoreSession(): Promise<void> {
  const store = useAuthStore.getState();
  if (DEMO_MODE) {
    if (store.user) store.setSession(store.user, null, true);
    else store.clear();
    return;
  }
  try {
    // توکن‌های ذخیره‌شده توسط نسخه‌های قبلی را پاک کن
    localStorage.removeItem("partmachine-auth");
  } catch {
    // بی‌اهمیت
  }
  if (!hasHint()) {
    store.clear();
    return;
  }
  const token = await refreshSession();
  if (!token && useAuthStore.getState().status === "unknown") {
    // سرور در دسترس نبود؛ کاربر ناشناس فرض می‌شود و صفحات خطای مناسب را نشان می‌دهند
    useAuthStore.getState().clear();
  }
}

export async function logout(): Promise<void> {
  if (!DEMO_MODE) {
    try {
      await apiFetch<void>("/auth/logout", {
        method: "POST",
        auth: false,
        credentials: "include",
        headers: CSRF_HEADERS,
      });
    } catch {
      // حتی اگر سرور در دسترس نباشد، خروج سمت مرورگر انجام می‌شود
    }
  }
  useAuthStore.getState().clear();
  setHint(false);
  try {
    for (const key of LOCAL_KEYS) localStorage.removeItem(key);
  } catch {
    // بی‌اهمیت
  }
}

/** فقط در نسخه‌ی نمایشی: نشست ساختگی بدون سرور */
export function startDemoSession(
  input: Pick<RegisterInput, "email" | "fullName" | "role"> & { companyName?: string },
): User {
  const user: User = {
    id: `demo-${input.email}`,
    email: input.email,
    fullName: input.fullName,
    role: input.role,
    companyName: input.companyName,
  };
  useAuthStore.getState().setSession(user, null, true);
  return user;
}

configureAuth({
  getToken: () => useAuthStore.getState().accessToken,
  refresh: refreshSession,
});
