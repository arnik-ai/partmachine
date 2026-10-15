/**
 * تنظیمات زمان build (متغیرهای NEXT_PUBLIC_* در bundle جاسازی می‌شوند).
 *
 * - NEXT_PUBLIC_API_URL: آدرس API بک‌اند (پیش‌فرض: بک‌اند محلی روی پورت 8100)
 * - NEXT_PUBLIC_DEMO_MODE: فقط برای نسخه‌ی نمایشی (GitHub Pages) «true» می‌شود؛
 *   در هر حالت دیگری هیچ داده‌ی ساختگی نمایش داده نمی‌شود.
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8100/api/v1";

/** آیا آدرس API صراحتاً تنظیم شده است؟ (در دموی بدون بک‌اند هیچ درخواستی ارسال نمی‌شود) */
export const API_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_API_URL);

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** مسیر پایه (فقط نسخه‌ی نمایشی: /partmachine)؛ برای آدرس service worker */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
