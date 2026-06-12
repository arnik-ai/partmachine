import type { Metadata } from "next";
import { ContractDocument } from "@/features/contracts/components/contract-document";
import { MOCK_ORDERS } from "@/features/orders/mock";

export const metadata: Metadata = {
  title: "قرارداد سفارش",
};

// خروجی استاتیک: صفحه‌ی قرارداد همه‌ی سفارش‌های دمو از پیش ساخته می‌شود
export function generateStaticParams() {
  return MOCK_ORDERS.map((o) => ({ id: o.id }));
}

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ContractDocument orderId={id} />;
}
