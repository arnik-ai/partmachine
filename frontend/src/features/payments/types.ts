import type { OrderFile } from "@/features/orders/types";

export type PaymentKind = "prepayment" | "final";
export type PaymentStatus = "pending" | "reported" | "confirmed";

export interface Payment {
  id: string;
  number: number;
  kind: PaymentKind;
  percent: number;
  amountRials: number;
  status: PaymentStatus;
  reportedAt?: string | null;
  reportedByName?: string | null;
  paidOn?: string | null;
  reference: string;
  note: string;
  receipt?: OrderFile | null;
  confirmedAt?: string | null;
  confirmedByName?: string | null;
  /** آخرین دلیل رد؛ قسط پس از رد دوباره «در انتظار» است */
  rejectionReason?: string | null;
  canReport: boolean;
  canConfirm: boolean;
}

export interface Payments {
  items: Payment[];
  totalRials: number;
  confirmedRials: number;
}

export interface ReportPaymentInput {
  paidOn: string;
  reference: string;
  note: string;
  fileId?: string | null;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "در انتظار پرداخت",
  reported: "اعلام‌شده — منتظر تأیید قطعه‌ساز",
  confirmed: "دریافت تأیید شد",
};

export function paymentTitle(payment: Pick<Payment, "kind" | "percent">): string {
  if (payment.kind === "prepayment") {
    return payment.percent === 100 ? "پرداخت کامل پیش از تولید" : "پیش‌پرداخت";
  }
  return payment.percent === 100 ? "پرداخت کامل پس از تحویل" : "تسویه‌ی پایانی";
}
