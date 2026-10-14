"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store";
import { getMySupplier, getSupplier, listSuppliers, updateMySupplier } from "./api";
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

export function useMySupplier(enabled = true) {
  return useQuery({ queryKey: ["suppliers", "me"], queryFn: getMySupplier, enabled });
}

export function useUpdateMySupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMySupplier,
    onSuccess: (saved) => {
      queryClient.setQueryData(["suppliers", "me"], saved);
      void queryClient.invalidateQueries({ queryKey: ["suppliers", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["suppliers", "detail", saved.id] });
      // نام سازمان همان نام شرکت است؛ سربرگ و داشبورد بلافاصله به‌روز شوند
      useAuthStore.setState((state) =>
        state.user ? { user: { ...state.user, companyName: saved.companyName } } : state,
      );
    },
  });
}
