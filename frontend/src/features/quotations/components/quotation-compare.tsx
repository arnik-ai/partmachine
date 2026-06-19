"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  BadgeCheck,
  Clock,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating, scoreToStars } from "@/components/ui/star-rating";
import { cn, faNumber, faToman, faDate } from "@/lib/utils";
import { estimatePrice, judgeQuotePrice } from "@/features/pricing/engine";
import type { CapabilityValue } from "@/lib/constants";
import type { ComplexityValue } from "@/features/pricing/data";
import { useAwardStore } from "../award-store";
import type { Quotation } from "../types";

/** امتیاز ترکیبی پیشنهادی AI: قیمت ۴۰٪، تحویل ۲۵٪، اعتماد ۳۵٪ (نرمال‌شده) */
function rankQuotations(quotes: Quotation[]) {
  if (quotes.length === 0) return [];
  const minPrice = Math.min(...quotes.map((q) => q.totalPriceRials));
  const minLead = Math.min(...quotes.map((q) => q.leadTimeDays));
  const maxScore = Math.max(...quotes.map((q) => q.supplierScore));

  return quotes
    .map((q) => {
      const priceScore = (minPrice / q.totalPriceRials) * 100;
      const leadScore = (minLead / q.leadTimeDays) * 100;
      const trustScore = (q.supplierScore / maxScore) * 100;
      const composite =
        priceScore * 0.4 + leadScore * 0.25 + trustScore * 0.35;
      return { quote: q, composite: Math.round(composite) };
    })
    .sort((a, b) => b.composite - a.composite);
}

export function QuotationCompare({
  rfqId,
  rfqTitle,
  quotes,
  capability,
  material,
  quantity,
}: {
  rfqId: string;
  rfqTitle: string;
  quotes: Quotation[];
  capability: CapabilityValue;
  material: string;
  quantity: number;
}) {
  const router = useRouter();
  const { awardedQuotationId, award } = useAwardStore();
  const [pending, setPending] = useState<string | null>(null);

  const ranked = useMemo(() => rankQuotations(quotes), [quotes]);

  // برآورد قیمت منطقی برای سنجش هر استعلام (پیچیدگی متوسط فرض می‌شود)
  const estimate = useMemo(
    () =>
      estimatePrice({
        capability,
        material,
        quantity,
        complexity: "normal" as ComplexityValue,
      }),
    [capability, material, quantity],
  );
  const bestPrice = Math.min(...quotes.map((q) => q.totalPriceRials));
  const bestLead = Math.min(...quotes.map((q) => q.leadTimeDays));
  const bestScore = Math.max(...quotes.map((q) => q.supplierScore));
  const recommendedId = ranked[0]?.quote.id;
  const currentAward = awardedQuotationId[rfqId];

  function handleAward(quote: Quotation) {
    setPending(quote.id);
    award(rfqId, quote.id);
    // در دمو، سفارش متناظر همان ord-3001 است؛ کاربر را به قرارداد می‌بریم
    setTimeout(() => router.push("/orders"), 600);
  }

  if (quotes.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          هنوز استعلامی برای این درخواست ثبت نشده است.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-xl border border-gold/40 bg-gold-soft/40 p-3 text-sm">
        <Sparkles className="h-4 w-4 shrink-0 text-gold" />
        <span>
          پیشنهاد هوش مصنوعی: با توجه به قیمت، زمان تحویل و امتیاز اعتماد،{" "}
          <strong>{ranked[0]?.quote.supplierName}</strong> بهترین گزینه‌ی کلی
          برای «{rfqTitle}» است.
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {ranked.map(({ quote, composite }) => {
          const isRecommended = quote.id === recommendedId;
          const isAwarded = currentAward === quote.id;
          return (
            <Card
              key={quote.id}
              className={cn(
                "relative overflow-hidden rounded-2xl transition-all",
                isRecommended && "ring-2 ring-gold",
                isAwarded && "ring-2 ring-success",
              )}
            >
              {isRecommended && (
                <div className="absolute left-0 top-0 rounded-br-lg bg-gold px-2.5 py-1 text-xs font-bold text-white">
                  پیشنهاد برتر
                </div>
              )}
              <CardContent className="flex flex-col gap-4 p-5 pt-7">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <h3 className="flex items-center gap-1.5 font-semibold">
                      {quote.supplierName}
                      {quote.verified && (
                        <BadgeCheck className="h-4 w-4 text-primary" />
                      )}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {quote.supplierCity}
                    </span>
                  </div>
                  <StarRating value={scoreToStars(quote.supplierScore)} size="sm" />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <Metric
                    icon={Wallet}
                    label="قیمت کل"
                    value={faToman(quote.totalPriceRials)}
                    best={quote.totalPriceRials === bestPrice}
                    bestLabel="ارزان‌ترین"
                  />
                  <Metric
                    icon={Clock}
                    label="زمان تحویل"
                    value={`${faNumber(quote.leadTimeDays)} روز`}
                    best={quote.leadTimeDays === bestLead}
                    bestLabel="سریع‌ترین"
                  />
                  <Metric
                    icon={Award}
                    label="امتیاز اعتماد"
                    value={faNumber(quote.supplierScore)}
                    best={quote.supplierScore === bestScore}
                    bestLabel="معتبرترین"
                  />
                </div>

                {/* سنجش قیمت نسبت به برآورد منطقی */}
                {(() => {
                  const j = judgeQuotePrice(quote.totalPriceRials, estimate);
                  const styles =
                    j.verdict === "fair"
                      ? "bg-success/10 text-success"
                      : j.verdict === "low"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning/15 text-foreground";
                  return (
                    <div
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium",
                        styles,
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      {j.message}
                    </div>
                  );
                })()}

                {quote.note && (
                  <p className="rounded-lg bg-muted/50 p-2.5 text-xs leading-relaxed text-muted-foreground">
                    {quote.note}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <div className="flex flex-col text-xs text-muted-foreground">
                    <span>
                      امتیاز کلی AI:{" "}
                      <strong className="text-foreground">
                        {faNumber(composite)}
                      </strong>
                    </span>
                    <span>اعتبار تا {faDate(quote.validUntil)}</span>
                  </div>
                  {isAwarded ? (
                    <Badge variant="success">برنده‌ی انتخاب‌شده ✓</Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleAward(quote)}
                      disabled={pending !== null}
                    >
                      {pending === quote.id
                        ? "در حال ثبت..."
                        : "انتخاب و عقد قرارداد"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  best,
  bestLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  best: boolean;
  bestLabel: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-2.5",
        best ? "border-success/40 bg-success/5" : "bg-card",
      )}
    >
      <Icon
        className={cn(
          "mx-auto h-4 w-4",
          best ? "text-success" : "text-muted-foreground",
        )}
      />
      <span className="text-xs font-bold">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {best && (
        <span className="rounded-full bg-success/15 text-[10px] font-bold text-success">
          {bestLabel}
        </span>
      )}
    </div>
  );
}
