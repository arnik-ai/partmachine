import type { AcceptedAgreement } from "@/features/agreements/types";
import type { CapabilityValue } from "@/lib/constants";

export type RfqStatus =
  | "draft"
  | "published"
  | "quoting"
  | "evaluating"
  | "expired"
  | "awarded"
  | "closed"
  | "cancelled";

export type RfqFileKind = "pdf" | "cad" | "drawing" | "image" | "other";

/** فایل پیوست RFQ (خصوصی؛ دانلود فقط با لینک کوتاه‌عمر از سرور) */
export interface RfqFile {
  id: string;
  name: string;
  size: number;
  kind: RfqFileKind;
}

export interface Rfq {
  id: string;
  title: string;
  description: string;
  capability: CapabilityValue;
  material: string;
  quantity: number;
  deliveryCity: string;
  /** مهلت تحویل قطعه‌ها (ISO date) */
  deadline: string;
  /** آخرین روز ارسال یا ویرایش پیشنهاد (ISO date) */
  quotesDue: string;
  status: RfqStatus;
  files: RfqFile[];
  /** تعداد فایل‌ها؛ برای قطعه‌سازی که NDA را نپذیرفته فقط همین دیده می‌شود */
  fileCount: number;
  /** تعداد پیشنهادها فقط برای صاحب درخواست؛ برای دیگران null */
  quotationsCount: number | null;
  createdAt: string;
  /** آیا درخواست متعلق به سازمان کاربر جاری است */
  isOwner?: boolean;
  awardedQuotationId?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  /** فقط در نمای قطعه‌ساز */
  ndaAccepted?: boolean | null;
  myQuotation?: { id: string; status: "active" | "withdrawn" } | null;
}

/** پاسخ صفحه‌بندی‌شده‌ی سرور */
export interface RfqPage {
  items: Rfq[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateRfqInput {
  title: string;
  description: string;
  capability: CapabilityValue;
  material: string;
  quantity: number;
  deliveryCity: string;
  deadline: string;
  /** اختیاری؛ پیش‌فرض سرور: ۷ روز بعد و نه دیرتر از مهلت تحویل */
  quotesDue?: string;
  /** شناسه‌ی فایل‌هایی که پیش‌تر بارگذاری شده‌اند */
  fileIds?: string[];
  acceptedAgreements?: AcceptedAgreement[];
}

export const RFQ_STATUS_LABELS: Record<RfqStatus, string> = {
  draft: "پیش‌نویس",
  published: "منتشر شده",
  quoting: "در حال دریافت پیشنهاد",
  evaluating: "در حال بررسی پیشنهادها",
  expired: "منقضی شده (بدون پیشنهاد)",
  awarded: "برنده انتخاب شده",
  closed: "بسته شده",
  cancelled: "لغو شده",
};

/** فیلترهای فید «درخواست‌های باز» */
export interface OpenRfqFilters {
  q?: string;
  capability?: string;
  city?: string;
  sort?: "newest" | "closing";
}
