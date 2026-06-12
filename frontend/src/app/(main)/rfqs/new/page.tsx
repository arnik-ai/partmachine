import type { Metadata } from "next";
import { RfqForm } from "@/features/rfq/components/rfq-form";

export const metadata: Metadata = {
  title: "ثبت درخواست جدید",
};

export default function NewRfqPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <RfqForm />
    </div>
  );
}
