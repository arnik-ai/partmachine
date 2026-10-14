import { apiFetch, withDemoFallback } from "@/lib/api-client";
import { MOCK_SUPPLIERS } from "./mock";
import type { Supplier, SupplierFilters, SupplierPage } from "./types";

export const SUPPLIERS_PAGE_SIZE = 12;

/** فقط برای نسخه‌ی نمایشی: همان فیلترهای سرور روی داده‌ی نمونه */
function demoPage(filters: SupplierFilters): SupplierPage {
  const limit = filters.limit ?? SUPPLIERS_PAGE_SIZE;
  const offset = filters.offset ?? 0;
  const matches = MOCK_SUPPLIERS.filter((s) => {
    if (filters.q && !`${s.companyName} ${s.description}`.includes(filters.q)) return false;
    if (
      filters.capability &&
      !s.capabilities.includes(filters.capability as Supplier["capabilities"][number])
    )
      return false;
    if (filters.city && s.city !== filters.city) return false;
    return true;
  });
  return { items: matches.slice(offset, offset + limit), total: matches.length, limit, offset };
}

export async function listSuppliers(filters: SupplierFilters = {}): Promise<SupplierPage> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.capability) params.set("capability", filters.capability);
  if (filters.city) params.set("city", filters.city);
  params.set("limit", String(filters.limit ?? SUPPLIERS_PAGE_SIZE));
  params.set("offset", String(filters.offset ?? 0));

  return withDemoFallback(
    () => apiFetch<SupplierPage>(`/suppliers?${params.toString()}`, { auth: false }),
    () => demoPage(filters),
  );
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  return withDemoFallback(
    () => apiFetch<Supplier>(`/suppliers/${id}`, { auth: false }),
    () => MOCK_SUPPLIERS.find((s) => s.id === id) ?? null,
  );
}
