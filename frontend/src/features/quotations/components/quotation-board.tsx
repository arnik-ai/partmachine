"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-client";
import { faDate, faNumber, faToman } from "@/lib/utils";
import type { Rfq } from "@/features/rfq/types";
import { useAwardQuotation, useQuotations } from "../hooks";
import { SCORE_FORMULA_TEXT, bestValues, rankQuotations } from "../ranking";
import type { Quotation } from "../types";
import { QuotationCard } from "./quotation-card";

type SortKey = "score" | "price" | "lead";

const AWARDABLE = new Set(["published", "quoting", "evaluating"]);

/** مقایسه‌ی پیشنهادهای واقعی و انتخاب برنده — فقط برای سازمان صاحب درخواست */
export function QuotationBoard({ rfq }: { rfq: Rfq }) {
  const { data: quotes, isLoading, isError, error, refetch } = useQuotations(rfq.id);
  const award = useAwardQuotation();
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [sort, setSort] = useState<SortKey>("score");
  const [confirming, setConfirming] = useState<Quotation | null>(null);
  const [awardError, setAwardError] = useState<string | null>(null);
  const [justAwarded, setJustAwarded] = useState(false);

  const ranked = useMemo(() => {
    const visible = (quotes ?? []).filter((q) => !onlyVerified || q.verified);
    const items = rankQuotations(visible);
    if (sort === "price") items.sort((a, b) => a.quote.totalPriceRials - b.quote.totalPriceRials);
    if (sort === "lead") items.sort((a, b) => a.quote.leadTimeDays - b.quote.leadTimeDays);
    return items;
  }, [quotes, onlyVerified, sort]);

  if (isLoading) return <Skeleton className="h-48" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const all = quotes ?? [];
  const canAward = AWARDABLE.has(rfq.status);
  const topComposite = Math.max(...ranked.map((r) => r.composite));

  async function confirmAward() {
    if (!confirming) return;
    setAwardError(null);
    try {
      await award.mutateAsync(confirming.id);
      setConfirming(null);
      setJustAwarded(true);
    } catch (err) {
      setAwardError(errorMessage(err));
    }
  }

  if (all.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          {rfq.status === "expired"
            ? "مهلت دریافت پیشنهاد تمام شد و پیشنهادی نرسید. می‌توانید با «تغییر مهلت» درخواست را دوباره باز کنید."
            : rfq.status === "cancelled"
              ? "این درخواست لغو شده است."
              : `هنوز پیشنهادی نرسیده است. قطعه‌سازها تا ${faDate(rfq.quotesDue)} فرصت دارند قیمت بدهند.`}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">پیشنهادهای دریافتی ({faNumber(all.length)})</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={onlyVerified}
              onChange={(e) => setOnlyVerified(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            فقط قطعه‌سازهای تأییدشده
          </label>
          <Select
            aria-label="مرتب‌سازی"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-auto"
          >
            <option value="score">بیشترین امتیاز ترکیبی</option>
            <option value="price">ارزان‌ترین</option>
            <option value="lead">سریع‌ترین تحویل</option>
          </Select>
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs text-white/70">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {SCORE_FORMULA_TEXT}. تصمیم نهایی با شماست.
      </p>

      {justAwarded && rfq.status === "awarded" && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success/40 bg-card p-4 text-sm text-card-foreground"
        >
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
          برنده انتخاب شد. ثبت سفارش و قرارداد در مرحله‌ی بعدی پلتفرم فعال می‌شود.
        </div>
      )}

      {ranked.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/65">
          پیشنهادی از قطعه‌ساز تأییدشده وجود ندارد.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {ranked.map(({ quote, composite }) => (
            <QuotationCard
              key={quote.id}
              quote={quote}
              composite={composite}
              best={bestValues(ranked.map((r) => r.quote))}
              recommended={ranked.length > 1 && composite === topComposite}
              awarded={rfq.awardedQuotationId === quote.id}
              assessment={quote.priceAssessment}
              action={
                canAward ? (
                  <Button
                    size="sm"
                    aria-label={`انتخاب ${quote.supplierName} به‌عنوان برنده`}
                    onClick={() => {
                      setAwardError(null);
                      setConfirming(quote);
                    }}
                  >
                    انتخاب به‌عنوان برنده
                  </Button>
                ) : null
              }
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={confirmAward}
        pending={award.isPending}
        error={awardError}
        title="انتخاب برنده"
        confirmLabel="بله، برنده را انتخاب کن"
        description={
          confirming && (
            <>
              پیشنهاد «{confirming.supplierName}» با مبلغ {faToman(confirming.totalPriceRials)} و
              تحویل {faNumber(confirming.leadTimeDays)} روزه به‌عنوان برنده انتخاب می‌شود.
              <strong className="mt-2 block text-foreground">
                این انتخاب قابل تغییر نیست و پیشنهادهای دیگر کنار گذاشته می‌شوند.
              </strong>
            </>
          )
        }
      />
    </div>
  );
}
