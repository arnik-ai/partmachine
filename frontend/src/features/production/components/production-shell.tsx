"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CircleCheck,
  LayoutDashboard,
  ListChecks,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";
import {
  CEO,
  hideToast,
  setViewAs,
  useCompany,
  useToast,
  useViewAs,
  useWorkerName,
  useWorkers,
} from "../api";
import { SUB } from "./parts";

type MenuItem = { href: string; label: string; icon: LucideIcon };

const CEO_MENU: readonly MenuItem[] = [
  { href: "/production", label: "تابلو", icon: LayoutDashboard },
  { href: "/production/processes", label: "نوع فرایند", icon: Workflow },
  { href: "/production/people", label: "کارکنان", icon: Users },
];

const WORKER_MENU: readonly MenuItem[] = [
  { href: "/production/tasks", label: "کارهای من", icon: ListChecks },
  { href: "/production/done", label: "انجام‌شده", icon: CircleCheck },
];

const isWorkerPath = (path: string) => WORKER_MENU.some((item) => item.href === path);

/** صفحه‌ی سفارش و سفارش جدید زیرمجموعه‌ی تابلو هستند */
function activeHref(path: string): string {
  return path.startsWith("/production/order") || path.startsWith("/production/new")
    ? "/production"
    : path;
}

/** قاب ماژول: منوی راست در دسکتاپ، تب بالای صفحه در گوشی (چون منوی پایین سایت آن‌جا هست) */
export function ProductionShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname().replace(/\/$/, "");
  const hydrated = useHydrated();
  const viewAs = useViewAs();
  const company = useCompany();
  const workers = useWorkers();
  const workerName = useWorkerName();

  const isWorker = viewAs !== CEO;
  const menu = isWorker ? WORKER_MENU : CEO_MENU;
  const current = activeHref(path);
  const home = isWorker ? "/production/tasks" : "/production";
  const wrongPanel = isWorker !== isWorkerPath(path);

  // هر نقش فقط پنل خودش را می‌بیند
  useEffect(() => {
    if (wrongPanel) router.replace(home);
  }, [wrongPanel, home, router]);

  // تاریخ‌ها به امروز وابسته‌اند، پس محتوا فقط در مرورگر ساخته می‌شود
  if (!hydrated) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="grid gap-4">
      {/* فقط نسخه‌ی نمایشی؛ در نسخه‌ی واقعی هر کس با حساب خودش وارد می‌شود */}
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-3.5 py-1.5 text-[13px] text-muted-foreground">
        <span>نمایش به‌عنوان</span>
        <Select
          value={viewAs}
          onChange={(event) => setViewAs(event.target.value)}
          className="h-9 w-auto min-w-32 rounded-full text-foreground"
        >
          <option value={CEO}>مدیرعامل</option>
          {workers.map((worker) => (
            <option key={worker.id} value={worker.id}>
              {worker.name}
            </option>
          ))}
        </Select>
      </label>

      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside className="hidden lg:block">
          <Card className="sticky top-20 grid gap-3 p-3">
            <div className="grid border-b px-2.5 pb-2.5 leading-normal">
              <span className={SUB}>{isWorker ? workerName(viewAs) : "مدیرعامل"}</span>
              <b className="text-[14.5px] font-semibold">{company}</b>
            </div>
            <nav aria-label="منوی تولید" className="grid gap-1">
              {menu.map((item) => {
                const Icon = item.icon;
                const active = item.href === current;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-2.5 rounded-xl px-3 text-[14.5px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground",
                      active && "bg-secondary font-semibold text-primary-deep",
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </Card>
        </aside>

        <nav aria-label="منوی تولید" className="-mb-3 flex gap-2 overflow-x-auto pb-4 lg:hidden">
          {menu.map((item) => {
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
            {wrongPanel ? <Skeleton className="h-64 w-full" /> : children}
          </div>
        </div>
      </div>

      <Toaster />
    </div>
  );
}

function Toaster() {
  const toast = useToast();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(hideToast, toast.undo ? 10_000 : 4_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // با خروج از ماژول پیام کهنه نماند
  useEffect(() => hideToast, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md lg:bottom-6"
    >
      {toast && (
        <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-foreground px-4 py-3 text-sm text-white shadow-xl">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className="flex-none px-1.5 py-0.5 font-semibold text-sky-300"
              onClick={() => {
                toast.undo?.();
                hideToast();
              }}
            >
              برگرداندن
            </button>
          )}
        </div>
      )}
    </div>
  );
}
