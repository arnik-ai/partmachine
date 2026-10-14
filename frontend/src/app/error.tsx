"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

/**
 * خطای پیش‌بینی‌نشده هنگام نمایش صفحه: پیام فارسی و دکمه‌ی «تلاش دوباره»،
 * بدون نمایش جزئیات فنی به کاربر.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <ErrorState error={error} onRetry={reset} title="مشکلی در نمایش این صفحه پیش آمد" />
    </main>
  );
}
