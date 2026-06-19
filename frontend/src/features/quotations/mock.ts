import type { Quotation } from "./types";

/**
 * استعلام‌های نمایشی برای RFQ نمونه «rfq-2001» (۵۰۰ عدد فلنج استیل ۳۰۴).
 * در افزایش بعدی از API خوانده می‌شود.
 */
export const MOCK_QUOTATIONS: Record<string, Quotation[]> = {
  "rfq-2001": [
    {
      id: "quo-1",
      rfqId: "rfq-2001",
      supplierId: "sup-1001",
      supplierName: "صنایع دقیق‌تراش آریا",
      supplierCity: "تهران",
      supplierScore: 92,
      verified: true,
      totalPriceRials: 1_850_000_000,
      leadTimeDays: 14,
      validUntil: "2026-07-05",
      note: "تضمین تلرانس ±۰٫۰۲ میلی‌متر، گزارش ابعادی رایگان همراه محموله.",
      submittedAt: "2026-06-02T10:15:00Z",
    },
    {
      id: "quo-2",
      rfqId: "rfq-2001",
      supplierId: "sup-1004",
      supplierName: "ریخته‌گری مدرن مشهد",
      supplierCity: "مشهد",
      supplierScore: 87,
      verified: true,
      totalPriceRials: 1_620_000_000,
      leadTimeDays: 25,
      validUntil: "2026-07-10",
      note: "قیمت رقابتی، تولید با ریخته‌گری دقیق و ماشین‌کاری نهایی.",
      submittedAt: "2026-06-03T08:40:00Z",
    },
    {
      id: "quo-3",
      rfqId: "rfq-2001",
      supplierId: "sup-1005",
      supplierName: "تراشکاری امید قم",
      supplierCity: "قم",
      supplierScore: 72,
      verified: false,
      totalPriceRials: 1_410_000_000,
      leadTimeDays: 21,
      validUntil: "2026-06-28",
      note: "ارزان‌ترین پیشنهاد؛ مناسب تیراژ بالا، بدون گواهینامه‌ی رسمی.",
      submittedAt: "2026-06-04T14:05:00Z",
    },
    {
      id: "quo-4",
      rfqId: "rfq-2001",
      supplierId: "sup-1007",
      supplierName: "فورج فولاد اراک",
      supplierCity: "اراک",
      supplierScore: 90,
      verified: true,
      totalPriceRials: 2_050_000_000,
      leadTimeDays: 12,
      validUntil: "2026-07-12",
      note: "سریع‌ترین تحویل، مناسب سفارش فوری؛ سابقه‌ی صادرات.",
      submittedAt: "2026-06-05T09:00:00Z",
    },
  ],
};

export function quotationsForRfq(rfqId: string): Quotation[] {
  return MOCK_QUOTATIONS[rfqId] ?? [];
}
