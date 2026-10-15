import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { RfqDetail } from "@/features/quotations/components/rfq-detail";
import { MOCK_QUOTATIONS } from "@/features/quotations/mock";
import { DEMO_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "جزئیات درخواست",
  robots: { index: false },
};

// نسخه‌ی نمایشی (خروجی استاتیک): صفحه‌ی RFQهای نمونه از پیش ساخته می‌شود.
// نسخه‌ی سروری این تابع را ندارد تا هر صفحه هنگام درخواست ساخته شود (CSP با nonce، گام 4e).
export const generateStaticParams = DEMO_MODE
  ? () => Object.keys(MOCK_QUOTATIONS).map((id) => ({ id }))
  : undefined;

export default async function RfqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireAuth>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <RfqDetail rfqId={id} />
      </Suspense>
    </RequireAuth>
  );
}
