import type { Metadata } from "next";
import { RfqList } from "@/features/rfq/components/rfq-list";

export const metadata: Metadata = {
  title: "درخواست‌های استعلام قیمت",
};

export default function RfqsPage() {
  return <RfqList />;
}
