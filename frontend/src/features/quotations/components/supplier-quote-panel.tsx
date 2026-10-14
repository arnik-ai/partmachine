"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Clock, PartyPopper, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-client";
import { daysUntil } from "@/lib/dates";
import { faDate, faNumber, faToman } from "@/lib/utils";
import type { Rfq } from "@/features/rfq/types";
import { useQuotations, useWithdrawQuotation } from "../hooks";
import type { Quotation } from "../types";
import { QuoteForm } from "./quote-form";

/**
 * بخش قطعه‌ساز در صفحه‌ی RFQ. وضعیت‌ها برای قطعه‌ساز: «published» یعنی هنوز پیشنهاد می‌پذیرد،
 * «evaluating» یعنی مهلت تمام شده و کارفرما در حال تصمیم است.
 */
export function SupplierQuotePanel({ rfq }: { rfq: Rfq }) {
  const { data: quotes, isLoading, isError, error, refetch } = useQuotations(rfq.id);
  const withdraw = useWithdrawQuotation();
  const [editing, setEditing] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const mine: Quotation | undefined = quotes?.[0];
  const acceptsQuotes = rfq.status === "published";
  const canWithdraw = rfq.status === "published" || rfq.status === "evaluating";
  const daysLeft = daysUntil(rfq.quotesDue);

  async function handleWithdraw() {
    if (!mine) return;
    setWithdrawError(null);
    try {
      await withdraw.mutateAsync(mine.id);
      setConfirmWithdraw(false);
    } catch (err) {
      setWithdrawError(errorMessage(err));
    }
  }

  const deadlineHint = acceptsQuotes && (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      {daysLeft > 0
        ? `${faNumber(daysLeft)} روز تا پایان مهلت ارسال و ویرایش پیشنهاد (${faDate(rfq.quotesDue)})`
        : "امروز آخرین روز ارسال و ویرایش پیشنهاد است."}
    </p>
  );

  // بدون پیشنهاد فعال: فرم ثبت (یا پیام پایان مهلت)
  if (!mine || mine.status === "withdrawn") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>پیشنهاد قیمت شما</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {mine?.status === "withdrawn" && (
            <p className="text-sm text-muted-foreground">
              پیشنهاد قبلی شما پس گرفته شده است
              {acceptsQuotes ? "؛ می‌توانید دوباره قیمت بدهید." : "."}
            </p>
          )}
          {acceptsQuotes ? (
            <>
              {deadlineHint}
              <QuoteForm
                rfqId={rfq.id}
                mode={mine ? "resubmit" : "create"}
                existing={mine}
                onDone={() => setSaved(true)}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {rfq.status === "cancelled"
                ? "این درخواست لغو شده است."
                : "مهلت ارسال پیشنهاد برای این درخواست تمام شده است."}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>پیشنهاد قیمت شما</CardTitle>
        <span className="flex flex-wrap items-center gap-2">
          <OutcomeBadge rfq={rfq} quote={mine} />
          {rfq.orderId && mine.isAwarded && (
            <Link href={`/orders/${rfq.orderId}`} className={buttonVariants({ size: "sm" })}>
              مشاهده‌ی سفارش
            </Link>
          )}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {saved && !editing && (
          <p role="status" className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            پیشنهاد شما ثبت شد.
          </p>
        )}
        {editing ? (
          <QuoteForm
            rfqId={rfq.id}
            mode="edit"
            existing={mine}
            onDone={() => {
              setEditing(false);
              setSaved(true);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <Fact label="قیمت کل" value={faToman(mine.totalPriceRials)} />
              <Fact label="زمان تحویل" value={`${faNumber(mine.leadTimeDays)} روز`} />
              <Fact label="اعتبار تا" value={faDate(mine.validUntil)} />
            </dl>
            {mine.note && (
              <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
                {mine.note}
              </p>
            )}
            {mine.revision && mine.revision > 1 && mine.updatedAt && (
              <p className="text-xs text-muted-foreground">
                آخرین ویرایش: {faDate(mine.updatedAt)}
              </p>
            )}
            {deadlineHint}
            <div className="flex flex-wrap justify-end gap-3">
              {canWithdraw && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setWithdrawError(null);
                    setConfirmWithdraw(true);
                  }}
                >
                  پس‌گرفتن پیشنهاد
                </Button>
              )}
              {acceptsQuotes && (
                <Button
                  onClick={() => {
                    setSaved(false);
                    setEditing(true);
                  }}
                >
                  ویرایش پیشنهاد
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmWithdraw}
        onClose={() => setConfirmWithdraw(false)}
        onConfirm={handleWithdraw}
        pending={withdraw.isPending}
        error={withdrawError}
        destructive
        title="پس‌گرفتن پیشنهاد"
        confirmLabel="بله، پس بگیر"
        description={
          acceptsQuotes
            ? "پیشنهاد شما از فهرست کارفرما حذف می‌شود. تا پایان مهلت می‌توانید دوباره قیمت بدهید."
            : "پیشنهاد شما از فهرست کارفرما حذف می‌شود و چون مهلت تمام شده، امکان ثبت دوباره نیست."
        }
      />
    </Card>
  );
}

function OutcomeBadge({ rfq, quote }: { rfq: Rfq; quote: Quotation }) {
  if (rfq.status === "awarded") {
    return quote.isAwarded ? (
      <Badge variant="success" className="gap-1">
        <PartyPopper className="h-3.5 w-3.5" aria-hidden />
        برنده شدید
      </Badge>
    ) : (
      <Badge variant="outline" className="gap-1">
        <XCircle className="h-3.5 w-3.5" aria-hidden />
        کارفرما پیشنهاد دیگری را انتخاب کرد
      </Badge>
    );
  }
  if (rfq.status === "cancelled") return <Badge variant="destructive">درخواست لغو شد</Badge>;
  if (rfq.status === "evaluating") return <Badge variant="warning">در حال بررسی کارفرما</Badge>;
  return <Badge variant="secondary">ثبت‌شده</Badge>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
