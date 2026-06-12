"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpLeft,
  Bell,
  CheckCircle2,
  ClipboardList,
  Factory,
  FileSearch,
  Images,
  MessageSquareQuote,
  PackageSearch,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StarRating, scoreToStars } from "@/components/ui/star-rating";
import { ProductGallery } from "@/features/suppliers/components/product-gallery";
import { useAuthStore } from "@/features/auth/store";
import { roleLabel, type RoleValue } from "@/lib/constants";
import { cn, faNumber } from "@/lib/utils";

interface StatItem {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  /** اگر true، مقدار ۰–۱۰۰ به‌صورت ستاره نمایش داده می‌شود */
  asStars?: boolean;
  trend?: string;
}

/** آمار نمایشی هر نقش — در افزایش ۲ از API خوانده می‌شود */
const ROLE_STATS: Record<string, StatItem[]> = {
  buyer: [
    { label: "RFQ فعال", value: 2, icon: ClipboardList, trend: "+۱ این هفته" },
    {
      label: "استعلام دریافتی",
      value: 5,
      icon: MessageSquareQuote,
      trend: "+۳ جدید",
    },
    { label: "سفارش در حال تولید", value: 1, icon: Factory },
    { label: "موجودی کیف پول (تومان)", value: 0, icon: Wallet },
  ],
  supplier: [
    {
      label: "RFQ منطبق با شما",
      value: 7,
      icon: FileSearch,
      trend: "+۲ امروز",
    },
    { label: "استعلام ارسالی", value: 3, icon: MessageSquareQuote },
    { label: "سفارش فعال", value: 1, icon: Factory },
    { label: "امتیاز اعتماد", value: 92, icon: ShieldCheck, asStars: true },
  ],
  agent: [
    { label: "پروژه‌ی خرید فعال", value: 4, icon: ClipboardList },
    {
      label: "استعلام در حال مقایسه",
      value: 9,
      icon: MessageSquareQuote,
      trend: "+۴ جدید",
    },
    { label: "مذاکره‌ی باز", value: 2, icon: FileSearch },
    {
      label: "سفارش نهایی‌شده",
      value: 12,
      icon: CheckCircle2,
      trend: "+۲ این ماه",
    },
  ],
  qc: [
    {
      label: "درخواست بازرسی جدید",
      value: 3,
      icon: Bell,
      trend: "+۱ امروز",
    },
    { label: "بازرسی در حال انجام", value: 2, icon: ClipboardList },
    { label: "گزارش صادرشده", value: 28, icon: CheckCircle2 },
    { label: "امتیاز آزمایشگاه", value: 88, icon: ShieldCheck, asStars: true },
  ],
};

