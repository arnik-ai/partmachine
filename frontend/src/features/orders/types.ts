import { INSPECTIONS_ENABLED } from "@/lib/config";

/** مراحل سفارش در داده‌ی نمونه‌ی نسخه‌ی نمایشی (پول از پلتفرم عبور نمی‌کند؛ O6) */
export type OrderStage =
  | "placed"
  | "escrow_funded"
  | "material_received"
  | "in_production"
  | "qc_inspection"
  | "shipping"
  | "delivered"
  | "released";

const ALL_ORDER_STAGES: {
  key: OrderStage;
  label: string;
  description: string;
}[] = [
  {
    key: "placed",
    label: "ثبت سفارش",
    description: "استعلام قیمت تأیید و سفارش ایجاد شد",
  },
  {
    key: "escrow_funded",
    label: "پیش‌پرداخت",
    description: "کارفرما پیش‌پرداخت را مستقیماً پرداخت و در پلتفرم اعلام کرد؛ قطعه‌ساز دریافت را تأیید کرد",
  },
  {
    key: "material_received",
    label: "رسیدن قطعه به مجری",
    description: "قطعه یا مواد کارفرما به قطعه‌ساز رسید؛ زمان تحویل از همین روز شمرده می‌شود",
  },
  {
    key: "in_production",
    label: "در حال تولید",
    description: "قطعه‌ساز مشغول ساخت است",
  },
  {
    key: "qc_inspection",
    label: "کنترل کیفیت",
    description: "بازرسی ابعادی و متریال توسط آزمایشگاه مستقل",
  },
  {
    key: "shipping",
    label: "ارسال",
    description: "مرسوله در مسیر محل تحویل است",
  },
  {
    key: "delivered",
    label: "تحویل و تأیید",
    description: "کارفرما کالا را دریافت و تأیید می‌کند",
  },
  {
    key: "released",
    label: "تسویه",
    description: "کارفرما تسویه‌ی پایانی را پرداخت کرد و قطعه‌ساز دریافت را تأیید کرد",
  },
];

/** مرحله‌ی «کنترل کیفیت» فقط وقتی آزمایشگاه‌ها روشن باشند (فاز بعد) */
export const ORDER_STAGES = ALL_ORDER_STAGES.filter(
  (stage) => INSPECTIONS_ENABLED || stage.key !== "qc_inspection",
);

export interface Order {
  id: string;
  title: string;
  supplierName: string;
  /** شهر محل استقرار مجری — در قرارداد درج می‌شود */
  supplierCity: string;
  quantity: number;
  material: string;
  deliveryCity: string;
  amountRials: number;
  stage: OrderStage;
  /** تاریخ رسیدن به هر مرحله (مراحل انجام‌شده) */
  stageDates: Partial<Record<OrderStage, string>>;
  expectedDelivery: string;
}

export function stageIndex(stage: OrderStage): number {
  return ORDER_STAGES.findIndex((s) => s.key === stage);
}

// --- سفارش واقعی (API) ------------------------------------------------------------------------

export type OrderStatus =
  | "awaiting_contract"
  | "awaiting_prepayment"
  | "awaiting_material"
  | "in_production"
  | "in_inspection"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "disputed";

/**
 * cancel: پیش از امضا لغو؛ پس از امضا «درخواست لغو» یا موافقت با درخواست طرف مقابل.
 * dispute: «اعلام مشکل». keep: «ادامه‌ی سفارش» (پس گرفتن یا نپذیرفتن درخواست لغو).
 */
export type OrderAction =
  | "cancel"
  | "confirm_material"
  | "ship"
  | "confirm_delivery"
  | "dispute"
  | "keep";
export type PartySide = "buyer" | "supplier";
export type InspectionStatus = "requested" | "ready" | "passed" | "failed";
/** qc: آزمایشگاهی که کارفرما برای بازرسی همین سفارش انتخاب کرده است */
export type OrderSide = "buyer" | "supplier" | "qc" | "admin";
export type OrderStatusGroup = "active" | "completed" | "cancelled" | "all";

export interface OrderFile {
  id: string;
  name: string;
  size: number;
  kind: "pdf" | "cad" | "drawing" | "image";
}

export interface OrderEvent {
  id: string;
  action: string;
  fromStatus?: OrderStatus | null;
  toStatus?: OrderStatus | null;
  actorName?: string | null;
  actorSide: "buyer" | "supplier" | "qc" | "admin" | "system";
  note: string;
  file?: OrderFile | null;
  createdAt: string;
}

