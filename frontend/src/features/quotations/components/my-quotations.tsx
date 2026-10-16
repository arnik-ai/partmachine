"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { capabilityLabel } from "@/lib/constants";
import { faDate, faNumber, faToman } from "@/lib/utils";
import { MY_QUOTATIONS_PAGE_SIZE } from "../api";
import { useMyQuotations } from "../hooks";
import { OUTCOME_LABELS, type MyQuotation, type QuotationOutcome } from "../types";

const OUTCOME_VARIANT: Record<
  QuotationOutcome,
  "success" | "warning" | "outline" | "destructive" | "secondary"
> = {
  pending: "warning",
  won: "success",
  lost: "outline",
  withdrawn: "outline",
  cancelled: "destructive",
};

/** «پیشنهادهای من» برای قطعه‌ساز، با نتیجه‌ی هر پیشنهاد */
export function MyQuotations() {
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, error, refetch } = useMyQuotations(page);
  const pages = data ? Math.max(1, Math.ceil(data.total / MY_QUOTATIONS_PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">پیشنهادهای من</h1>
        <Link href="/rfqs/open" className={buttonVariants({ variant: "outline" })}>
          درخواست‌های باز
        </Link>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data && data.items.length > 0 ? (
        <>
          <div className="flex flex-col gap-4">
            {data.items.map((item) => (
              <MyQuotationCard key={item.id} item={item} />
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
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
          <p>هنوز پیشنهادی ثبت نکرده‌اید.</p>
          <Link href="/rfqs/open" className={buttonVariants({ variant: "outline" })}>
            دیدن درخواست‌های باز
          </Link>
        </div>
      )}
    </div>
  );
}

function MyQuotationCard({ item }: { item: MyQuotation }) {
  const editable = item.outcome === "pending" && item.rfq.status === "published";
  const href = item.orderId ? `/orders/${item.orderId}` : `/rfqs/${item.rfq.id}`;
  return (
    <Link href={href} className="block">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="font-semibold">{item.rfq.title}</h3>
            <Badge variant={OUTCOME_VARIANT[item.outcome]}>{OUTCOME_LABELS[item.outcome]}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{capabilityLabel(item.rfq.capability)}</Badge>
            <Badge variant="outline">{faToman(item.totalPriceRials)}</Badge>
            <Badge variant="outline">{faNumber(item.leadTimeDays)} روز تحویل</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {item.orderId
              ? "سفارش این کار ساخته شده است؛ برای دیدن مراحل سفارش کلیک کنید."
              : editable
                ? `تا ${faDate(item.rfq.quotesDue)} می‌توانید پیشنهادتان را ویرایش کنید.`
                : `آخرین تغییر: ${faDate(item.updatedAt ?? item.submittedAt)}`}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
