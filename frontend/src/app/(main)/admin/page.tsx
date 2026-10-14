import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { VerificationQueue } from "@/features/admin/components/verification-queue";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "مدیریت — صف تأیید مدارک",
  robots: { index: false },
};

export default function AdminVerificationsPage() {
  if (DEMO_MODE) {
    return <ComingSoon title="پنل مدیریت" description="در نسخه‌ی نمایشی فعال نیست." />;
  }
  return (
    <RequireAuth>
      <AdminShell>
        <VerificationQueue />
      </AdminShell>
    </RequireAuth>
  );
}
