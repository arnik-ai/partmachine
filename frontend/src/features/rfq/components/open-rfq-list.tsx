"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, Clock, FileText, MapPin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CAPABILITIES, CITIES, capabilityLabel } from "@/lib/constants";
import { daysUntil } from "@/lib/dates";
import { faDate, faNumber } from "@/lib/utils";
import { RFQS_PAGE_SIZE } from "../api";
import { useOpenRfqs } from "../hooks";
import type { OpenRfqFilters, Rfq } from "../types";

const SEARCH_DELAY_MS = 350;

/** فید قطعه‌سازها: درخواست‌هایی که هنوز پیشنهاد می‌پذیرند */
export function OpenRfqList() {
  const [filters, setFilters] = useState<OpenRfqFilters>({ sort: "newest" });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, error, refetch, isFetching } = useOpenRfqs(filters, page);

  // جستجو با کمی تأخیر تا با هر حرف یک درخواست نرود
  useEffect(() => {
    if (query === (filters.q ?? "")) return;
    const timer = setTimeout(() => {
      setFilters((f) => ({ ...f, q: query || undefined }));
      setPage(0);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, filters.q]);

  function update(next: Partial<OpenRfqFilters>) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(0);
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / RFQS_PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-[1fr_200px_160px_170px]">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="جستجو در عنوان، شرح و متریال..."
            className="pr-9"
            aria-label="جستجو"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select
          aria-label="نوع خدمت"
          value={filters.capability ?? ""}
          onChange={(e) => update({ capability: e.target.value || undefined })}
        >
          <option value="">همه‌ی خدمات</option>
          {CAPABILITIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="شهر تحویل"
          value={filters.city ?? ""}
          onChange={(e) => update({ city: e.target.value || undefined })}
        >
          <option value="">همه‌ی شهرها</option>
          {CITIES.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </Select>
        <Select
          aria-label="مرتب‌سازی"
          value={filters.sort ?? "newest"}
          onChange={(e) => update({ sort: e.target.value as OpenRfqFilters["sort"] })}
        >
          <option value="newest">جدیدترین</option>
          <option value="closing">نزدیک‌ترین مهلت</option>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data && data.items.length > 0 ? (
        <>
          <p className="text-sm text-white/65">{faNumber(data.total)} درخواست باز</p>
          <div
            className="flex flex-col gap-4 transition-opacity"
            style={{ opacity: isFetching ? 0.6 : 1 }}
          >
            {data.items.map((rfq) => (
              <OpenRfqCard key={rfq.id} rfq={rfq} />
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                صفحه‌ی قبل
              </Button>
              <span className="text-sm text-white/75">
                صفحه‌ی {faNumber(page + 1)} از {faNumber(pages)}
              </span>
              <Button
                variant="outline"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                صفحه‌ی بعد
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="py-12 text-center text-white/65">
          فعلاً درخواست بازی با این فیلترها وجود ندارد.
        </p>
      )}
    </div>
  );
}

function OpenRfqCard({ rfq }: { rfq: Rfq }) {
  const daysLeft = daysUntil(rfq.quotesDue);
  return (
    <Link href={`/rfqs/${rfq.id}`} className="block">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="font-semibold">{rfq.title}</h3>
            {rfq.myQuotation?.status === "active" ? (
              <Badge variant="success">پیشنهاد داده‌اید</Badge>
            ) : rfq.myQuotation?.status === "withdrawn" ? (
              <Badge variant="outline">پیشنهادتان را پس گرفته‌اید</Badge>
            ) : (
              <Badge variant={daysLeft <= 2 ? "warning" : "secondary"}>
                <Clock className="ml-1 h-3 w-3" aria-hidden />
                {daysLeft > 0 ? `${faNumber(daysLeft)} روز تا پایان مهلت` : "آخرین روز"}
              </Badge>
            )}
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{rfq.description}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{capabilityLabel(rfq.capability)}</Badge>
            <Badge variant="outline">{rfq.material}</Badge>
            <Badge variant="outline">{faNumber(rfq.quantity)} عدد</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              تحویل در {rfq.deliveryCity}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              مهلت تحویل: {faDate(rfq.deadline)}
            </span>
            {rfq.fileCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {faNumber(rfq.fileCount)} فایل فنی
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
