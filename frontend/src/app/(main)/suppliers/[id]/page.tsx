import type { Metadata } from "next";
import { SupplierProfile } from "@/features/suppliers/components/supplier-profile";
import { MOCK_SUPPLIERS } from "@/features/suppliers/mock";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "پروفایل تأمین‌کننده",
};

// نسخه‌ی نمایشی (خروجی استاتیک): صفحه‌ی قطعه‌سازهای نمونه از پیش ساخته می‌شود.
// نسخه‌ی سروری این تابع را ندارد تا هر صفحه هنگام درخواست ساخته شود (CSP با nonce، گام 4e).
export const generateStaticParams = DEMO_MODE
  ? () => MOCK_SUPPLIERS.map((s) => ({ id: s.id }))
  : undefined;

export default async function SupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierProfile id={id} />;
}
