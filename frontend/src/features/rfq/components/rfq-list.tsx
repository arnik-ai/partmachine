"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyRfqs } from "../hooks";
import { RfqCard } from "./rfq-card";

export function RfqList() {
  const { data: rfqs, isLoading } = useMyRfqs();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">درخواست‌های استعلام قیمت من</h1>
        <Link href="/rfqs/new" className={buttonVariants()}>
          <Plus className="h-4 w-4" />
          درخواست جدید
        </Link>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : rfqs && rfqs.length > 0 ? (
        <div className="flex flex-col gap-4">
          {rfqs.map((rfq) => (
            <RfqCard key={rfq.id} rfq={rfq} />
          ))}
        </div>
      ) : (
        <p className="py-12 text-center text-white/65">
          هنوز درخواستی ثبت نکرده‌اید.
        </p>
      )}
    </div>
  );
}
