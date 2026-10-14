import type { Metadata } from "next";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { ContractDocument } from "@/features/contracts/components/contract-document";
import { ContractView } from "@/features/contracts/components/contract-view";
import { MOCK_ORDERS } from "@/features/orders/mock";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "قرارداد سفارش",
  robots: { index: false },
};

// نسخه‌ی نمایشی (خروجی استاتیک): صفحه‌ی قرارداد سفارش‌های نمونه از پیش ساخته می‌شود.
// در نسخه‌ی سروری چیزی از پیش ساخته نمی‌شود و هر صفحه هنگام درخواست رندر می‌شود.
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
      {DEMO_MODE ? <ContractDocument orderId={id} /> : <ContractView orderId={id} />}
    </RequireAuth>
  );
}
