/**
 * داده‌های پیگیری تولید؛ همان شکلی که بعداً از API می‌آید.
 * تاریخ‌ها رشته‌ی YYYY-MM-DD به وقت تهران هستند.
 * این داده‌ها عمداً هیچ مبلغی ندارند: کارگر نباید قیمت سفارش را ببیند.
 */

export type DurationUnit = "day" | "hour";

/** یک کارت فرایند؛ هم در «نوع کار» و هم در برنامه‌ی ساخت هر سفارش */
export type Step = {
  id: string;
  /** کلید کارت در gadgets.ts */
  gadget: string;
  name: string;
  amount: number;
  unit: DurationUnit;
  assigneeId: string | null;
  doneOn: string | null;
  /** بعد از «برگشت به فرایند قبل»: زمان این فرایند از این روز دوباره شمرده می‌شود */
  restartOn: string | null;
  reworkNote: string | null;
  issue: string | null;
};

export type JobType = {
  id: string;
  name: string;
  steps: Step[];
};

export type Worker = {
  id: string;
  name: string;
  mobile: string | null;
};

/** تقویم کاری هر شرکت. روزهای هفته مثل Date.getUTCDay: یکشنبه ۰ و جمعه ۵ */
export type WorkCalendar = {
  offWeekdays: number[];
  hoursPerDay: number;
};

export type ProductionOrder = {
  id: string;
  title: string;
  customer: string;
  quantity: number;
  /** تا وقتی برنامه‌ریزی نشده null است */
  startOn: string | null;
  deliverOn: string;
  steps: Step[] | null;
};

export type OrderStatus = "waiting" | "late" | "risk" | "ok" | "done";

export type StepState = "done" | "current" | "next";

export type StepPlan = {
  step: Step;
  index: number;
  state: StepState;
  dueOn: string;
  /** چند روز کاری از مهلت گذشته است */
  lateBy: number;
};

export type OrderPlan = {
  status: OrderStatus;
  rows: StepPlan[];
  current: StepPlan | null;
  /** با این روند، تحویل چند روز کاری عقب می‌افتد */
  slip: number;
};

export type OrderEntry = {
  order: ProductionOrder;
  plan: OrderPlan;
};

export type WorkerTask = {
  order: ProductionOrder;
  row: StepPlan;
};
