import type { CapabilityValue } from "@/lib/constants";

export type RfqStatus =
  | "draft"
  | "published"
  | "quoting"
  | "awarded"
  | "closed"
  | "cancelled";

export type RfqFileKind = "pdf" | "cad" | "drawing" | "image" | "other";

export interface RfqFile {
  name: string;
  size: number;
  kind: RfqFileKind;
  /** پیش‌نمایش تصویر (data URL) — فقط در مرورگر؛ هرگز به سرور ارسال نمی‌شود */
  previewUrl?: string;
}

export interface Rfq {
  id: string;
  title: string;
  description: string;
  capability: CapabilityValue;
  material: string;
  quantity: number;
  deliveryCity: string;
  deadline: string; // ISO date
  status: RfqStatus;
  files: RfqFile[];
  /** تعداد پیشنهادها فقط برای صاحب درخواست؛ برای دیگران null */
  quotationsCount: number | null;
  createdAt: string;
  /** آیا درخواست متعلق به سازمان کاربر جاری است */
  isOwner?: boolean;
  awardedQuotationId?: string | null;
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
  files: RfqFile[];
}

export const RFQ_STATUS_LABELS: Record<RfqStatus, string> = {
  draft: "پیش‌نویس",
  published: "منتشر شده",
  quoting: "در حال دریافت استعلام",
  awarded: "برنده انتخاب شده",
  closed: "بسته شده",
  cancelled: "لغو شده",
};
