"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  Factory,
  FileSearch,
  Hourglass,
  Microscope,
  MessageSquareQuote,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications } from "@/features/notifications/api";
import { cn, faDateTime } from "@/lib/utils";
import { useDashboard } from "../api";
import type { StatKey } from "../types";
import { StatCard } from "./stat-card";

const STAT_META: Record<
  StatKey,
  { label: string; icon: React.ComponentType<{ className?: string }>; href: string }
> = {
  open_rfqs: { label: "درخواست‌های باز من", icon: ClipboardList, href: "/rfqs" },
  quotes_received: {
    label: "پیشنهادهای دریافتی روی درخواست‌های باز",
    icon: MessageSquareQuote,
    href: "/rfqs",
  },
  open_market_rfqs: { label: "درخواست‌های باز بازار", icon: FileSearch, href: "/rfqs/open" },
  active_quotes: { label: "پیشنهادهای فعال من", icon: MessageSquareQuote, href: "/quotations" },
  active_orders: { label: "سفارش‌های در جریان", icon: Factory, href: "/orders" },
  completed_orders: { label: "سفارش‌های تکمیل‌شده", icon: CheckCircle2, href: "/orders" },
  inspections_waiting: { label: "در انتظار آمادگی قطعه‌ساز", icon: Hourglass, href: "/orders" },
  inspections_ready: { label: "آماده‌ی بازرسی", icon: Microscope, href: "/orders" },
  inspections_passed: { label: "بازرسی‌های قبول‌شده", icon: CheckCircle2, href: "/orders" },
  pending_verifications: { label: "مدارک در انتظار بررسی", icon: ShieldCheck, href: "/admin" },
  open_disputes: { label: "اختلاف‌های در انتظار تصمیم", icon: Scale, href: "/admin/disputes" },
  unverified_accounts: {
    label: "حساب‌های در انتظار تأیید",
    icon: ShieldAlert,
    href: "/admin/users",
  },
  active_users: { label: "کاربران فعال", icon: Users, href: "/admin/users" },
};

/** آمار واقعی نقش کاربر؛ هر کارت به صفحه‌ی جزئیات همان عدد می‌رود */
export function LiveStats() {
  const { data, isLoading, isError, error, refetch } = useDashboard();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <ErrorState error={error} onRetry={() => refetch()} title="آمار داشبورد بارگذاری نشد" />;
  }
  if (!data || data.stats.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {data.stats.map((stat) => {
        const meta = STAT_META[stat.key];
        return (
          <StatCard
            key={stat.key}
            label={meta.label}
            value={stat.value}
            icon={meta.icon}
            href={meta.href}
          />
        );
      })}
    </div>
  );
}

const RECENT_COUNT = 5;

/** فعالیت‌های اخیر = آخرین اعلان‌های کاربر */
export function RecentNotifications({ className }: { className?: string }) {
  const { data, isLoading, isError, error, refetch } = useNotifications(0, false, RECENT_COUNT);

  return (
    <Card className={cn("rounded-2xl", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="h-5 w-1 rounded-full bg-gold" />
          فعالیت‌های اخیر
        </CardTitle>
        <CardDescription>آخرین رویدادهای مربوط به شما و سازمانتان</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} title="رویدادها بارگذاری نشد" />
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            هنوز رویدادی نیست؛ پیشنهادها، قراردادها و سفارش‌ها این‌جا دیده می‌شوند.
          </p>
        ) : (
          <>
            {data.items.map((item, i) => (
              <div
                key={item.id}
                className={cn("flex flex-col gap-0.5 py-3", i > 0 && "border-t border-border/60")}
              >
                {item.link ? (
                  <Link href={item.link} className="text-sm leading-relaxed hover:underline">
                    {item.title}
                  </Link>
                ) : (
                  <p className="text-sm leading-relaxed">{item.title}</p>
                )}
                <span className="text-xs text-muted-foreground">
                  {faDateTime(item.createdAt)}
                </span>
              </div>
            ))}
            <Link
              href="/notifications"
              className="pt-2 text-sm text-primary hover:underline"
            >
              همه‌ی اعلان‌ها
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
