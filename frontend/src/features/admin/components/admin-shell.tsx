"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthOptions } from "@/features/account/api";
import { useAuthStore } from "@/features/auth/store";

const TABS = [
  { href: "/admin", label: "صف تأیید مدارک" },
  { href: "/admin/disputes", label: "اختلاف‌ها" },
  { href: "/admin/users", label: "کاربران" },
  { href: "/admin/audit", label: "رویدادها" },
] as const;

/**
 * قاب صفحه‌های مدیریت. برای نقش‌های دیگر مثل صفحه‌ی ناموجود رفتار می‌کند؛ مرز امنیتی واقعی در
 * سرور است (مسیرهای ادمین برای بقیه 404 می‌دهند).
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  const twoFactor = useAuthStore((s) => s.user?.twoFactorEnabled ?? false);
  const options = useAuthOptions();
  const pathname = usePathname().replace(/\/$/, "") || "/";

  if (role !== "admin") {
    return <p className="py-12 text-center text-white/70">صفحه‌ی موردنظر پیدا نشد.</p>;
  }
  if (options.isLoading) return <Skeleton className="h-40" />;
  // ادمین بدون ورود دومرحله‌ای به بخش مدیریت راه ندارد (سرور هم همین را اجرا می‌کند)
  if ((options.data?.adminTwoFactorRequired ?? true) && !twoFactor) return <TwoFactorRequired />;

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

function TwoFactorRequired() {
  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          اول ورود دومرحله‌ای را روشن کنید
        </CardTitle>
        <CardDescription>
          برای امنیت بخش مدیریت، ورود ادمین علاوه بر رمز به کد اپ Authenticator روی گوشی (مثلاً
          Google Authenticator) نیاز دارد. روشن کردنش چند دقیقه بیشتر طول نمی‌کشد.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/account#two-factor" className={buttonVariants()}>
          روشن کردن ورود دومرحله‌ای
        </Link>
      </CardContent>
    </Card>
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
