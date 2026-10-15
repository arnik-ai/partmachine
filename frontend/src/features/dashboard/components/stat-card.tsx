import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating, scoreToStars } from "@/components/ui/star-rating";
import { faNumber } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  /** اگر true، مقدار ۰–۱۰۰ به‌صورت ستاره نمایش داده می‌شود */
  asStars?: boolean;
  trend?: string;
  /** صفحه‌ای که جزئیات همین عدد را نشان می‌دهد */
  href?: string;
}

/** کارت آمار داشبورد — سورمه‌ای با نوار طلایی */
export function StatCard({ label, value, icon: Icon, asStars, trend, href }: StatCardProps) {
  const card = (
    <Card className="group relative h-full overflow-hidden rounded-2xl border-border/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10">
      {/* نوار طلایی بالای کارت */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-gold via-gold/60 to-transparent opacity-70 transition-opacity group-hover:opacity-100" />
      <CardContent className="flex flex-col gap-3 p-4 sm:gap-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="rounded-xl bg-primary/[0.08] p-2.5 text-primary ring-1 ring-primary/10 transition-transform duration-300 group-hover:scale-110">
            <Icon className="h-5 w-5" />
          </div>
          {trend && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">
              <TrendingUp className="h-3 w-3" />
              {trend}
            </span>
          )}
        </div>
        <div>
          {asStars ? (
            <StarRating value={scoreToStars(value)} />
          ) : (
            <div className="text-2xl font-bold tracking-tight sm:text-3xl">{faNumber(value)}</div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} aria-label={`${label}: ${faNumber(value)}`} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}
