"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/features/auth/store";
import { faNumber } from "@/lib/utils";
import { RFQS_PAGE_SIZE } from "../api";
import { useMyRfqs } from "../hooks";
import { RfqCard } from "./rfq-card";

/** نقش‌هایی که می‌توانند درخواست استعلام ثبت کنند (هم‌خوان با بک‌اند) */
const RFQ_CREATOR_ROLES = ["buyer", "agent", "admin"];

export function RfqList() {
  const [page, setPage] = useState(0);
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading, isError, error, refetch } = useMyRfqs(page);
  const canCreate = !role || RFQ_CREATOR_ROLES.includes(role);
  const pages = data ? Math.max(1, Math.ceil(data.total / RFQS_PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">درخواست‌های استعلام قیمت من</h1>
        {canCreate && (
          <Link href="/rfqs/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" />
            درخواست جدید
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data && data.items.length > 0 ? (
        <>
          <div className="flex flex-col gap-4">
            {data.items.map((rfq) => (
              <RfqCard key={rfq.id} rfq={rfq} />
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                صفحه‌ی قبل
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحه‌ی {faNumber(page + 1)} از {faNumber(pages)}
              </span>
              <Button
                variant="outline"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                صفحه‌ی بعد
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
          <p>هنوز درخواستی ثبت نکرده‌اید.</p>
          {canCreate && (
            <Link href="/rfqs/new" className={buttonVariants({ variant: "outline" })}>
              ثبت اولین درخواست
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
