import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { CompanyProfile } from "@/features/suppliers/components/company-profile";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "پروفایل شرکت",
  robots: { index: false },
};

export default function CompanyProfilePage() {
  return (
    <RequireAuth>
      {DEMO_MODE ? (
        <ComingSoon
          title="پروفایل شرکت و تأیید هویت"
          description="در نسخه‌ی نمایشی فعال نیست؛ در نسخه‌ی اصلی، قطعه‌ساز پروفایل و گالری نمونه‌کارش را ویرایش می‌کند و مدارک را برای تأیید هویت می‌فرستد."
        />
      ) : (
        <CompanyProfile />
      )}
    </RequireAuth>
  );
}
