/**
 * مسیر بازگشت پس از ورود (`?next=`). فقط مسیرهای داخلی همین سایت پذیرفته می‌شوند تا
 * لینک ورود نتواند کاربر را به سایت دیگری بفرستد (open redirect).
 */
export function safeNextPath(search: string, fallback = "/dashboard"): string {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/")) return fallback;
  // مرورگر هنگام ساختن آدرس، tab و خط تازه را حذف و «\» را «/» می‌کند؛ پس «/\t/evil.example» همان
  // «//evil.example» است. آدرس با همان تجزیه‌گر مرورگر ساخته و فقط وقتی پذیرفته می‌شود که در همین سایت بماند.
  const base = "https://same-site.invalid";
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
