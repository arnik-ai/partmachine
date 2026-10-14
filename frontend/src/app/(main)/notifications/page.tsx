import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { NotificationsView } from "@/features/notifications/components/notifications-view";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "اعلان‌ها",
  robots: { index: false },
};

export default function NotificationsPage() {
  return (
    <RequireAuth>
      {DEMO_MODE ? (
        <ComingSoon
          title="اعلان‌ها"
          description="در نسخه‌ی نمایشی سروری وصل نیست و اعلانی ساخته نمی‌شود."
          backHref="/dashboard"
          backLabel="بازگشت به داشبورد"
        />
      ) : (
        <NotificationsView />
      )}
    </RequireAuth>
  );
}
