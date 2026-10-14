import type { Metadata } from "next";
import { SupplierProfile } from "@/features/suppliers/components/supplier-profile";
import { MOCK_SUPPLIERS } from "@/features/suppliers/mock";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "پروفایل تأمین‌کننده",
};

// نسخه‌ی نمایشی (خروجی استاتیک): صفحه‌ی قطعه‌سازهای نمونه از پیش ساخته می‌شود.
// در نسخه‌ی سروری چیزی از پیش ساخته نمی‌شود و هر صفحه هنگام درخواست رندر می‌شود.
export function generateStaticParams() {
  return DEMO_MODE ? MOCK_SUPPLIERS.map((s) => ({ id: s.id })) : [];
}

export default async function SupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierProfile id={id} />;
}
