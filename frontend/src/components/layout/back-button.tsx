"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { canGoBack, parentPath, recordVisit } from "@/lib/back";
import { cn } from "@/lib/utils";

/**
 * دکمه‌ی بازگشت روی همه‌ی صفحه‌ها (اندروید، آیفون و دسکتاپ؛ به‌خصوص اپ نصب‌شده‌ی آیفون که
 * دکمه‌ی برگشت مرورگر ندارد). در فارسی فلش به راست است و در انگلیسی به چپ.
 * fallback: صفحه‌ای که اگر تاریخچه‌ای در سایت نبود باز شود؛ null یعنی همان برگشت مرورگر.
 */
export function BackButton({
  label = "بازگشت",
  dir = "rtl",
  fallback,
  className,
}: {
  label?: string;
  dir?: "rtl" | "ltr";
  fallback?: string | null;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    recordVisit(pathname);
  }, [pathname]);

  function goBack() {
    if (canGoBack()) {
      router.back();
      return;
    }
    const target = fallback === undefined ? parentPath(pathname) : fallback;
    if (target && target !== pathname) router.push(target);
    else window.history.back();
  }

  const Icon = dir === "rtl" ? ArrowRight : ArrowLeft;
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-card text-primary shadow-soft transition-colors hover:bg-accent",
        className,
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}
