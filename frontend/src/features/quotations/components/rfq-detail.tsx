"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  FileText,
  MapPin,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/features/auth/store";
import { RfqAttachments } from "@/features/rfq/components/rfq-attachments";
import { RfqOwnerActions } from "@/features/rfq/components/rfq-owner-actions";
import { useRfq } from "@/features/rfq/hooks";
import { RFQ_STATUS_LABELS, type Rfq } from "@/features/rfq/types";
import { ApiError } from "@/lib/api-client";
import { DEMO_MODE } from "@/lib/config";
import { capabilityLabel } from "@/lib/constants";
import { faDate, faNumber } from "@/lib/utils";
import { quotationsForRfq } from "../mock";
import { QuotationBoard } from "./quotation-board";
import { QuotationCompare } from "./quotation-compare";
import { SupplierQuotePanel } from "./supplier-quote-panel";

export function RfqDetail({ rfqId }: { rfqId: string }) {
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";
  const role = useAuthStore((s) => s.user?.role);
  const { data: rfq, isLoading, isError, error, refetch } = useRfq(rfqId);
  const backHref = role === "supplier" ? "/rfqs/open" : "/rfqs";

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (isError && !(error instanceof ApiError && error.status === 404)) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  if (!rfq) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <p>درخواست موردنظر پیدا نشد، بسته شده، یا اجازه‌ی دیدن آن را ندارید.</p>
        <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
          بازگشت
        </Link>
      </div>
    );
  }

  // مالک یا ادمین: نمای کامل (سرور فقط برای آن‌ها تعداد پیشنهادها را می‌فرستد)
  const manages = rfq.isOwner || role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={backHref}
        className={buttonVariants({ variant: "outline", size: "sm" })}
        style={{ alignSelf: "flex-start" }}
      >
        <ArrowRight className="h-4 w-4" />
        {role === "supplier" ? "بازگشت به درخواست‌های باز" : "بازگشت به درخواست‌ها"}
      </Link>

      {justCreated && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success/40 bg-card p-4 text-sm text-card-foreground"
        >
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
          درخواست شما ثبت شد و برای قطعه‌سازان منتشر شد.
        </div>
      )}

      <RfqSummary rfq={rfq} />
      <RfqAttachments rfq={rfq} />

      {DEMO_MODE ? (
        <DemoQuotations rfq={rfq} />
      ) : manages ? (
        <>
          {rfq.status === "cancelled" && rfq.cancelReason && (
            <p className="text-sm text-muted-foreground">دلیل لغو: {rfq.cancelReason}</p>
          )}
          <RfqOwnerActions rfq={rfq} />
          <QuotationBoard rfq={rfq} />
        </>
      ) : (
        <SupplierQuotePanel rfq={rfq} />
      )}
    </div>
  );
}

function RfqSummary({ rfq }: { rfq: Rfq }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-bold">{rfq.title}</h1>
          <Badge variant="secondary">{RFQ_STATUS_LABELS[rfq.status]}</Badge>
        </div>
        {rfq.description && <p className="text-sm text-muted-foreground">{rfq.description}</p>}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{capabilityLabel(rfq.capability)}</Badge>
          <Badge variant="outline">{rfq.material}</Badge>
          <Badge variant="outline">{faNumber(rfq.quantity)} عدد</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            تحویل در {rfq.deliveryCity}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            مهلت دریافت پیشنهاد: {faDate(rfq.quotesDue)}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            مهلت تحویل: {faDate(rfq.deadline)}
          </span>
          {rfq.fileCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {faNumber(rfq.fileCount)} فایل پیوست
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** فقط نسخه‌ی نمایشی: مقایسه با داده‌ی نمونه */
function DemoQuotations({ rfq }: { rfq: Rfq }) {
  const quotes = quotationsForRfq(rfq.id);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">مقایسه‌ی پیشنهادهای دریافتی ({faNumber(quotes.length)})</h2>
      <QuotationCompare
        rfqId={rfq.id}
        rfqTitle={rfq.title}
        quotes={quotes}
      />
    </div>
  );
}
