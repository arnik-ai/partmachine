import { StarRating } from "@/components/ui/star-rating";
import { cn, faNumber } from "@/lib/utils";

/** ستاره‌ی کارفرماها: میانگین ۱ تا ۵ و تعداد امتیاز (فقط کارفرمایی که سفارشش تمام شده امتیاز می‌دهد) */
export function BuyerRating({
  average,
  count,
  size = "sm",
  className,
}: {
  average?: number | null;
  count?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!count || average == null) {
    return <span className={cn("text-xs text-muted-foreground", className)}>هنوز امتیازی ندارد</span>;
  }
  const rounded = Math.round(average * 10) / 10;
  return (
    <span
      role="img"
      aria-label={`امتیاز کارفرماها: ${faNumber(rounded)} از ۵ (${faNumber(count)} امتیاز)`}
      className={cn("inline-flex items-center gap-1", className)}
    >
      <StarRating value={average} size={size} />
      <span className={cn("text-muted-foreground", size === "sm" ? "text-xs" : "text-sm")}>
        ({faNumber(count)}
        {size === "md" ? " امتیاز" : ""})
      </span>
    </span>
  );
}
