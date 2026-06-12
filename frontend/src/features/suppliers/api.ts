import { apiFetch, withDemoFallback } from "@/lib/api-client";
import { MOCK_SUPPLIERS } from "./mock";
import type { Supplier, SupplierFilters } from "./types";

function applyFilters(
  suppliers: Supplier[],
  filters: SupplierFilters,
): Supplier[] {
  return suppliers.filter((s) => {
    if (
      filters.q &&
      !`${s.companyName} ${s.description}`.includes(filters.q)
    )
      return false;
    if (
      filters.capability &&
      !s.capabilities.includes(
        filters.capability as Supplier["capabilities"][number],
      )
    )
      return false;
    if (filters.city && s.city !== filters.city) return false;
    return true;
  });
}

export async function listSuppliers(
  filters: SupplierFilters = {},
): Promise<Supplier[]> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.capability) params.set("capability", filters.capability);
  if (filters.city) params.set("city", filters.city);

  return withDemoFallback(
    () => apiFetch<Supplier[]>(`/suppliers?${params.toString()}`),
    () => applyFilters(MOCK_SUPPLIERS, filters),
  );
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  return withDemoFallback(
    () => apiFetch<Supplier>(`/suppliers/${id}`),
    () => MOCK_SUPPLIERS.find((s) => s.id === id) ?? null,
  );
}
