import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { ProductionShell } from "@/features/production/components/production-shell";
import { PRODUCTION_ENABLED } from "@/lib/config";

export const metadata: Metadata = {
  title: "پیگیری تولید",
  robots: { index: false },
};

export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  if (!PRODUCTION_ENABLED) notFound();
  return (
    <RequireAuth>
      <ProductionShell>{children}</ProductionShell>
    </RequireAuth>
  );
}