interface QuickAction {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const QUICK_ACTIONS: Record<string, QuickAction[]> = {
  buyer: [
    {
      href: "/rfqs/new",
      label: "ثبت RFQ جدید",
      description: "آپلود نقشه و دریافت استعلام قیمت",
      icon: Plus,
    },
    {
      href: "/suppliers",
      label: "جستجوی قطعه‌ساز",
      description: "فیلتر بر اساس خدمت، شهر و امتیاز",
      icon: Search,
    },
    {
      href: "/rfqs",
      label: "درخواست‌های من",
      description: "پیگیری وضعیت و مقایسه‌ی استعلام‌ها",
      icon: ClipboardList,
    },
    {
      href: "/orders",
      label: "رهگیری سفارش‌ها",
      description: "مرحله‌ی فعلی هر سفارش: تولید، QC، ارسال...",
      icon: PackageSearch,
    },
  ],
  supplier: [
    {
      href: "/rfqs",
      label: "RFQهای باز",
      description: "درخواست‌های منطبق با توانمندی شما",
      icon: FileSearch,
    },
    {
      href: "/orders",
      label: "سفارش‌های در دست اجرا",
      description: "وضعیت تولید و تسویه‌ی امانی",
      icon: PackageSearch,
    },
    {
      href: "/suppliers",
      label: "پروفایل عمومی من",
      description: "نمایش توانمندی‌ها و ماشین‌آلات",
      icon: Factory,
    },
  ],
  agent: [
    {
      href: "/suppliers",
      label: "مقایسه‌ی تأمین‌کننده",
      description: "جستجو، مقایسه و انتخاب بهترین",
      icon: Search,
    },
    {
      href: "/rfqs/new",
      label: "ثبت RFQ برای کارفرما",
      description: "مدیریت فرآیند خرید",
      icon: Plus,
    },
  ],
  qc: [
    {
      href: "/dashboard",
      label: "درخواست‌های بازرسی",
      description: "بازرسی ابعادی، متریال و جوش",
      icon: ClipboardList,
    },
  ],
};

/** فعالیت‌های اخیر نمایشی — در افزایش ۲ از API خوانده می‌شود */
const RECENT_ACTIVITY: Record<
  string,
  {
    text: string;
    time: string;
    icon: React.ComponentType<{ className?: string }>;
  }[]
> = {
  buyer: [
    {
      text: "استعلام جدید برای «فلنج استیل ۳۰۴» از صنایع دقیق‌تراش آریا دریافت شد",
      time: "۲ ساعت پیش",
      icon: MessageSquareQuote,
    },
    {
      text: "RFQ «قالب تزریق بدنه» منتشر شد و برای ۱۲ قطعه‌ساز منطبق ارسال شد",
      time: "دیروز",
      icon: TrendingUp,
    },
    {
      text: "گزارش بازرسی QC سفارش قبلی تأیید شد",
      time: "۳ روز پیش",
      icon: CheckCircle2,
    },
  ],
  supplier: [
    {
      text: "RFQ جدید منطبق با توانمندی CNC شما ثبت شد",
      time: "۱ ساعت پیش",
      icon: FileSearch,
    },
    {
      text: "استعلام شما برای «فلنج استیل ۳۰۴» مشاهده شد",
      time: "۵ ساعت پیش",
      icon: MessageSquareQuote,
    },
    {
      text: "امتیاز اعتماد شما ۲ واحد افزایش یافت",
      time: "این هفته",
      icon: TrendingUp,
    },
  ],
  agent: [
    {
      text: "۳ استعلام جدید برای پروژه‌ی خرید شماره ۴ دریافت شد",
      time: "امروز",
      icon: MessageSquareQuote,
    },
    {
      text: "مذاکره با قالب‌سازان پیشرو اصفهان به‌روزرسانی شد",
      time: "دیروز",
      icon: TrendingUp,
    },
  ],
  qc: [
    {
      text: "درخواست بازرسی ابعادی جدید از سفارش #۱۰۲۴ دریافت شد",
      time: "امروز",
      icon: Bell,
    },
    {
      text: "گزارش تست سختی‌سنجی سفارش #۱۰۱۹ صادر شد",
      time: "دیروز",
      icon: CheckCircle2,
    },
  ],
};

export function DashboardView() {
  const { user, isDemo } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  if (!user) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-muted-foreground">
            برای مشاهده‌ی داشبورد ابتدا وارد شوید.
          </p>
          <Link href="/login" className={buttonVariants()}>
            ورود به حساب
          </Link>
        </CardContent>
      </Card>
    );
  }

  const role: RoleValue = user.role;
  const stats = ROLE_STATS[role] ?? ROLE_STATS.buyer;
  const actions = QUICK_ACTIONS[role] ?? QUICK_ACTIONS.buyer;
  const activity = RECENT_ACTIVITY[role] ?? RECENT_ACTIVITY.buyer;

  return (
    <div className="flex flex-col gap-6">
      {/* بنر خوش‌آمد — سورمه‌ای با لمسه‌های طلایی */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary-deep via-primary to-primary p-6 text-primary-foreground shadow-lg ring-1 ring-white/15 sm:p-8">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">سلام، {user.fullName} 👋</h1>
            <p className="text-sm text-primary-foreground/80">
              {roleLabel(role)}
              {user.companyName ? ` — ${user.companyName}` : ""}
            </p>
            <div className="mt-1 h-1 w-16 rounded-full bg-gold" />
          </div>
          <div className="flex flex-col items-end gap-2">
            {isDemo && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-gold/15 px-3 py-1 text-xs font-medium text-gold-soft">
                <Sparkles className="h-3.5 w-3.5" />
                حالت دمو — بک‌اند متصل نیست
              </span>
            )}
          </div>
        </div>
        {/* المان‌های تزئینی */}
        <Factory className="absolute -left-6 -bottom-8 h-44 w-44 rotate-12 text-white/[0.06]" />
        <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-gold/15 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      </div>

      {/* کارت‌های آمار */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="group relative overflow-hidden rounded-2xl border-border/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10"
          >
            {/* نوار طلایی بالای کارت */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-gold via-gold/60 to-transparent opacity-70 transition-opacity group-hover:opacity-100" />
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-primary/[0.08] p-2.5 text-primary ring-1 ring-primary/10 transition-transform duration-300 group-hover:scale-110">
                  <stat.icon className="h-5 w-5" />
                </div>
                {stat.trend && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">
                    <TrendingUp className="h-3 w-3" />
                    {stat.trend}
                  </span>
                )}
              </div>
              <div>
                {stat.asStars ? (
                  <StarRating value={scoreToStars(stat.value)} />
                ) : (
                  <div className="text-3xl font-bold tracking-tight">
                    {faNumber(stat.value)}
                  </div>
                )}
                <div className="mt-1 text-xs text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* دسترسی سریع */}
        <Card className="rounded-2xl lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-gold" />
              دسترسی سریع
            </CardTitle>
            <CardDescription>کارهای پرتکرار نقش شما</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {actions.map((action) => (
              <Link
                key={action.href + action.label}
                href={action.href}
                className="group flex items-start gap-3 rounded-xl border p-4 transition-all hover:border-gold/60 hover:bg-gold-soft/30 hover:shadow-sm"
              >
                <div className="rounded-lg bg-primary/[0.08] p-2.5 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground">
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    {action.label}
                    <ArrowUpLeft className="h-3.5 w-3.5 text-gold opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {action.description}
                  </span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* فعالیت‌های اخیر */}
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-gold" />
              فعالیت‌های اخیر
            </CardTitle>
            <CardDescription>آخرین رویدادهای حساب شما</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {activity.map((item, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-3 py-3",
                  i > 0 && "border-t border-border/60",
                )}
              >
                <div className="mt-0.5 rounded-full bg-gold-soft p-1.5 text-gold">
                  <item.icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm leading-relaxed">{item.text}</p>
                  <span className="text-xs text-muted-foreground">
                    {item.time}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* گالری محصولات — فقط برای قطعه‌ساز، مانند دیوار */}
      {role === "supplier" && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-gold" />
              <Images className="h-5 w-5 text-primary" />
              گالری محصولات من
            </CardTitle>
            <CardDescription>
              عکس نمونه‌کارها و محصولات‌تان را اضافه کنید — در پروفایل عمومی شما
              به کارفرمایان نمایش داده می‌شود.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProductGallery />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
