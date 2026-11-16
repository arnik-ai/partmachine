import type { Metadata } from "next";
import { PublicTerms } from "@/features/agreements/components/public-terms";

export const metadata: Metadata = {
  title: "قوانین عمومی",
  description:
    "قوانین عمومی تراشینو: نقش‌ها، مسیر سفارش، پرداخت، محرمانگی نقشه‌های فنی و حل اختلاف.",
};

export default function TermsPage() {
  return <PublicTerms />;
}
