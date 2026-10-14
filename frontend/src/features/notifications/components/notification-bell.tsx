"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn, faNumber } from "@/lib/utils";
import { useUnreadCount } from "../api";

/** زنگوله‌ی سربرگ با تعداد اعلان‌های خوانده‌نشده؛ به صفحه‌ی «اعلان‌ها» می‌رود */
export function NotificationBell() {
  const { data } = useUnreadCount(true);
  const unread = data?.unread ?? 0;
  const label = unread > 0 ? `اعلان‌ها — ${faNumber(unread)} خوانده‌نشده` : "اعلان‌ها";

  return (
    <Link
      href="/notifications"
      aria-label={label}
      title={label}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 left-0 min-w-[1.15rem] rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-[1.15rem] text-white"
        >
          {unread > 99 ? "۹۹+" : faNumber(unread)}
        </span>
      )}
    </Link>
  );
}
