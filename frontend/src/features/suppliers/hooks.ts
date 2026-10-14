"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getSupplier, listSuppliers } from "./api";
import type { SupplierFilters } from "./types";

export function useSuppliers(filters: SupplierFilters = {}) {
  return useQuery({
    queryKey: ["suppliers", "list", filters],
    queryFn: () => listSuppliers(filters),
    // هنگام رفتن به صفحه‌ی بعد، فهرست قبلی تا رسیدن داده‌ی جدید نمایش داده می‌شود
    placeholderData: keepPreviousData,
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: ["suppliers", "detail", id],
    queryFn: () => getSupplier(id),
    enabled: Boolean(id),
  });
}
