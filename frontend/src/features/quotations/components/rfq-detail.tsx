"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { DEMO_MODE } from "@/lib/config";
import { capabilityLabel } from "@/lib/constants";
import { faDate, faNumber } from "@/lib/utils";
import { useRfq } from "@/features/rfq/hooks";
import { RFQ_STATUS_LABELS } from "@/features/rfq/types";
import { quotationsForRfq } from "../mock";
import { QuotationCompare } from "./quotation-compare";

export function RfqDetail({ rfqId }: { rfqId: string }) {
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";
  const { data: rfq, isLoading, isError, error, refetch } = useRfq(rfqId);

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
      <div className="flex flex-col items-center gap-3 py-12 text-center text-white/65">
        <p>درخواست موردنظر پیدا نشد یا اجازه‌ی دیدن آن را ندارید.</p>
        <Link href="/rfqs" className={buttonVariants({ variant: "outline" })}>
          بازگشت به درخواست‌ها
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/rfqs"
        className={buttonVariants({ variant: "outline", size: "sm" })}
        style={{ alignSelf: "flex-start" }}
      >
        <ArrowRight className="h-4 w-4" />
        بازگشت به درخواست‌ها
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

      {/* خلاصه‌ی RFQ */}
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-xl font-bold">{rfq.title}</h1>
            <Badge variant="secondary">{RFQ_STATUS_LABELS[rfq.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{rfq.description}</p>
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
              <CalendarDays className="h-3.5 w-3.5" />
              مهلت: {faDate(rfq.deadline)}
            </span>
            {rfq.files.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {faNumber(rfq.files.length)} فایل پیوست
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {DEMO_MODE ? (
        <DemoQuotations rfqId={rfqId} rfq={rfq} />
      ) : (
        <Card>
          <CardContent className="flex items-start gap-3 p-5 text-sm">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            {rfq.isOwner ? (
              <p>
                تاکنون {faNumber(rfq.quotationsCount ?? 0)} پیشنهاد قیمت برای این درخواست
                دریافت شده است. مقایسه‌ی پیشنهادها و انتخاب برنده به‌زودی در همین صفحه
                فعال می‌شود.
              </p>
            ) : (
              <p>ثبت پیشنهاد قیمت برای این درخواست به‌زودی از همین صفحه فعال می‌شود.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** فقط نسخه‌ی نمایشی: مقایسه با داده‌ی نمونه */
function DemoQuotations({
  rfqId,
  rfq,
}: {
  rfqId: string;
  rfq: NonNullable<ReturnType<typeof useRfq>["data"]>;
}) {
  const quotes = quotationsForRfq(rfqId);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">
        مقایسه‌ی استعلام‌های دریافتی ({faNumber(quotes.length)})
      </h2>
      <QuotationCompare
        rfqId={rfqId}
        rfqTitle={rfq.title}
        quotes={quotes}
        capability={rfq.capability}
        material={rfq.material}
        quantity={rfq.quantity}
      />
    </div>
  );
}
