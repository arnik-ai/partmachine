import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { RfqForm } from "@/features/rfq/components/rfq-form";

export const metadata: Metadata = {
  title: "ثبت درخواست جدید",
  robots: { index: false },
};

export default function NewRfqPage() {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-2xl">
        {/* پارامترهای پیش‌پر شدن در مرورگر خوانده می‌شوند */}
        <Suspense>
          <RfqForm />
        </Suspense>
      </div>
    </RequireAuth>
  );
}
