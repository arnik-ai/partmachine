import Link from "next/link";
import { Clock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/**
 * بخش‌هایی که هنوز به سرور واقعی وصل نشده‌اند، به‌جای داده‌ی ساختگی این پیام را نشان می‌دهند.
 */
export function ComingSoon({
  title,
  description,
  backHref = "/dashboard",
  backLabel = "بازگشت به داشبورد",
}: {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center text-card-foreground">
      <Clock className="h-8 w-8 text-primary" aria-hidden />
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {description ?? "این بخش به‌زودی فعال می‌شود."}
      </p>
      <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
        {backLabel}
      </Link>
    </div>
  );
}
