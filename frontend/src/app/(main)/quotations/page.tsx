import type { Metadata } from "next";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { MyQuotations } from "@/features/quotations/components/my-quotations";

export const metadata: Metadata = {
  title: "پیشنهادهای من",
  robots: { index: false },
};

export default function MyQuotationsPage() {
  return (
    <RequireAuth>
      <MyQuotations />
    </RequireAuth>
  );
}
