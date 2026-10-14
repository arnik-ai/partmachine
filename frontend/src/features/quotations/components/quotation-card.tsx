import { Award, BadgeCheck, Clock, Scale, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating, scoreToStars } from "@/components/ui/star-rating";
import { cn, faDate, faNumber, faToman } from "@/lib/utils";
import type { BestValues } from "../ranking";
import type { Quotation } from "../types";

export interface PriceAssessmentView {
  verdict: "low" | "fair" | "high";
  message: string;
}

const ASSESSMENT_STYLE: Record<PriceAssessmentView["verdict"], string> = {
  fair: "bg-success/10 text-success",
  low: "bg-destructive/10 text-destructive",
  high: "bg-warning/15 text-foreground",
};

/** کارت نمایش یک پیشنهاد در مقایسه — فقط نمایش؛ اقدام (انتخاب برنده) از بیرون می‌آید */
export function QuotationCard({
  quote,
  composite,
  best,
  recommended,
  awarded,
  assessment,
  action,
}: {
  quote: Quotation;
  composite: number;
  best: BestValues;
  recommended: boolean;
  awarded: boolean;
  assessment?: PriceAssessmentView | null;
  action?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-2xl transition-all",
        recommended && !awarded && "ring-2 ring-gold",
        awarded && "ring-2 ring-success",
      )}
    >
      {recommended && !awarded && (
        <div className="absolute left-0 top-0 rounded-br-lg bg-gold px-2.5 py-1 text-xs font-bold text-white">
          بیشترین امتیاز ترکیبی
        </div>
      )}
      <CardContent className="flex flex-col gap-4 p-5 pt-7">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h3 className="flex items-center gap-1.5 font-semibold">
              {quote.supplierName}
              {quote.verified ? (
                <BadgeCheck className="h-4 w-4 text-primary" aria-label="قطعه‌ساز تأییدشده" />
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  تأییدنشده
                </Badge>
              )}
            </h3>
            <span className="text-xs text-muted-foreground">{quote.supplierCity}</span>
          </div>
          <StarRating value={scoreToStars(quote.supplierScore)} size="sm" />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric
            icon={Wallet}
            label="قیمت کل"
            value={faToman(quote.totalPriceRials)}
            best={quote.totalPriceRials === best.price}
            bestLabel="ارزان‌ترین"
          />
          <Metric
            icon={Clock}
            label="زمان تحویل"
            value={`${faNumber(quote.leadTimeDays)} روز`}
            best={quote.leadTimeDays === best.leadTime}
            bestLabel="سریع‌ترین"
          />
          <Metric
            icon={Award}
            label="امتیاز اعتماد"
            value={faNumber(quote.supplierScore)}
            best={quote.supplierScore === best.score}
            bestLabel="معتبرترین"
          />
        </div>

        {assessment && (
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium",
              ASSESSMENT_STYLE[assessment.verdict],
            )}
          >
            <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {assessment.message}
          </div>
        )}

        {quote.note && (
          <p className="rounded-lg bg-muted/50 p-2.5 text-xs leading-relaxed text-muted-foreground">
            {quote.note}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-col text-xs text-muted-foreground">
            <span>
              امتیاز ترکیبی: <strong className="text-foreground">{faNumber(composite)}</strong>
            </span>
            <span>اعتبار تا {faDate(quote.validUntil)}</span>
          </div>
          {awarded ? <Badge variant="success">برنده‌ی انتخاب‌شده ✓</Badge> : action}
        </div>
      </CardContent>
    </Card>
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
        className={cn("mx-auto h-4 w-4", best ? "text-success" : "text-muted-foreground")}
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
