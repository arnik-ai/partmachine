import type { Metadata } from "next";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { RfqList } from "@/features/rfq/components/rfq-list";

export const metadata: Metadata = {
  title: "درخواست‌های استعلام قیمت",
  robots: { index: false },
};

export default function RfqsPage() {
  return (
    <RequireAuth>
      <RfqList />
    </RequireAuth>
  );
}
