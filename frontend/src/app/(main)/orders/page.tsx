import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { OrdersList } from "@/features/orders/components/orders-list";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "سفارش‌های من",
  robots: { index: false },
};

export default function OrdersPage() {
  return (
    <RequireAuth>
      {DEMO_MODE ? (
        <OrdersList />
      ) : (
        <ComingSoon
          title="سفارش‌ها به‌زودی"
          description="پس از انتخاب برنده، سفارش و مراحل تولید، کنترل کیفیت و تحویل در این بخش پیگیری می‌شود."
        />
      )}
    </RequireAuth>
  );
}
