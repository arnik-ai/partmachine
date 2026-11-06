"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Workflow } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { resetDemo, useCompany } from "../api";
import { LINK_BUTTON } from "./parts";
import { PanelSidebar, Toaster, type MenuItem } from "./panel-parts";

const MENU: readonly MenuItem[] = [
  { href: "/production", label: "تابلو", icon: LayoutDashboard },
  { href: "/production/processes", label: "نوع فرایند", icon: Workflow },
  { href: "/production/people", label: "کارکنان", icon: Users },
];

/** صفحه‌ی سفارش و سفارش جدید زیرمجموعه‌ی تابلو هستند */
function activeHref(path: string): string {
  return path.startsWith("/production/order") || path.startsWith("/production/new")
    ? "/production"
    : path;
}

/** پنل مدیرعامل: منوی راست در دسکتاپ، تب بالای صفحه در گوشی (چون منوی پایین سایت آن‌جا هست) */
export function ProductionShell({ children }: { children: React.ReactNode }) {
  const current = activeHref(usePathname().replace(/\/$/, ""));
  const hydrated = useHydrated();
  const company = useCompany();

  // تاریخ‌ها به امروز وابسته‌اند، پس محتوا فقط در مرورگر ساخته می‌شود
  if (!hydrated) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <PanelSidebar title="مدیرعامل" company={company} menu={MENU} current={current} />

      <nav aria-label="منوی پنل" className="-mb-3 flex gap-2 overflow-x-auto pb-4 lg:hidden">
        {MENU.map((item) => {
          const active = item.href === current;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={buttonVariants({ variant: active ? "default" : "outline", size: "sm" })}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="min-w-0">
        <div className="mx-auto grid w-full max-w-2xl gap-[22px]">
          {children}
          <button type="button" className={cn(LINK_BUTTON, "text-muted-foreground")} onClick={resetDemo}>
            شروع دوباره‌ی نمونه
          </button>
        </div>
      </div>

      <Toaster />
    </div>
  );
}
