import type { Metadata } from "next";
import { SuppliersList } from "@/features/suppliers/components/suppliers-list";

export const metadata: Metadata = {
  title: "قطعه‌سازان",
};

export default function SuppliersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">قطعه‌سازان و تأمین‌کنندگان</h1>
      <SuppliersList />
    </div>
  );
}
