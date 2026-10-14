"use client";

import Link from "next/link";
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
import { StarRating, scoreToStars } from "@/components/ui/star-rating";
import { ProductGallery } from "@/features/suppliers/components/product-gallery";
import { useMySupplier } from "@/features/suppliers/hooks";
import { useMyVerification } from "@/features/verification/api";
import { useAuthStore } from "@/features/auth/store";
import { DEMO_MODE } from "@/lib/config";
import { roleLabel, type RoleValue } from "@/lib/constants";
import { cn, faNumber } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";

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
      description: "مرحله‌ی فعلی هر سفارش: تولید، QC، ارسال...",
      icon: PackageSearch,
      demoOnly: true,
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
      description: "وضعیت تولید و تسویه‌ی امانی",
      icon: PackageSearch,
      demoOnly: true,
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
      href: "/dashboard",
      label: "درخواست‌های بازرسی",
      description: "بازرسی ابعادی، متریال و جوش",
      icon: ClipboardList,
      demoOnly: true,
    },
    {
      href: "/suppliers",
      label: "مشاهده‌ی قطعه‌سازان",
      description: "فهرست قطعه‌سازان و توانمندی‌ها",
      icon: Search,
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

  return (
    <div className="flex flex-col gap-6">
      {/* بنر خوش‌آمد — سورمه‌ای با لمسه‌های طلایی */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary-deep via-primary to-primary p-6 text-primary-foreground shadow-lg ring-1 ring-white/15 sm:p-8">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">سلام، {user.fullName} 👋</h1>
            <p className="text-sm text-primary-foreground/80">
              {roleLabel(role)}
              {/* بدون نام شرکت، نام سازمان همان نام کاربر است؛ تکرارش نمی‌کنیم */}
              {user.companyName && user.companyName !== user.fullName
                ? ` — ${user.companyName}`
                : ""}
            </p>
            {unverified && (
              <p className="text-xs text-primary-foreground/75">
                حساب شما هنوز توسط پارت‌ماشین تأیید نشده است؛ کارشناسان ما پس از بررسی، آن را تأیید می‌کنند.
              </p>
            )}
            <div className="mt-1 h-1 w-16 rounded-full bg-gold" />
          </div>
          <div className="flex flex-col items-end gap-2">
            {unverified && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-gold/15 px-3 py-1 text-xs font-medium text-gold-soft">
                <ShieldAlert className="h-3.5 w-3.5" />
                حساب تأییدنشده
              </span>
            )}
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

      {role === "supplier" && !DEMO_MODE && <SupplierProfileReminder />}

      {/* کارت‌های آمار — داده‌ی نمونه؛ فقط در نسخه‌ی نمایشی */}
      {DEMO_MODE && (
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
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* دسترسی سریع */}
        <Card className={cn("rounded-2xl", DEMO_MODE ? "lg:col-span-3" : "lg:col-span-5")}>
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

        {/* فعالیت‌های اخیر — داده‌ی نمونه؛ فقط در نسخه‌ی نمایشی */}
        {DEMO_MODE && (
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
        )}
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
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/50 bg-card p-4 text-sm text-card-foreground"
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
