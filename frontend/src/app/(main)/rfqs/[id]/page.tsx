import type { Metadata } from "next";
import { RfqDetail } from "@/features/quotations/components/rfq-detail";
import { MOCK_QUOTATIONS } from "@/features/quotations/mock";

export const metadata: Metadata = {
  title: "مقایسه‌ی استعلام‌ها",
};

// خروجی استاتیک: صفحه‌ی RFQهایی که استعلام دارند از پیش ساخته می‌شود
export function generateStaticParams() {
  return Object.keys(MOCK_QUOTATIONS).map((id) => ({ id }));
}

export default async function RfqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RfqDetail rfqId={id} />;
}
