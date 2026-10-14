import type { RfqStatus } from "@/features/rfq/types";
import type { CapabilityValue } from "@/lib/constants";

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
  note?: string | null;
  submittedAt: string;
  updatedAt?: string;
  /** active: معتبر؛ withdrawn: پس‌گرفته‌شده */
  status?: "active" | "withdrawn";
  revision?: number;
  /** فقط برای صاحب درخواست: مقایسه با برآورد منطقی */
  priceAssessment?: {
    verdict: "low" | "fair" | "high";
    deviationPercent: number;
    message: string;
  } | null;
  /** آیا این پیشنهاد برنده شده است (از سرور) */
  isAwarded?: boolean;
}

/** معیارهای مقایسه — برای علامت‌گذاری بهترین مقدار هر ستون */
export type QuotationMetric = "price" | "leadTime" | "score";

/** ورودی ثبت، ثبت دوباره و ویرایش پیشنهاد (مبلغ به ریال؛ فرم به تومان می‌گیرد) */
export interface QuotationInput {
  totalPriceRials: number;
  leadTimeDays: number;
  validUntil: string;
  note?: string;
}

export type QuotationOutcome = "pending" | "won" | "lost" | "withdrawn" | "cancelled";

/** پیشنهاد قطعه‌ساز همراه خلاصه‌ی RFQ و نتیجه، برای صفحه‌ی «پیشنهادهای من» */
export interface MyQuotation extends Quotation {
  rfq: {
    id: string;
    title: string;
    status: RfqStatus;
    capability: CapabilityValue;
    deliveryCity: string;
    quotesDue: string;
    deadline: string;
  };
  outcome: QuotationOutcome;
}

export interface MyQuotationPage {
  items: MyQuotation[];
  total: number;
  limit: number;
  offset: number;
}

export const OUTCOME_LABELS: Record<QuotationOutcome, string> = {
  pending: "در انتظار تصمیم کارفرما",
  won: "برنده شدید",
  lost: "انتخاب نشد",
  withdrawn: "پس گرفته شد",
  cancelled: "درخواست لغو شد",
};
