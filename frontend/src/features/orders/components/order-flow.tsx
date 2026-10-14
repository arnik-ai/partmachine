import { Check, Loader2 } from "lucide-react";
import { cn, faDate } from "@/lib/utils";
import { ORDER_FLOW, type OrderDetail, type OrderStatus } from "../types";

/** جایگاه هر وضعیت در مسیر اصلی (پیش‌پرداخت و بازرسی جزئی از مرحله‌ی تولیدند) */
const STEP_OF: Partial<Record<OrderStatus, number>> = {
  awaiting_contract: 0,
  awaiting_prepayment: 1,
  in_production: 1,
  in_inspection: 1,
  shipped: 2,
  delivered: 3,
  completed: 4,
};

/** خط زمان سفارش واقعی: مرحله‌ی فعلی، مراحل انجام‌شده با تاریخ، و مراحل پیش رو */
export function OrderFlow({ order }: { order: OrderDetail }) {
  const current = STEP_OF[order.status] ?? 0;
  const finished = order.status === "completed";
  const reachedAt = new Map<string, string>();
  for (const event of order.events) {
    if (event.toStatus && !reachedAt.has(event.toStatus)) {
      reachedAt.set(event.toStatus, event.createdAt);
    }
  }

  return (
    <ol className="flex flex-col">
      {ORDER_FLOW.map((step, i) => {
        const isDone = i < current || (finished && i === current);
        const isCurrent = i === current && !finished;
        const isLast = i === ORDER_FLOW.length - 1;
        const date = reachedAt.get(step.status);
        return (
          <li key={step.status} className="relative flex gap-3 pb-1">
            {!isLast && (
              <span
                className={cn(
                  "absolute right-[13px] top-7 h-[calc(100%-14px)] w-0.5 rounded-full",
                  isDone ? "bg-success" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
                isDone && "border-success bg-success text-success-foreground",
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
            <div className={cn("flex flex-col pb-4", !isDone && !isCurrent && "opacity-55")}>
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {step.label}
                {isCurrent && (
                  <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-bold text-gold">
                    مرحله‌ی فعلی
                  </span>
                )}
                {date && isDone && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {faDate(date)}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{step.description}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
