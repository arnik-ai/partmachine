import { DEMO_MODE } from "@/lib/config";

/** در نسخه‌ی نمایشی همیشه به کاربر یادآوری می‌کند که داده‌ها واقعی نیستند. */
export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div
      role="status"
      className="bg-warning px-4 py-2 text-center text-sm font-medium text-black"
    >
      نسخه‌ی نمایشی — همه‌ی داده‌ها نمونه‌اند و هیچ اطلاعاتی ثبت یا ارسال نمی‌شود.
    </div>
  );
}
