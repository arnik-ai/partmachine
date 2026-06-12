import { ShieldCheck } from "lucide-react";
import { StarRating, scoreToStars } from "@/components/ui/star-rating";
import { cn, faNumber } from "@/lib/utils";
import type { TrustScore } from "../types";

function scoreColor(value: number): string {
  if (value >= 85) return "text-success";
  if (value >= 70) return "text-warning";
  return "text-destructive";
}

export function TrustScoreBadge({ score }: { score: TrustScore }) {
  return <StarRating value={scoreToStars(score.trust)} size="sm" />;
}

/** نمایش کامل و قابل‌توضیح امتیازها — همان خروجی explainable موتور AI */
export function TrustScoreBreakdown({ score }: { score: TrustScore }) {
  const summary = [
    { label: "اعتماد", value: score.trust },
    { label: "اطمینان‌پذیری", value: score.reliability },
    { label: "کیفیت", value: score.quality },
    { label: "ریسک", value: score.risk, invert: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* امتیاز کلی به‌صورت ستاره */}
      <div className="flex flex-col items-center gap-1 rounded-xl bg-gradient-to-l from-amber-50 to-orange-50 p-4">
        <StarRating value={scoreToStars(score.trust)} size="lg" />
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          امتیاز اعتماد محاسبه‌شده توسط هوش مصنوعی
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border bg-muted/40 p-3 text-center"
          >
            <div
              className={cn(
                "text-2xl font-bold",
                item.invert
                  ? scoreColor(100 - item.value)
                  : scoreColor(item.value),
              )}
            >
              {faNumber(item.value)}
            </div>
            <div className="text-xs text-muted-foreground">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {score.components.map((c) => (
          <div key={c.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span>{c.label}</span>
              <span className="font-medium">{faNumber(c.value)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  c.value >= 85
                    ? "bg-success"
                    : c.value >= 70
                      ? "bg-warning"
                      : "bg-destructive",
                )}
                style={{ width: `${c.value}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{c.explanation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
