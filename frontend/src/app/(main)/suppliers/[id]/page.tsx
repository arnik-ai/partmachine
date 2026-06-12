import type { Metadata } from "next";
import { SupplierProfile } from "@/features/suppliers/components/supplier-profile";
import { MOCK_SUPPLIERS } from "@/features/suppliers/mock";

export const metadata: Metadata = {
  title: "پروفایل تأمین‌کننده",
};

// برای خروجی استاتیک (GitHub Pages) صفحه‌ی همه‌ی تأمین‌کننده‌های دمو از پیش ساخته می‌شود
export function generateStaticParams() {
  return MOCK_SUPPLIERS.map((s) => ({ id: s.id }));
}

export default async function SupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierProfile id={id} />;
}
