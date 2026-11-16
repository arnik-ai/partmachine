"use client";

import Link from "next/link";
import { useAuthStore } from "@/features/auth/store";
import { useHydrated } from "@/lib/use-hydrated";

export type AuthActionLabels = {
  login: string;
  register: string;
  dashboard: string;
};

/**
 * دکمه‌های ورود/ثبت‌نامِ صفحه‌ی اول.
 *
 * صفحه‌ی اول روی سرور ساخته می‌شود و نشست کاربر را نمی‌داند؛ پس پیش از این، کاربری که وارد شده بود
 * باز هم «ورود» می‌دید. این بخش سمت مرورگر وضعیت نشست را می‌خواند و برای کاربر وارد‌شده
 * «داشبورد من» نشان می‌دهد. تا معلوم شدن نشست، جای دکمه‌ها خالی می‌ماند تا چیدمان نپرد.
 */
export function LandingAuthActions({ labels }: { labels: AuthActionLabels }) {
  const hydrated = useHydrated();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  if (!hydrated || status === "unknown") {
    return <span className="auth-slot" aria-hidden />;
  }

  if (user) {
    return (
      <Link className="btn btn-ghost btn-sm" href="/dashboard">
        {labels.dashboard}
      </Link>
    );
  }

  return (
    <>
      <Link className="btn-text" href="/login">
        {labels.login}
      </Link>
      <Link className="btn btn-ghost btn-sm" href="/register">
        {labels.register}
      </Link>
    </>
  );
}

/** همان منطق برای پانویس، که لینک‌های ساده دارد */
export function LandingAuthLinks({ labels }: { labels: AuthActionLabels }) {
  const hydrated = useHydrated();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  if (!hydrated || status === "unknown") return null;

  if (user) {
    return <Link href="/dashboard">{labels.dashboard}</Link>;
  }

  return (
    <>
      <Link href="/login">{labels.login}</Link>
      <Link href="/register">{labels.register}</Link>
    </>
  );
}
