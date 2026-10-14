import type { Metadata } from "next";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { OrdersList } from "@/features/orders/components/orders-list";
import { OrdersView } from "@/features/orders/components/orders-view";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "سفارش‌ها",
  robots: { index: false },
};

export default function OrdersPage() {
  return <RequireAuth>{DEMO_MODE ? <OrdersList /> : <OrdersView />}</RequireAuth>;
}
