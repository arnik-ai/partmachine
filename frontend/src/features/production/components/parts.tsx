import Link from "next/link";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, faNumber } from "@/lib/utils";
import { attentionLabel } from "../format";
import type { OrderPlan, OrderStatus } from "../types";

/** متن کمرنگ زیر عنوان‌ها */
export const SUB = "text-[13px] text-muted-foreground";
/** هشدار داخل متن؛ رنگ زرد خودش روی زمینه‌ی روشن خوانا نیست */
export const WARN_TEXT = "text-[oklch(0.45_0.1_70)]";
/** نام‌هایی که کاربر می‌نویسد؛ یک کلمه‌ی خیلی بلند هم نباید صفحه را از کادر بیرون ببرد */
export const LONG_TEXT = "min-w-0 max-w-full [overflow-wrap:anywhere]";
/** دکمه‌ی متنی کوچک */
export const LINK_BUTTON = "justify-self-start text-[13.5px] text-primary-deep hover:underline";

export const STATUS_FILL: Record<OrderStatus, string> = {
  waiting: "bg-muted",
  late: "bg-destructive",
  risk: "bg-warning",
  ok: "bg-success",
  done: "bg-primary",
};

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowRight className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}

/** برچسب وضعیت؛ فقط وقتی سفارش نیاز به توجه دارد چیزی نشان می‌دهد */
export function AttentionBadge({ plan }: { plan: OrderPlan }) {
  const label = attentionLabel(plan);
  if (!label) return null;
  const variant = plan.current?.step.issue
    ? "warning"
    : plan.status === "late"
      ? "destructive"
      : plan.status === "risk"
        ? "warning"
        : "secondary";
  return <Badge variant={variant}>{label}</Badge>;
}

/** نوار پیشرفت؛ هر تکه یک فرایند، از سمت راست */
export function Segments({ plan }: { plan: OrderPlan }) {
  const position = plan.current ? plan.current.index + 1 : plan.rows.length;
  return (
    <span
      role="img"
      aria-label={`فرایند ${faNumber(position)} از ${faNumber(plan.rows.length)}`}
      className="flex gap-1"
    >
      {plan.rows.map((row) => (
        <span
          key={row.step.id}
          className={cn(
            "h-[5px] flex-1 rounded-full",
            row.state === "done"
              ? "bg-primary"
              : row.state === "current"
                ? STATUS_FILL[plan.status]
                : "bg-muted",
          )}
        />
      ))}
    </span>
  );
}

export function Stepper({
  value,
  unit,
  min,
  max,
  onChange,
}: {
  value: number;
  unit: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const change = (by: number) => onChange(Math.min(max, Math.max(min, value + by)));
  return (
    <span className="inline-flex h-11 items-center rounded-full border border-input bg-card px-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        aria-label="بیشتر"
        onClick={() => change(1)}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </Button>
      <b className="min-w-14 text-center text-sm font-medium">
        {faNumber(value)} {unit}
      </b>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        aria-label="کمتر"
        onClick={() => change(-1)}
      >
        <Minus className="h-4 w-4" aria-hidden />
      </Button>
    </span>
  );
}

export function Chip({
  pressed,
  dashed = false,
  className,
  ...props
}: React.ComponentProps<"button"> & { pressed?: boolean; dashed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-[38px] items-center gap-1 rounded-full border bg-card px-4 text-sm transition-colors hover:border-ring",
        "aria-pressed:border-primary aria-pressed:bg-secondary aria-pressed:font-semibold aria-pressed:text-primary-deep",
        dashed && "border-dashed border-ring text-primary-deep",
        className,
      )}
      {...props}
    />
  );
}

export function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: "late" | "risk" | "done";
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm",
        tone === "late" && "bg-destructive/10 text-destructive",
        tone === "risk" && "bg-warning/20 text-foreground",
        tone === "done" && "bg-success/15 text-[oklch(0.45_0.12_150)]",
      )}
    >
      <Icon className="mt-[3px] h-[18px] w-[18px] flex-none" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

/** ردیف انتخابی گرد برای گزینه‌ها */
export const RADIO_ROW =
  "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 has-checked:border-primary has-checked:bg-secondary";
