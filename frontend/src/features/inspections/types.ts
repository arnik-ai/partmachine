import type { InspectionStatus, OrderFile } from "@/features/orders/types";

/** none: کارفرما (هنوز) آزمایشگاهی انتخاب نکرده است */
export type InspectionState = "none" | InspectionStatus;

export interface QcLab {
  organizationId: string;
  name: string;
}

export interface QcLabList {
  items: QcLab[];
}

/** بخش «کنترل کیفیت» یک سفارش، از نگاه بیننده (کارهای مجاز را سرور می‌گوید) */
export interface Inspection {
  status: InspectionState;
  lab?: QcLab | null;
  /** شماره‌ی دور فعلی؛ ۰ یعنی قطعه‌ساز هنوز آمادگی را اعلام نکرده است */
  attempt: number;
  requestedAt?: string | null;
  readyAt?: string | null;
  /** آخرین نتیجه؛ پس از رد تا نتیجه‌ی دور بعد می‌ماند */
  resultAt?: string | null;
  resultByName?: string | null;
  resultNote: string;
  report?: OrderFile | null;
  /** فقط برای آزمایشگاه */
  ndaAccepted?: boolean | null;
  fileCount?: number | null;
  files?: OrderFile[] | null;
  canChooseLab: boolean;
  canRemove: boolean;
  canMarkReady: boolean;
  canRecordResult: boolean;
}

export interface InspectionResultInput {
  attempt: number;
  passed: boolean;
  note: string;
  fileId?: string | null;
}

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  requested: "در انتظار آمادگی قطعه‌ساز",
  ready: "در حال بازرسی",
  passed: "قبول شد",
  failed: "رد شد — در انتظار اصلاح",
};
