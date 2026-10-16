"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_MODE } from "@/lib/config";
import { useAuthStore } from "../store";

/**
 * صفحات خصوصی را فقط برای کاربر واردشده نمایش می‌دهد؛ در غیر این صورت به صفحه‌ی ورود
 * (با بازگشت به همین صفحه) هدایت می‌کند. این فقط برای تجربه‌ی کاربری است — مرز امنیتی
 * واقعی در بک‌اند است. در نسخه‌ی نمایشی همه‌ی صفحات آزادند.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!DEMO_MODE && status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`);
    }
  }, [status, router, pathname]);

  if (DEMO_MODE || status === "authenticated") return <>{children}</>;
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-40" />
    </div>
  );
}
