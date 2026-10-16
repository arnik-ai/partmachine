"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Factory,
  FileSearch,
  FileText,
  House,
  LayoutGrid,
  MessageSquareQuote,
  Package,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TabLink = { href: string; label: string };

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": House,
  "/rfqs": FileText,
  "/rfqs/open": FileSearch,
  "/quotations": MessageSquareQuote,
  "/orders": Package,
  "/suppliers": Factory,
  "/profile": Building2,
  "/organization": Users,
  "/admin": ShieldCheck,
};

/** نام کوتاه هر بخش برای منوی پایین */
const SHORT: Record<string, string> = {
  "/rfqs": "درخواست‌ها",
  "/rfqs/open": "بازار",
  "/quotations": "پیشنهادها",
  "/orders": "سفارش‌ها",
  "/suppliers": "قطعه‌سازان",
  "/profile": "پروفایل",
  "/organization": "سازمان",
  "/admin": "مدیریت",
};

/** ترتیب اهمیت: سه بخش اول کنار «خانه» می‌آیند، بقیه در «بیشتر» */
const PRIORITY = ["/rfqs/open", "/rfqs", "/admin", "/quotations", "/orders", "/profile", "/suppliers", "/organization"];

function rank(href: string): number {
  const i = PRIORITY.indexOf(href);
  return i === -1 ? PRIORITY.length : i;
}

/** منوی پایین موبایل و تبلت، مثل اپ‌ها: خانه و سه کار اصلی نقش؛ بقیه در «بیشتر» */
export function MobileTabBar({ links }: { links: TabLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sorted = [...links].sort((a, b) => rank(a.href) - rank(b.href));
  const tabs = [{ href: "/dashboard", label: "خانه" }, ...sorted.slice(0, 3)];
  const more = sorted.slice(3);
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="منوی پایین"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 lg:hidden"
    >
      {open && more.length > 0 && (
        <div
          id="tab-more"
          className="mx-auto mb-2 flex max-w-md flex-col gap-1 rounded-3xl border bg-card/95 p-2 text-card-foreground shadow-soft backdrop-blur-md"
        >
          {more.map((link) => {
            const Icon = ICONS[link.href] ?? LayoutGrid;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(link.href) ? "page" : undefined}
                className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm hover:bg-accent"
              >
                <Icon className="h-5 w-5 text-primary" aria-hidden />
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
      <div className="mx-auto grid max-w-md auto-cols-fr grid-flow-col gap-1 rounded-full border bg-card/90 p-1.5 text-card-foreground shadow-[0_18px_34px_-16px_rgb(12_50_80/0.4)] backdrop-blur-md">
        {tabs.map((tab) => {
          const Icon = ICONS[tab.href] ?? LayoutGrid;
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors",
                active && "bg-secondary font-bold text-secondary-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {SHORT[tab.href] ?? tab.label}
            </Link>
          );
        })}
        {more.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="tab-more"
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors",
              open && "bg-secondary text-secondary-foreground",
            )}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden />
            بیشتر
          </button>
        )}
      </div>
    </nav>
  );
}
