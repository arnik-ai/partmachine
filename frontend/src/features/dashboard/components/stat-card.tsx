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

/** کارت آمار داشبورد: کارت سفید شناور، آیکن آبی و عدد درشت */
export function StatCard({ label, value, icon: Icon, asStars, trend, href }: StatCardProps) {
  const card = (
    <Card className="group h-full rounded-3xl transition-transform duration-300 hover:-translate-y-0.5">
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-primary">
            <Icon className="h-5 w-5" />
          </span>
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
            <div className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">{faNumber(value)}</div>
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
