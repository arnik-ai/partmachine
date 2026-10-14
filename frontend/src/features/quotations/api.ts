import { apiFetch, withDemoFallback } from "@/lib/api-client";
import { quotationsForRfq } from "./mock";
import type { MyQuotationPage, Quotation, QuotationInput } from "./types";

export const MY_QUOTATIONS_PAGE_SIZE = 10;

/** صاحب RFQ پیشنهادهای فعال را می‌گیرد؛ قطعه‌ساز فقط پیشنهاد خودش را */
export function listQuotations(rfqId: string): Promise<Quotation[]> {
  return withDemoFallback(
    () => apiFetch<Quotation[]>(`/rfqs/${rfqId}/quotations`),
    () => quotationsForRfq(rfqId),
  );
}

export function submitQuotation(rfqId: string, input: QuotationInput): Promise<Quotation> {
  return apiFetch<Quotation>(`/rfqs/${rfqId}/quotations`, { method: "POST", body: input });
}

export function updateQuotation(id: string, input: QuotationInput): Promise<Quotation> {
  return apiFetch<Quotation>(`/quotations/${id}`, { method: "PATCH", body: input });
}

export function withdrawQuotation(id: string): Promise<Quotation> {
  return apiFetch<Quotation>(`/quotations/${id}/withdraw`, { method: "POST" });
}

export function awardQuotation(id: string): Promise<Quotation> {
  return apiFetch<Quotation>(`/quotations/${id}/award`, { method: "POST" });
}

export function listMyQuotations(page = 0): Promise<MyQuotationPage> {
  const limit = MY_QUOTATIONS_PAGE_SIZE;
  const offset = page * limit;
  return withDemoFallback(
    () => apiFetch<MyQuotationPage>(`/quotations/mine?limit=${limit}&offset=${offset}`),
    () => ({ items: [], total: 0, limit, offset }),
  );
}
