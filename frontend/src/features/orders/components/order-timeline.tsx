import { Check, Loader2 } from "lucide-react";
import { cn, faDate } from "@/lib/utils";
import { ORDER_STAGES, stageIndex, type Order } from "../types";

/**
 * تایم‌لاین مراحل سفارش — کارفرما در یک نگاه می‌بیند
 * سفارشش الان دقیقاً در چه مرحله‌ای است.
 */
export function OrderTimeline({ order }: { order: Order }) {
  const currentIndex = stageIndex(order.stage);

  return (
    <ol className="flex flex-col">
      {ORDER_STAGES.map((stage, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isLast = i === ORDER_STAGES.length - 1;
        const date = order.stageDates[stage.key];

        return (
          <li key={stage.key} className="relative flex gap-3 pb-1">
            {/* خط عمودی اتصال */}
            {!isLast && (
              <span
                className={cn(
                  "absolute right-[13px] top-7 h-[calc(100%-14px)] w-0.5 rounded-full",
                  isDone ? "bg-success" : "bg-border",
                )}
              />
            )}

            {/* دایره‌ی وضعیت */}
            <span
              className={cn(
                "relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
                isDone &&
                  "border-success bg-success text-success-foreground",
                isCurrent &&
                  "border-gold bg-gold-soft text-gold shadow-[0_0_0_4px] shadow-gold/20",
                !isDone && !isCurrent && "border-border bg-card text-muted-foreground",
              )}
            >
              {isDone ? (
                <Check className="h-3.5 w-3.5" />
              ) : isCurrent ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span className="text-[11px] font-bold">{i + 1}</span>
              )}
            </span>

            {/* متن مرحله */}
            <div className={cn("flex flex-col pb-4", !isDone && !isCurrent && "opacity-55")}>
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {stage.label}
                {isCurrent && (
                  <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-bold text-gold">
                    مرحله‌ی فعلی
                  </span>
                )}
                {date && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {faDate(date)}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {stage.description}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** نوار پیشرفت فشرده برای کارت سفارش */
export function OrderProgressBar({ order }: { order: Order }) {
  const currentIndex = stageIndex(order.stage);
  const percent = Math.round((currentIndex / (ORDER_STAGES.length - 1)) * 100);

  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-l from-gold to-success transition-all"
          style={{ width: `${Math.max(percent, 4)}%` }}
        />
      </div>
      <span className="text-xs font-bold text-muted-foreground">
        {percent}٪
      </span>
    </div>
  );
}
