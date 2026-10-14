import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { OrganizationView } from "@/features/organization/components/organization-view";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "سازمان من",
  robots: { index: false },
};

export default function OrganizationPage() {
  return (
    <RequireAuth>
      {DEMO_MODE ? (
        <ComingSoon
          title="مدیریت اعضای سازمان"
          description="در نسخه‌ی نمایشی فعال نیست؛ در نسخه‌ی اصلی، مدیر سازمان همکارانش را با لینک دعوت اضافه می‌کند."
        />
      ) : (
        <OrganizationView />
      )}
    </RequireAuth>
  );
}
