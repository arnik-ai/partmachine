"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { hideToast, useToast } from "../api";
import { SUB } from "./parts";

export type MenuItem = { href: string; label: string; icon: LucideIcon };

/** منوی سمت راست در دسکتاپ؛ مشترک بین پنل مدیرعامل و پنل کارگر */
export function PanelSidebar({
  title,
  company,
  menu,
  current,
}: {
  title: string;
  company: string;
  menu: readonly MenuItem[];
  current: string;
}) {
  return (
    <aside className="hidden lg:block">
      <Card className="sticky top-20 grid gap-3 p-3">
        <div className="grid border-b px-2.5 pb-2.5 leading-normal">
          <span className={SUB}>{title}</span>
          <b className="text-[14.5px] font-semibold">{company}</b>
        </div>
        <nav aria-label="منوی پنل" className="grid gap-1">
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
  );
}

export function Toaster() {
  const toast = useToast();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(hideToast, toast.undo ? 10_000 : 4_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // با خروج از پنل پیام کهنه نماند
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
