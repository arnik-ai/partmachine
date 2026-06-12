import type { Metadata } from "next";
import { SupplierProfile } from "@/features/suppliers/components/supplier-profile";

export const metadata: Metadata = {
  title: "پروفایل تأمین‌کننده",
};

export default async function SupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierProfile id={id} />;
}
