import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { ContractDocument } from "@/features/contracts/components/contract-document";
import { MOCK_ORDERS } from "@/features/orders/mock";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "قرارداد سفارش",
  robots: { index: false },
};

// نسخه‌ی نمایشی (خروجی استاتیک): صفحه‌ی قرارداد سفارش‌های نمونه از پیش ساخته می‌شود.
// در نسخه‌ی سروری این بخش هنوز فعال نیست و چیزی از پیش ساخته نمی‌شود.
export function generateStaticParams() {
  return DEMO_MODE ? MOCK_ORDERS.map((o) => ({ id: o.id })) : [];
}

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireAuth>
      {DEMO_MODE ? (
        <ContractDocument orderId={id} />
      ) : (
        <ComingSoon
          title="قرارداد آنلاین به‌زودی"
          description="تنظیم و پذیرش قرارداد پس از تأیید حقوقی متن و فرآیند امضا فعال می‌شود."
        />
      )}
    </RequireAuth>
  );
}
