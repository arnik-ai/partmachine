import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkerShell } from "@/features/production/components/worker-shell";
import { PRODUCTION_ENABLED } from "@/lib/config";

export const metadata: Metadata = {
  title: "پنل کارگر",
  robots: { index: false },
};

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  if (!PRODUCTION_ENABLED) notFound();
  return <WorkerShell>{children}</WorkerShell>;
}
