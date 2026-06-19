/** استعلام قیمتی که یک قطعه‌ساز برای یک RFQ ارسال می‌کند */
export interface Quotation {
  id: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  supplierCity: string;
  /** امتیاز اعتماد قطعه‌ساز (۰–۱۰۰) — از موتور Trust Score */
  supplierScore: number;
  verified: boolean;
  /** قیمت کل پیشنهادی به ریال */
  totalPriceRials: number;
  /** زمان تحویل پیشنهادی به روز */
  leadTimeDays: number;
  /** اعتبار پیشنهاد تا این تاریخ */
  validUntil: string;
  /** ضمانت/توضیحات قطعه‌ساز */
  note?: string;
  submittedAt: string;
}

/** معیارهای مقایسه — برای علامت‌گذاری بهترین مقدار هر ستون */
export type QuotationMetric = "price" | "leadTime" | "score";
