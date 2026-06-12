import type { Metadata } from "next";
import { OrdersList } from "@/features/orders/components/orders-list";

export const metadata: Metadata = {
  title: "سفارش‌های من",
};

export default function OrdersPage() {
  return <OrdersList />;
}
