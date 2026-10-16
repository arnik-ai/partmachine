/**
 * دکمه‌ی بازگشت: اگر داخل خود سایت جابه‌جا شده‌ایم، همان صفحه‌ی قبلی؛ وگرنه (صفحه مستقیم باز شده،
 * مثلاً از لینک یا اپ نصب‌شده‌ی آیفون که دکمه‌ی برگشت ندارد) صفحه‌ی والد.
 */

/** مسیرهای بازدیدشده در همین سایت؛ با بارگذاری کامل صفحه از نو شروع می‌شود */
const visits: string[] = [];

export function recordVisit(path: string): void {
  if (visits[visits.length - 1] === path) return;
  // برگشتن به صفحه‌ی قبلی (با دکمه‌ی بازگشت یا مرورگر) یک قدم از تاریخچه کم می‌کند
  if (visits[visits.length - 2] === path) visits.pop();
  else visits.push(path);
}

export function canGoBack(): boolean {
  return visits.length > 1;
}

/** فقط برای آزمون */
export function resetVisits(): void {
  visits.length = 0;
}

const PARENTS: Record<string, string> = {
  "/dashboard": "/",
  "/rfqs/open": "/dashboard",
  "/rfqs/new": "/rfqs",
};

/** صفحه‌ی والد هر مسیر: یک بخش بالاتر، و برای صفحه‌های اصلی پلتفرم داشبورد */
export function parentPath(pathname: string): string {
  const known = PARENTS[pathname];
  if (known) return known;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return "/dashboard";
  return `/${parts.slice(0, -1).join("/")}`;
}
