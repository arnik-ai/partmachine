"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store";

const TABS = [
  { href: "/admin", label: "صف تأیید مدارک" },
  { href: "/admin/users", label: "کاربران" },
  { href: "/admin/audit", label: "رویدادها" },
] as const;

/**
 * قاب صفحه‌های مدیریت. برای نقش‌های دیگر مثل صفحه‌ی ناموجود رفتار می‌کند؛ مرز امنیتی واقعی در
 * سرور است (مسیرهای ادمین برای بقیه 404 می‌دهند).
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  const pathname = usePathname().replace(/\/$/, "") || "/";

  if (role !== "admin") {
    return <p className="py-12 text-center text-white/70">صفحه‌ی موردنظر پیدا نشد.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">مدیریت پارت‌ماشین</h1>
        <nav aria-label="بخش‌های مدیریت" className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={buttonVariants({ variant: active ? "default" : "outline", size: "sm" })}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}

/** دکمه‌های صفحه‌ی قبل/بعد مشترک فهرست‌های مدیریت */
export function Pager({
  page,
  hasMore,
  onChange,
  label,
}: {
  page: number;
  hasMore: boolean;
  onChange: (page: number) => void;
  label?: string;
}) {
  if (page === 0 && !hasMore) return null;
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        className={buttonVariants({ variant: "outline", size: "sm" })}
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        صفحه‌ی قبل
      </button>
      {label && <span className="text-sm text-white/75">{label}</span>}
      <button
        type="button"
        className={buttonVariants({ variant: "outline", size: "sm" })}
        disabled={!hasMore}
        onClick={() => onChange(page + 1)}
      >
        صفحه‌ی بعد
      </button>
    </div>
  );
}
