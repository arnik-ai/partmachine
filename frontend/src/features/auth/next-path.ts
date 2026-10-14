/**
 * مسیر بازگشت پس از ورود (`?next=`). فقط مسیرهای داخلی همین سایت پذیرفته می‌شوند تا
 * لینک ورود نتواند کاربر را به سایت دیگری بفرستد (open redirect).
 */
export function safeNextPath(search: string, fallback = "/dashboard"): string {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/")) return fallback;
  // «//host» و «/\host» در مرورگر به دامنه‌ی دیگری اشاره می‌کنند
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
