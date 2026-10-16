"use client";

import Link from "next/link";
import {
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
  ShieldAlert,
  UserPlus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
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
import { ProductGallery } from "@/features/suppliers/components/product-gallery";
import { useMySupplier } from "@/features/suppliers/hooks";
import { useMyVerification } from "@/features/verification/api";
import { useAuthStore } from "@/features/auth/store";
import { DEMO_MODE } from "@/lib/config";
import { roleLabel, type RoleValue } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";
import { initialOf } from "@/features/suppliers/avatar";
import { ServicesRow, SupplierStrip } from "./discover";
import { InstallCard } from "./install-card";
import { LiveStats, RecentNotifications } from "./live-stats";
import { StatCard, type StatCardProps } from "./stat-card";
import { TipsCarousel } from "./tips-carousel";

/** آمار نمایشی هر نقش — فقط نسخه‌ی نمایشی؛ نسخه‌ی واقعی از API می‌خواند (LiveStats) */
const ROLE_STATS: Record<string, StatCardProps[]> = {
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
    { label: "امتیاز اعتماد", value: 92, icon: ShieldCheck },
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
  /** بخش‌هایی که هنوز به سرور وصل نشده‌اند فقط در نسخه‌ی نمایشی دیده می‌شوند */
  demoOnly?: boolean;
}

/** برای همه‌ی نقش‌ها: مدیر سازمان همکارانش را با لینک دعوت اضافه می‌کند */
const ORGANIZATION_ACTION: QuickAction = {
  href: "/organization",
  label: "اعضای سازمان",
  description: "دعوت همکاران با لینک و مدیریت اعضا",
  icon: UserPlus,
};

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
      description: "پیگیری وضعیت درخواست‌ها و پیشنهادهای دریافتی",
      icon: ClipboardList,
    },
    {
      href: "/orders",
      label: "رهگیری سفارش‌ها",
      description: "مرحله‌ی فعلی هر سفارش: قرارداد، تولید، ارسال و تحویل",
      icon: PackageSearch,
    },
  ],
  supplier: [
    {
      href: "/rfqs/open",
      label: "درخواست‌های باز",
      description: "درخواست‌هایی که هنوز پیشنهاد قیمت می‌پذیرند",
      icon: FileSearch,
    },
    {
      href: "/quotations",
      label: "پیشنهادهای من",
      description: "وضعیت پیشنهادها و نتیجه‌ی هر کدام",
      icon: MessageSquareQuote,
    },
    {
      href: "/orders",
      label: "سفارش‌های در دست اجرا",
      description: "قرارداد، ارسال و تحویل سفارش‌هایی که برنده شده‌اید",
      icon: PackageSearch,
    },
    {
      href: "/profile",
      label: "پروفایل و تأیید شرکت",
      description: "اطلاعات شرکت، گالری نمونه‌کار و مدارک تأیید",
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
  admin: [
    {
      href: "/admin",
      label: "صف تأیید مدارک",
      description: "بررسی مدارک قطعه‌سازها و تأیید یا رد با ذکر دلیل",
      icon: ShieldCheck,
    },
    {
      href: "/admin/disputes",
      label: "اختلاف‌ها",
      description: "بررسی مشکل‌های اعلام‌شده و تصمیم با ذکر دلیل",
      icon: ShieldAlert,
    },
    {
      href: "/admin/users",
      label: "کاربران",
      description: "جستجو، فعال یا غیرفعال کردن و تأیید حساب‌ها",
      icon: Users,
    },
    {
      href: "/admin/audit",
      label: "رویدادها",
      description: "گزارش اقدام‌های مهم و امنیتی",
      icon: ClipboardList,
    },
  ],
  qc: [
    {
      href: "/orders",
      label: "سفارش‌های بازرسی",
      description: "سفارش‌هایی که کارفرما شما را برای بازرسی کیفیتشان انتخاب کرده است",
      icon: ClipboardList,
    },
    {
      href: "/suppliers",
      label: "مشاهده‌ی قطعه‌سازان",
      description: "فهرست قطعه‌سازان و توانمندی‌ها",
      icon: Search,
    },
  ],
};

/** فعالیت‌های اخیر نمایشی — فقط نسخه‌ی نمایشی؛ نسخه‌ی واقعی آخرین اعلان‌ها را نشان می‌دهد */
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

/** دکمه‌ی گرد کار اصلی هر نقش در کارت سلام */
const PRIMARY_ACTION: Partial<
  Record<string, { href: string; label: string; icon: React.ComponentType<{ className?: string }> }>
> = {
  buyer: { href: "/rfqs/new", label: "درخواست تازه", icon: Plus },
  agent: { href: "/rfqs/new", label: "درخواست تازه", icon: Plus },
  supplier: { href: "/rfqs/open", label: "دیدن درخواست‌های باز بازار", icon: Search },
};

export function DashboardView() {
  const { user, isDemo } = useAuthStore();
  // در نسخه‌ی نمایشی کاربر از localStorage می‌آید؛ قبل از hydration چیزی رندر نمی‌شود
  const hydrated = useHydrated();

  if (!hydrated) return null;

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
  const actions = [
    ...(QUICK_ACTIONS[role] ?? QUICK_ACTIONS.buyer),
    // ادمین سازمان مشتری ندارد؛ بقیه همکارانشان را دعوت می‌کنند
    ...(role === "admin" ? [] : [ORGANIZATION_ACTION]),
  ].filter((action) => DEMO_MODE || !action.demoOnly);
  const activity = RECENT_ACTIVITY[role] ?? RECENT_ACTIVITY.buyer;
  // ثبت‌نام مأمور خرید و آزمایشگاه آزاد است ولی تا تأیید پلتفرم «تأییدنشده» نمایش داده می‌شود (D4)
  const unverified =
    !isDemo && user.verified === false && (role === "agent" || role === "qc");

  const primary = PRIMARY_ACTION[role];

  return (
    <div className="flex flex-col gap-6">
      {/* کارت سلام: کپسولی، با دکمه‌ی گرد کار اصلی نقش (مثل اپ‌های موبایل) */}
      <section className="relative overflow-hidden rounded-[2rem] border bg-card p-4 text-card-foreground shadow-soft sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[repeating-radial-gradient(circle_at_10%_-30%,transparent_0_24px,rgb(14_165_233/0.07)_24px_25.5px)] [mask-image:linear-gradient(to_bottom,#000,transparent)]"
        />
        <div className="relative flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-sky-600 text-lg font-bold text-white ring-4 ring-secondary"
          >
            {initialOf(user.fullName)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="truncate text-lg font-bold sm:text-xl">سلام، {user.fullName} 👋</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              {roleLabel(role)}
              {/* بدون نام شرکت، نام سازمان همان نام کاربر است؛ تکرارش نمی‌کنیم */}
              {user.companyName && user.companyName !== user.fullName ? ` — ${user.companyName}` : ""}
            </p>
          </div>
          {primary && (
            <Link
              href={primary.href}
              aria-label={primary.label}
              title={primary.label}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-sky-500 text-sky-950 shadow-[0_8px_16px_-8px_rgb(2_132_199)] transition-transform active:scale-95"
            >
              <primary.icon className="h-5 w-5" aria-hidden />
            </Link>
          )}
        </div>
        {(unverified || isDemo) && (
          <div className="relative mt-3 flex flex-wrap gap-2">
            {unverified && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-xs font-medium text-gold">
                <ShieldAlert className="h-3.5 w-3.5" />
                حساب تأییدنشده
              </span>
            )}
            {isDemo && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-xs font-medium text-gold">
                <Sparkles className="h-3.5 w-3.5" />
                حالت دمو — بک‌اند متصل نیست
              </span>
            )}
          </div>
        )}
        {unverified && (
          <p className="relative mt-2 text-xs text-muted-foreground">
            حساب شما هنوز توسط تراشینو تأیید نشده است؛ کارشناسان ما پس از بررسی، آن را تأیید می‌کنند.
          </p>
        )}
      </section>

      <InstallCard />

      {role === "supplier" && !DEMO_MODE && <SupplierProfileReminder />}

      {/* کارت‌های آمار: نسخه‌ی واقعی از API؛ نسخه‌ی نمایشی داده‌ی نمونه */}
      {DEMO_MODE ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      ) : (
        <LiveStats />
      )}

      {/* دسترسی سریع: کاشی‌های آیکن‌دار */}
      <section aria-labelledby="quick-actions" className="flex flex-col gap-3">
        <h2 id="quick-actions" className="text-base font-bold">
          دسترسی سریع
        </h2>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-6">
          {actions.map((action) => (
            <Link
              key={action.href + action.label}
              href={action.href}
              title={action.description}
              className="group flex flex-col items-center gap-2 text-center text-[11px] font-medium leading-snug sm:text-sm"
            >
              <span className="grid aspect-square w-full max-w-20 place-items-center rounded-[1.4rem] border bg-card shadow-soft transition-transform group-hover:-translate-y-0.5 group-active:scale-95">
                <action.icon className="h-[38%] w-[38%] fill-sky-100 text-sky-600" aria-hidden />
              </span>
              {action.label}
            </Link>
          ))}
        </div>
      </section>

      {role !== "admin" && <TipsCarousel role={role} />}

      {(role === "buyer" || role === "agent") && (
        <>
          <SupplierStrip />
          <ServicesRow />
        </>
      )}

      {/* فعالیت‌های اخیر: نسخه‌ی واقعی آخرین اعلان‌ها؛ نسخه‌ی نمایشی داده‌ی نمونه */}
      {!DEMO_MODE && <RecentNotifications className="rounded-3xl" />}
      {DEMO_MODE && (
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-primary" />
              فعالیت‌های اخیر
            </CardTitle>
            <CardDescription>آخرین رویدادهای حساب شما</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {activity.map((item, i) => (
              <div
                key={i}
                className={cn("flex items-start gap-3 py-3", i > 0 && "border-t border-border/60")}
              >
                <div className="mt-0.5 rounded-full bg-secondary p-1.5 text-primary">
                  <item.icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm leading-relaxed">{item.text}</p>
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* گالری محصولات — فقط برای قطعه‌ساز */}
      {role === "supplier" && (
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Images className="h-5 w-5 text-primary" />
              گالری محصولات من
            </CardTitle>
            <CardDescription>
              عکس نمونه‌کارها و محصولات‌تان را اضافه کنید — در پروفایل عمومی شما
              به کارفرمایان نمایش داده می‌شود.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {DEMO_MODE ? (
              <ProductGallery />
            ) : (
              <Link href="/profile" className={buttonVariants({ variant: "outline" })}>
                <Images className="h-4 w-4" aria-hidden />
                مدیریت گالری در پروفایل شرکت
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** یادآوری قدم بعدی قطعه‌ساز: تکمیل پروفایل (برای دیده شدن)، سپس ارسال مدارک (برای نشان تأیید) */
function SupplierProfileReminder() {
  const { data: supplier } = useMySupplier();
  const { data: verification } = useMyVerification(Boolean(supplier?.listed && !supplier.verified));
  if (!supplier || supplier.verified) return null;
  const [message, action] = !supplier.listed
    ? ["پروفایل شرکت شما کامل نیست و در فهرست قطعه‌سازها دیده نمی‌شود.", "تکمیل پروفایل"]
    : verification?.status === "pending"
      ? ["مدارک شرکت شما در حال بررسی است.", "مشاهده‌ی وضعیت"]
      : [
          "برای جلب اعتماد کارفرماها، مدارک شرکت را برای دریافت نشان «تأییدشده» بفرستید.",
          "ارسال مدارک",
        ];
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-gold/50 bg-card p-4 text-sm text-card-foreground shadow-soft"
    >
      <span className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 shrink-0 text-gold" aria-hidden />
        {message}
      </span>
      <Link href="/profile" className={buttonVariants({ size: "sm" })}>
        {action}
      </Link>
    </div>
  );
}
