import type { Metadata } from "next";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { OpenRfqList } from "@/features/rfq/components/open-rfq-list";

export const metadata: Metadata = {
  title: "درخواست‌های باز",
  robots: { index: false },
};

export default function OpenRfqsPage() {
  return (
    <RequireAuth>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold">درخواست‌های باز</h1>
          <p className="text-sm text-white/70">
            درخواست‌هایی که هنوز پیشنهاد قیمت می‌پذیرند. برای دیدن جزئیات و ثبت قیمت، روی هر درخواست
            بزنید.
          </p>
        </div>
        <OpenRfqList />
      </div>
    </RequireAuth>
  );
}
