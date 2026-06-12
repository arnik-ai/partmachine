import { Star } from "lucide-react";
import { cn, faNumber } from "@/lib/utils";

/**
 * نمایش امتیاز به‌صورت ۵ ستاره با پر شدن جزئی (مثلاً ۴٫۶ از ۵).
 * value در بازه‌ی ۰ تا ۵.
 */
export function StarRating({
  value,
  size = "md",
  showValue = true,
  className,
}: {
  value: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const starSize =
    size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-6 w-6" : "h-4.5 w-4.5";
  const textSize =
    size === "sm" ? "text-xs" : size === "lg" ? "text-lg" : "text-sm";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={`امتیاز ${faNumber(Math.round(clamped * 10) / 10)} از ۵`}
    >
      {/* ردیف ستاره‌ها همیشه LTR تا پر شدن جزئی یکدست باشد */}
      <span className="inline-flex items-center gap-0.5" dir="ltr">
        {Array.from({ length: 5 }, (_, i) => {
          const fill = Math.max(0, Math.min(1, clamped - i));
          return (
            <span key={i} className={cn("relative inline-block", starSize)}>
              {/* ستاره‌ی خالی (پس‌زمینه) */}
              <Star
                className={cn("absolute inset-0 text-muted-foreground/30", starSize)}
                strokeWidth={1.5}
              />
              {/* ستاره‌ی پر — به اندازه‌ی درصد fill بریده می‌شود */}
              {fill > 0 && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                >
                  <Star
                    className={cn(
                      "fill-amber-400 text-amber-400",
                      starSize,
                    )}
                    strokeWidth={1.5}
                  />
                </span>
              )}
            </span>
          );
        })}
      </span>
      {showValue && (
        <span className={cn("font-bold text-foreground", textSize)}>
          {faNumber(Math.round(clamped * 10) / 10)}
        </span>
      )}
    </span>
  );
}

/** تبدیل امتیاز ۰–۱۰۰ موتور اعتماد به مقیاس ۵ ستاره */
export function scoreToStars(score: number): number {
  return Math.round((score / 20) * 10) / 10;
}
