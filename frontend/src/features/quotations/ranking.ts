import type { Quotation } from "./types";

/**
 * وزن‌های «امتیاز ترکیبی» — یک فرمول ساده و شفاف برای کمک به مقایسه (هوش مصنوعی نیست).
 * هر معیار نسبت به بهترین مقدار میان همین پیشنهادها سنجیده می‌شود.
 */
export const SCORE_WEIGHTS = { price: 0.4, leadTime: 0.25, trust: 0.35 } as const;

export const SCORE_FORMULA_TEXT =
  "امتیاز ترکیبی = ۴۰٪ قیمت + ۲۵٪ زمان تحویل + ۳۵٪ امتیاز اعتماد (نسبت به بهترین پیشنهاد)";

export interface RankedQuotation {
  quote: Quotation;
  composite: number;
}

export function rankQuotations(quotes: Quotation[]): RankedQuotation[] {
  if (quotes.length === 0) return [];
  const minPrice = Math.min(...quotes.map((q) => q.totalPriceRials));
  const minLead = Math.min(...quotes.map((q) => q.leadTimeDays));
  const maxScore = Math.max(...quotes.map((q) => q.supplierScore)) || 1;

  return quotes
    .map((q) => {
      const price = (minPrice / q.totalPriceRials) * 100;
      const lead = (minLead / q.leadTimeDays) * 100;
      const trust = (q.supplierScore / maxScore) * 100;
      const composite =
        price * SCORE_WEIGHTS.price + lead * SCORE_WEIGHTS.leadTime + trust * SCORE_WEIGHTS.trust;
      return { quote: q, composite: Math.round(composite) };
    })
    .sort((a, b) => b.composite - a.composite);
}

export interface BestValues {
  price: number;
  leadTime: number;
  score: number;
}

export function bestValues(quotes: Quotation[]): BestValues {
  return {
    price: Math.min(...quotes.map((q) => q.totalPriceRials)),
    leadTime: Math.min(...quotes.map((q) => q.leadTimeDays)),
    score: Math.max(...quotes.map((q) => q.supplierScore)),
  };
}
