"use client";

import {
  Award,
  BadgeCheck,
  Building2,
  Clock,
  Cog,
  Factory,
  Globe,
  Image as ImageIcon,
  MapPin,
  Package,
  Phone,
  Star,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating, scoreToStars } from "@/components/ui/star-rating";
import { ApiError } from "@/lib/api-client";
import { DEMO_MODE } from "@/lib/config";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { capabilityLabel } from "@/lib/constants";
import { faDate, faNumber } from "@/lib/utils";
import { portfolioImageSrc } from "../api";
import { useSupplier } from "../hooks";
import { TrustScoreBreakdown } from "./trust-score";

export function SupplierProfile({ id }: { id: string }) {
  const { data: supplier, isLoading, isError, error, refetch } = useSupplier(id);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError && !(error instanceof ApiError && error.status === 404)) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  if (!supplier) {
    return (
      <p className="py-12 text-center text-white/65">
        تأمین‌کننده پیدا نشد.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* سربرگ پروفایل */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
                {supplier.companyName}
                {supplier.verified && (
                  <Badge variant="success">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                    تأییدشده
                  </Badge>
                )}
              </h1>
              <StarRating value={scoreToStars(supplier.score.trust)} />
              <p className="text-muted-foreground">{supplier.description}</p>
            </div>
            <Link
              href="/rfqs/new"
              className={buttonVariants({ size: "lg" })}
            >
              درخواست استعلام قیمت
            </Link>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {supplier.city}
              {supplier.address ? ` — ${supplier.address}` : ""}
            </span>
            {supplier.foundedYear && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                تأسیس {faNumber(supplier.foundedYear)}
              </span>
            )}
            {supplier.employeeCount && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {faNumber(supplier.employeeCount)} نفر
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              زمان تحویل {faNumber(supplier.leadTimeDays)} روز
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Package className="h-4 w-4" />
              {faNumber(supplier.completedJobs)} پروژه‌ی تکمیل‌شده
            </span>
            {supplier.deliveredJobs !== undefined && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {supplier.deliveredJobs
                  ? `تحویل به‌موقع: ${faNumber(supplier.onTimeJobs ?? 0)} از ${faNumber(supplier.deliveredJobs)}`
                  : "هنوز سفارشی در تراشینو تحویل نداده است"}
              </span>
            )}
            {supplier.ratingCount !== undefined && (
              <span className="inline-flex items-center gap-1.5">
                <Star className="h-4 w-4" />
                {supplier.ratingAverage != null && supplier.ratingCount
                  ? `امتیاز کارفرماها: ${faNumber(Math.round(supplier.ratingAverage * 10) / 10)} از ۵ (${faNumber(supplier.ratingCount)} امتیاز)`
                  : "هنوز امتیازی از کارفرماها ندارد"}
              </span>
            )}
            {supplier.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-4 w-4" />
                <span dir="ltr">{supplier.phone}</span>
              </span>
            )}
            {supplier.website && websiteHost(supplier.website) && (
              <a
                href={supplier.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 hover:underline"
              >
                <Globe className="h-4 w-4" />
                <span dir="ltr">{websiteHost(supplier.website)}</span>
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {supplier.capabilities.map((cap) => (
              <Badge key={cap} variant="secondary">
                {capabilityLabel(cap)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* گالری نمونه‌کار: تصاویر واقعی */}
      {supplier.portfolio && supplier.portfolio.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              گالری محصولات و نمونه‌کارها
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {supplier.portfolio.map((image, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.id}
                  src={portfolioImageSrc(image.url)}
                  alt={`نمونه‌کار ${supplier.companyName} — ${faNumber(index + 1)}`}
                  loading="lazy"
                  className="aspect-square w-full rounded-xl border object-cover"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* فقط نسخه‌ی نمایشی: عنوان نمونه‌کارها بدون تصویر */}
      {DEMO_MODE && supplier.galleryTitles && supplier.galleryTitles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              گالری محصولات و نمونه‌کارها
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {supplier.galleryTitles.map((title) => (
                <div
                  key={title}
                  className="group relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border bg-gradient-to-br from-primary/10 via-accent to-gold-soft p-3 text-center transition-transform hover:scale-[1.03]"
                >
                  <ImageIcon className="h-7 w-7 text-primary/50" />
                  <span className="text-xs font-medium leading-relaxed text-foreground/80">
                    {title}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              نسخه‌ی نمایشی: در نسخه‌ی اصلی، تصاویر واقعی نمونه‌کار نمایش داده می‌شوند.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* امتیاز اعتماد (فرمول شفاف سرور) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-primary" />
              امتیاز اعتماد
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TrustScoreBreakdown score={supplier.score} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {/* ماشین‌آلات */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cog className="h-5 w-5 text-primary" />
                ماشین‌آلات
              </CardTitle>
            </CardHeader>
            <CardContent>
              {supplier.machines.length === 0 ? (
                <p className="text-sm text-muted-foreground">ثبت نشده است.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {supplier.machines.map((m, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span>{m.name}</span>
                      <span className="text-muted-foreground">
                        {m.model} × {faNumber(m.count)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* گواهینامه‌ها */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                گواهینامه‌ها
              </CardTitle>
            </CardHeader>
            <CardContent>
              {supplier.certifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">ثبت نشده است.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {supplier.certifications.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span className="font-medium">{c.title}</span>
                      <span className="text-muted-foreground">
                        {c.issuer}
                        {c.validUntil
                          ? ` — اعتبار تا ${faDate(c.validUntil)}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ظرفیت تولید */}
          {supplier.productionCapacityPerMonth && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Factory className="h-5 w-5 text-primary" />
                  ظرفیت تولید
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  تا{" "}
                  <span className="font-bold">
                    {faNumber(supplier.productionCapacityPerMonth)}
                  </span>{" "}
                  قطعه در ماه
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** فقط نشانی‌های http(s) لینک می‌شوند (دفاع دوم؛ سرور هم فقط همین‌ها را می‌پذیرد) */
function websiteHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.host : null;
  } catch {
    return null;
  }
}
