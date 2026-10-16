"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, UserRound } from "lucide-react";
import { TarashinoMark } from "@/components/brand/tarashino-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { logout } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { DEMO_MODE } from "@/lib/config";
import { roleLabel } from "@/lib/constants";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { MobileTabBar } from "./mobile-tab-bar";

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
  { href: "/orders", label: "سفارش‌ها", roles: ["buyer", "agent", "supplier", "qc", "admin"] },
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
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  async function handleLogout() {
    await logout();
    queryClient.clear();
    router.push("/");
  }

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 text-foreground backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <TarashinoMark className="h-7 w-7 text-primary" />
            تراشینو
          </Link>
          <nav aria-label="منوی اصلی" className="hidden items-center gap-1 text-sm lg:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground",
                  isActive(link.href) && "bg-card font-semibold text-foreground shadow-soft",
                )}
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
              {/* نسخه‌ی نمایشی سرور ندارد و اعلانی هم ساخته نمی‌شود */}
              {!DEMO_MODE && <NotificationBell />}
              <Link
                href="/account"
                aria-label="حساب کاربری"
                title="حساب کاربری"
                className={cn(buttonVariants({ variant: "outline", size: "icon" }), "shadow-soft")}
              >
                <UserRound className="h-4 w-4" />
              </Link>
              <Button
                variant="outline"
                size="icon"
                className="shadow-soft"
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
    </header>
    {/* موبایل و تبلت: منوی پایینِ معلق، بیرون از سرصفحه تا جایش ثابت بماند */}
    {hydrated && user && <MobileTabBar links={links} />}
    </>
  );
}
