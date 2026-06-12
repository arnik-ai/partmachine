import type { CapabilityValue } from "@/lib/constants";

export type RfqStatus =
  | "draft"
  | "published"
  | "quoting"
  | "awarded"
  | "closed"
  | "cancelled";

export interface RfqFile {
  name: string;
  size: number;
  /** pdf | cad | drawing | image */
  kind: string;
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
  quotationsCount: number;
  createdAt: string;
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
