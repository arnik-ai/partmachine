"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Factory, LogOut, UserRound } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { logout } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import { DEMO_MODE } from "@/lib/config";
import { roleLabel } from "@/lib/constants";
import { useHydrated } from "@/lib/use-hydrated";

type NavLink = { href: string; label: string; roles?: readonly string[]; demoOnly?: boolean };

/** منو بر اساس نقش: هر کس فقط کارهایی را می‌بیند که برایش معنی دارد */
const NAV_LINKS: readonly NavLink[] = [
  { href: "/admin", label: "مدیریت", roles: ["admin"] },
  { href: "/rfqs/open", label: "درخواست‌های باز", roles: ["supplier"] },
  { href: "/quotations", label: "پیشنهادهای من", roles: ["supplier"] },
  { href: "/profile", label: "پروفایل شرکت", roles: ["supplier"] },
  { href: "/suppliers", label: "قطعه‌سازان" },
  { href: "/rfqs", label: "درخواست‌های من", roles: ["buyer", "agent"] },
  { href: "/organization", label: "سازمان من", roles: ["buyer", "supplier", "agent", "qc"] },
  // سفارش‌ها هنوز به سرور وصل نشده‌اند (فاز ۳)؛ فقط در نسخه‌ی نمایشی دیده می‌شوند
  { href: "/orders", label: "سفارش‌ها", demoOnly: true },
];

function linksFor(role: string | undefined): NavLink[] {
  return NAV_LINKS.filter(
    (link) =>
      (DEMO_MODE || !link.demoOnly) &&
      (!link.roles || (role !== undefined && link.roles.includes(role))),
  );
}

export function Header() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const hydrated = useHydrated();
  const links = linksFor(user?.role);

  async function handleLogout() {
    await logout();
    queryClient.clear();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-card/95 text-card-foreground backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <Factory className="h-6 w-6 text-primary" />
            پارت‌ماشین
          </Link>
          <nav aria-label="منوی اصلی" className="hidden items-center gap-5 text-sm md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {!hydrated || status === "unknown" ? (
            <span className="h-9 w-24" aria-hidden />
          ) : user ? (
            <>
              <Link
                href="/dashboard"
                className="hidden text-sm sm:flex sm:flex-col sm:items-end"
              >
                <span className="font-medium">{user.fullName}</span>
                <span className="text-xs text-muted-foreground">
                  {roleLabel(user.role)}
                </span>
              </Link>
              <Link
                href="/account"
                aria-label="حساب کاربری"
                title="حساب کاربری"
                className={buttonVariants({ variant: "ghost", size: "icon" })}
              >
                <UserRound className="h-4 w-4" />
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label="خروج"
                title="خروج"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: "ghost" })}
              >
                ورود
              </Link>
              <Link href="/register" className={buttonVariants()}>
                ثبت‌نام
              </Link>
            </>
          )}
        </div>
      </div>
      {/* موبایل: همان لینک‌ها در یک ردیف ساده، بدون منوی کشویی */}
      <nav
        aria-label="منوی اصلی"
        className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 pb-3 text-sm md:hidden"
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
