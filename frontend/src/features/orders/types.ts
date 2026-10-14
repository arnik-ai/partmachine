/** مراحل چرخه‌ی عمر سفارش — هم‌راستا با ماشین حالت Escrow در بک‌اند */
export type OrderStage =
  | "placed"
  | "escrow_funded"
  | "in_production"
  | "qc_inspection"
  | "shipping"
  | "delivered"
  | "released";

export const ORDER_STAGES: {
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
    label: "پرداخت امانی",
    description: "وجه نزد پلتفرم قفل شد — قطعه‌ساز مطمئن شروع می‌کند",
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
    label: "آزادسازی وجه",
    description: "مبلغ از حساب امانی به قطعه‌ساز پرداخت شد",
  },
];

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
  | "in_production"
  | "in_inspection"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "disputed";

export type OrderAction = "cancel" | "ship" | "confirm_delivery";
export type OrderSide = "buyer" | "supplier" | "admin";
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
  amountRials: number;
  leadTimeDays: number;
  deliveryDue: string;
  isOverdue: boolean;
  rfqId: string;
  quotationId: string;
  buyer: { organizationId: string; name: string };
  supplier: { organizationId: string; supplierId: string; name: string; verified: boolean };
  /** طرفی که بیننده در این سفارش است، و کارهایی که همین حالا مجاز است (از سرور) */
  mySide: OrderSide;
  nextActions: OrderAction[];
  createdAt: string;
  updatedAt: string;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

export interface OrderDetail extends OrderSummary {
  events: OrderEvent[];
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
  { status: "in_production", label: "تولید", description: "قطعه‌ساز مشغول ساخت است" },
  { status: "shipped", label: "ارسال", description: "قطعه‌ساز مرسوله را با اطلاعات ارسال فرستاد" },
  { status: "delivered", label: "تحویل", description: "کارفرما دریافت را تأیید کرد" },
  { status: "completed", label: "تکمیل", description: "تسویه و پایان سفارش" },
];

export function orderNumber(number: number): string {
  return `PM-${number}`;
}
