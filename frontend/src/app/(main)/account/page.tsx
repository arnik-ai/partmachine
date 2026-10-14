import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";
import { AccountView } from "@/features/account/components/account-view";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "حساب کاربری",
  robots: { index: false },
};

export default function AccountPage() {
  return (
    <RequireAuth>
      {DEMO_MODE ? (
        <ComingSoon
          title="حساب کاربری"
          description="در نسخه‌ی نمایشی فعال نیست؛ در نسخه‌ی اصلی رمز عبور و شماره‌ی موبایل از این صفحه مدیریت می‌شوند."
        />
      ) : (
        <AccountView />
      )}
    </RequireAuth>
  );
}
