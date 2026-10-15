import type { MetadataRoute } from "next";
import { DEMO_MODE, SITE_URL } from "@/lib/config";

// در build نمایشی (خروجی استاتیک) هم یک فایل ثابت ساخته می‌شود
export const dynamic = "force-static";

/** صفحه‌ی اول و راهنمای llms.txt برای موتورهای جستجو باز است؛ بخش‌های پس از ورود نه */
export default function robots(): MetadataRoute.Robots {
  // نسخه‌ی نمایشی داده‌ی نمونه دارد
  if (DEMO_MODE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/admin",
        "/dashboard",
        "/notifications",
        "/orders",
        "/organization",
        "/profile",
        "/quotations",
        "/rfqs",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
