import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { AuditLog } from "@/features/admin/components/audit-log";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "مدیریت — رویدادها",
  robots: { index: false },
};

export default function AdminAuditPage() {
  if (DEMO_MODE) {
    return <ComingSoon title="پنل مدیریت" description="در نسخه‌ی نمایشی فعال نیست." />;
  }
  return (
    <RequireAuth>
      <AdminShell>
        <AuditLog />
      </AdminShell>
    </RequireAuth>
  );
}
