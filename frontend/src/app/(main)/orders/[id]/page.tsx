import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { OrderDetailView } from "@/features/orders/components/order-detail";
import { MOCK_ORDERS } from "@/features/orders/mock";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "جزئیات سفارش",
  robots: { index: false },
};

// نسخه‌ی نمایشی (خروجی استاتیک): صفحه‌ی سفارش‌های نمونه از پیش ساخته می‌شود.
// در نسخه‌ی سروری چیزی از پیش ساخته نمی‌شود و هر صفحه هنگام درخواست رندر می‌شود.
export function generateStaticParams() {
  return DEMO_MODE ? MOCK_ORDERS.map((o) => ({ id: o.id })) : [];
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      {DEMO_MODE ? (
        <ComingSoon
          title="جزئیات سفارش"
          description="در نسخه‌ی نمایشی، مراحل هر سفارش در صفحه‌ی «سفارش‌ها» دیده می‌شود."
          backHref="/orders"
          backLabel="بازگشت به سفارش‌ها"
        />
      ) : (
        <OrderDetailView orderId={id} />
      )}
    </RequireAuth>
  );
}
