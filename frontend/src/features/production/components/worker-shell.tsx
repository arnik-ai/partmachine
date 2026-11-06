"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleCheck, ListChecks, LogOut } from "lucide-react";
import { TarashinoMark } from "@/components/brand/tarashino-mark";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";
import { signOutWorker, useCompany, useSignedInWorker } from "../api";
import { PanelSidebar, Toaster, type MenuItem } from "./panel-parts";

const LOGIN = "/worker/login";

const MENU: readonly MenuItem[] = [
  { href: "/worker", label: "کارهای من", icon: ListChecks },
  { href: "/worker/done", label: "انجام‌شده", icon: CircleCheck },
];

function Brand() {
  return (
    <span className="flex items-center gap-2 font-bold">
      <TarashinoMark className="h-7 w-7 text-primary" />
      تراشینو
    </span>
  );
}

/**
 * پنل کارگر جدا از سایت است: آدرس و ورود خودش را دارد و هیچ‌کدام از منوهای سایت و مدیرعامل در آن نیست.
 * در نسخه‌ی نمونه ورود فقط در همین مرورگر است؛ جدایی واقعی دسترسی با بک‌اند انجام می‌شود.
 */
export function WorkerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname().replace(/\/$/, "");
  const hydrated = useHydrated();
  const worker = useSignedInWorker();
  const company = useCompany();

  const onLogin = path === LOGIN;
  const redirect = !hydrated ? null : worker && onLogin ? "/worker" : !worker && !onLogin ? LOGIN : null;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  // نام کارگر و تاریخ‌ها فقط در مرورگر معلوم است
  if (!hydrated || redirect) {
    return (
      <div className="mx-auto max-w-md p-4">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (onLogin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
        <Brand />
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Brand />
          <Button type="button" variant="ghost" size="sm" onClick={signOutWorker}>
            <LogOut className="h-4 w-4" aria-hidden />
            خروج
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 lg:pb-8">
        <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
          <PanelSidebar title={worker?.name ?? ""} company={company} menu={MENU} current={path} />
          <div className="min-w-0">
            <div className="mx-auto grid w-full max-w-2xl gap-[22px]">{children}</div>
          </div>
        </div>
      </main>

      <nav
        aria-label="منوی پایین"
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 lg:hidden"
      >
        <div className="mx-auto grid max-w-md auto-cols-fr grid-flow-col gap-1 rounded-full border border-sky-200 bg-card/95 p-1.5 text-card-foreground shadow-[0_18px_34px_-16px_rgb(12_50_80/0.45)] backdrop-blur-md">
          {MENU.map((item) => {
            const Icon = item.icon;
            const active = item.href === path;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-xs font-semibold text-foreground/80 transition-colors",
                  active &&
                    "bg-gradient-to-br from-sky-300 to-sky-400 font-bold text-sky-950 shadow-[0_6px_14px_-8px_rgb(2_132_199)]",
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "text-sky-950" : "text-primary")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Toaster />
    </div>
  );
}
