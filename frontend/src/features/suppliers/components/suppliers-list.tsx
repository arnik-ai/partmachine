"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { faNumber } from "@/lib/utils";
import { SUPPLIERS_PAGE_SIZE } from "../api";
import { useSuppliers } from "../hooks";
import type { SupplierFilters } from "../types";
import { SupplierCard } from "./supplier-card";
import { SupplierFiltersBar } from "./supplier-filters";

export function SuppliersList() {
  const searchParams = useSearchParams();
  // فیلتر اولیه از آدرس (مثلاً لینک «ماشین‌کاری CNC» در صفحه‌ی اصلی)
  const [filters, setFilters] = useState<SupplierFilters>(() => ({
    capability: searchParams.get("capability") ?? undefined,
    city: searchParams.get("city") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  }));
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, error, refetch, isFetching } = useSuppliers({
    ...filters,
    limit: SUPPLIERS_PAGE_SIZE,
    offset: page * SUPPLIERS_PAGE_SIZE,
  });

  const pages = data ? Math.max(1, Math.ceil(data.total / SUPPLIERS_PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <SupplierFiltersBar
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(0);
        }}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data && data.items.length > 0 ? (
        <>
          <p className="text-sm text-white/65">
            {faNumber(data.total)} قطعه‌ساز پیدا شد
          </p>
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 transition-opacity"
            style={{ opacity: isFetching ? 0.6 : 1 }}
          >
            {data.items.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} />
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
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
          قطعه‌سازی با این فیلترها پیدا نشد. فیلترها را تغییر دهید.
        </p>
      )}
    </div>
  );
}
