"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupplier, listSuppliers } from "./api";
import type { SupplierFilters } from "./types";

export function useSuppliers(filters: SupplierFilters = {}) {
  return useQuery({
    queryKey: ["suppliers", filters],
    queryFn: () => listSuppliers(filters),
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: ["suppliers", id],
    queryFn: () => getSupplier(id),
    enabled: Boolean(id),
  });
}