export interface OrderSummary {
  id: string;
  /** شماره‌ی خوانا؛ به‌صورت PM-1001 نمایش داده می‌شود */
  number: number;
  status: OrderStatus;
  title: string;
  material: string;
  quantity: number;
  deliveryCity: string;
  /** برای آزمایشگاه null است (مبلغ و پرداخت‌ها فقط برای دو طرف) */
  amountRials: number | null;
  leadTimeDays: number;
  deliveryDue: string;
  isOverdue: boolean;
  /** کارفرما قطعه یا مواد را می‌فرستد؛ مهلت تحویل از روز رسیدن آن شمرده می‌شود */
  materialFromBuyer?: boolean;
  materialReceivedAt?: string | null;
  rfqId: string;
  quotationId: string;
  buyer: { organizationId: string; name: string };
  supplier: { organizationId: string; supplierId: string; name: string; verified: boolean };
  /** طرفی که بیننده در این سفارش است، و کارهایی که همین حالا مجاز است (از سرور) */
  mySide: OrderSide;
  nextActions: OrderAction[];
  /** اگر کارفرما آزمایشگاه بازرسی انتخاب کرده باشد */
  inspection?: { status: InspectionStatus; lab: { organizationId: string; name: string } } | null;
  /** درخواست لغو یک طرف پس از امضا، در انتظار موافقت طرف دیگر */
  cancelRequest?: { side: PartySide; reason: string; requestedAt: string } | null;
  createdAt: string;
  updatedAt: string;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

/** مشکلی که یکی از دو طرف اعلام کرده و پشتیبانی بررسی می‌کند */
export interface OrderDispute {
  id: string;
  openedSide: PartySide;
  openedByName?: string | null;
  reason: string;
  file?: OrderFile | null;
  previousStatus: OrderStatus;
  openedAt: string;
}

/** امتیاز ۱ تا ۵ کارفرما پس از تکمیل؛ توضیح فقط برای دو طرف همین سفارش */
export interface OrderRating {
  score: number;
  comment: string;
  ratedByName?: string | null;
  updatedAt: string;
}

export interface OrderDetail extends OrderSummary {
  events: OrderEvent[];
  dispute?: OrderDispute | null;
  rating?: OrderRating | null;
  /** کارفرما پس از تکمیل می‌تواند امتیاز بدهد یا آن را تغییر دهد */
  canRate: boolean;
}

export interface OrderPage {
  items: OrderSummary[];
  total: number;
  limit: number;
  offset: number;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_contract: "در انتظار قرارداد",
  awaiting_prepayment: "در انتظار پیش‌پرداخت",
  awaiting_material: "در انتظار رسیدن قطعه به مجری",
  in_production: "در حال تولید",
  in_inspection: "در حال بازرسی کیفیت",
  shipped: "ارسال‌شده",
  delivered: "تحویل‌شده",
  completed: "تکمیل‌شده",
  cancelled: "لغوشده",
  disputed: "در حال بررسی اختلاف",
};

/** مسیر اصلی سفارش برای خط زمان */
export const ORDER_FLOW: Array<{ status: OrderStatus; label: string; description: string }> = [
  {
    status: "awaiting_contract",
    label: "قرارداد",
    description: "تنظیم قرارداد و امضای مدیر هر دو طرف",
  },
  {
    status: "awaiting_material",
    label: "رسیدن قطعه به مجری",
    description: "کارفرما قطعه یا مواد را می‌فرستد؛ زمان تحویل از روز رسیدن آن شمرده می‌شود",
  },
  { status: "in_production", label: "تولید", description: "قطعه‌ساز مشغول ساخت است" },
  {
    status: "in_inspection",
    label: "کنترل کیفیت",
    description: "بازرسی توسط آزمایشگاه تأییدشده (فقط اگر کارفرما انتخاب کرده باشد)",
  },
  { status: "shipped", label: "ارسال", description: "قطعه‌ساز مرسوله را با اطلاعات ارسال فرستاد" },
  { status: "delivered", label: "تحویل", description: "کارفرما دریافت را تأیید کرد" },
  { status: "completed", label: "تکمیل", description: "تسویه و پایان سفارش" },
];

export function orderNumber(number: number): string {
  return `PM-${number}`;
}
