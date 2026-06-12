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
