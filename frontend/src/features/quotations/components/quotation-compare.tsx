"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAwardStore } from "../award-store";
import { SCORE_FORMULA_TEXT, bestValues, rankQuotations } from "../ranking";
import type { Quotation } from "../types";
import { QuotationCard } from "./quotation-card";

/** فقط نسخه‌ی نمایشی: مقایسه و انتخاب برنده روی داده‌ی نمونه (در مرورگر) */
export function QuotationCompare({
  rfqId,
  rfqTitle,
  quotes,
}: {
  rfqId: string;
  rfqTitle: string;
  quotes: Quotation[];
}) {
  const router = useRouter();
  const { awardedQuotationId, award } = useAwardStore();
  const [pending, setPending] = useState<string | null>(null);

  const ranked = useMemo(() => rankQuotations(quotes), [quotes]);
  const currentAward = awardedQuotationId[rfqId];

  function handleAward(quote: Quotation) {
    setPending(quote.id);
    award(rfqId, quote.id);
    setTimeout(() => router.push("/orders"), 600);
  }

  if (quotes.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          هنوز پیشنهادی برای این درخواست ثبت نشده است.
        </CardContent>
      </Card>
    );
  }

  const best = bestValues(quotes);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-xl border border-gold/40 bg-gold-soft/40 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
        <span>
          برای «{rfqTitle}»، <strong>{ranked[0]?.quote.supplierName}</strong> بیشترین امتیاز
          ترکیبی را دارد. {SCORE_FORMULA_TEXT}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {ranked.map(({ quote, composite }, index) => (
          <QuotationCard
            key={quote.id}
            quote={quote}
            composite={composite}
            best={best}
            recommended={index === 0}
            awarded={currentAward === quote.id}
            action={
              <Button size="sm" onClick={() => handleAward(quote)} disabled={pending !== null}>
                {pending === quote.id ? "در حال ثبت..." : "انتخاب و عقد قرارداد"}
              </Button>
            }
          />
        ))}
      </div>
    </div>
  );
}
