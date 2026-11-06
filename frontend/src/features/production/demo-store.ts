import { create } from "zustand";
import { buildDemoData, sampleStep, type DemoData } from "./demo-data";
import { cloneSteps, nextId, stepTitle } from "./gadgets";
import { firstName, tehranToday } from "./format";
import { reworkTo, tickStep, undoTick } from "./rules";
import type { JobType, ProductionOrder, Step, WorkCalendar } from "./types";

/**
 * وضعیت نسخه‌ی نمایشی، فقط در حافظه‌ی همین مرورگر؛ هیچ‌چیز ذخیره یا ارسال نمی‌شود.
 * پیام‌های «خبر داده شد» هم فقط نمایشی‌اند تا بک‌اند و سرویس پیامک وصل شود.
 */

export const CEO = "ceo";

export type Toast = {
  id: number;
  text: string;
  undo?: () => void;
};

type ProductionState = DemoData & {
  today: string;
  /** «نمایش به‌عنوان»: مدیرعامل یا شناسه‌ی یک کارگر */
  viewAs: string;
  toast: Toast | null;
};

export const useProductionStore = create<ProductionState>(() => {
  const today = tehranToday();
  return { ...buildDemoData(today), today, viewAs: CEO, toast: null };
});

const { setState: set, getState: get } = useProductionStore;

function patchOrder(orderId: string, change: (order: ProductionOrder) => ProductionOrder): void {
  set((state) => ({
    orders: state.orders.map((order) => (order.id === orderId ? change(order) : order)),
  }));
}

function patchSteps(orderId: string, change: (steps: Step[]) => Step[]): void {
  patchOrder(orderId, (order) => (order.steps ? { ...order, steps: change(order.steps) } : order));
}

function stepsOf(orderId: string): Step[] {
  return get().orders.find((order) => order.id === orderId)?.steps ?? [];
}

function firstNameOf(workerId: string | null): string {
  const worker = get().workers.find((item) => item.id === workerId);
  return worker ? firstName(worker.name) : "";
}

let toastSequence = 0;

export function showToast(text: string, undo?: () => void): void {
  toastSequence += 1;
  set({ toast: { id: toastSequence, text, undo } });
}

export function hideToast(): void {
  set({ toast: null });
}

export function setViewAs(viewAs: string): void {
  set({ viewAs });
}

export function setCalendar(calendar: WorkCalendar): void {
  set({ calendar });
}

/* ---------- نوع کار ---------- */

export function setJobTypeSteps(typeId: string, steps: Step[]): void {
  set((state) => ({
    jobTypes: state.jobTypes.map((type) => (type.id === typeId ? { ...type, steps } : type)),
  }));
}

export function createJobType(name: string): string {
  const type: JobType = {
    id: nextId("type"),
    name,
    steps: [newStep("cutting"), newStep("qc"), newStep("packing")],
  };
  set((state) => ({ jobTypes: [...state.jobTypes, type] }));
  return type.id;
}

export function renameJobType(typeId: string, name: string): void {
  set((state) => ({
    jobTypes: state.jobTypes.map((type) => (type.id === typeId ? { ...type, name } : type)),
  }));
}

export function deleteJobType(typeId: string): void {
  const before = get().jobTypes;
  if (before.length <= 1) return;
  set({ jobTypes: before.filter((type) => type.id !== typeId) });
  showToast("حذف شد. سفارش‌های در حال اجرا تغییر نمی‌کنند.", () => set({ jobTypes: before }));
}

/** کارت تازه؛ در نمونه مسئول پیش‌فرض هم دارد */
export const newStep = sampleStep;

/* ---------- سفارش ---------- */

export function startOrder(draft: {
  orderId: string | null;
  title: string;
  customer: string;
  quantity: number;
  deliverOn: string;
  steps: Step[];
}): string {
  const id = draft.orderId ?? nextId("order");
  const steps = cloneSteps(draft.steps);
  const started: ProductionOrder = {
    id,
    title: draft.title,
    customer: draft.customer,
    quantity: draft.quantity,
    startOn: get().today,
    deliverOn: draft.deliverOn,
    steps,
  };
  set((state) => ({
    orders: draft.orderId
      ? state.orders.map((order) => (order.id === id ? started : order))
      : [...state.orders, started],
  }));
  showToast(`تولید شروع شد. به ${firstNameOf(steps[0]?.assigneeId ?? null)} خبر داده شد.`);
  return id;
}

export function setOrderSteps(orderId: string, steps: Step[]): void {
  patchSteps(orderId, () => steps);
}

export function tickOrderStep(orderId: string, stepId: string): void {
  const steps = stepsOf(orderId);
  const next = tickStep(steps, stepId, get().today);
  if (next === steps) return;
  patchSteps(orderId, () => next);
  const following = steps[steps.findIndex((step) => step.id === stepId) + 1];
  showToast(
    following
      ? `ثبت شد. به ${firstNameOf(following.assigneeId) || "مسئول بعدی"} خبر داده شد.`
      : "همه‌ی فرایندها تمام شد. به مدیرعامل خبر داده شد.",
    () => patchSteps(orderId, (current) => undoTick(current, stepId)),
  );
}

export function reworkOrder(orderId: string, stepId: string, note: string): void {
  const target = stepsOf(orderId).find((step) => step.id === stepId);
  if (!target) return;
  patchSteps(orderId, (steps) => reworkTo(steps, stepId, get().today, note));
  showToast(`سفارش به «${stepTitle(target)}» برگشت. به ${firstNameOf(target.assigneeId) || "مسئول آن"} خبر داده شد.`);
}

export function reportIssue(orderId: string, stepId: string, issue: string): void {
  patchSteps(orderId, (steps) =>
    steps.map((step) => (step.id === stepId ? { ...step, issue } : step)),
  );
  showToast("به مدیرعامل خبر داده شد.");
}

export function clearIssue(orderId: string, stepId: string): void {
  patchSteps(orderId, (steps) =>
    steps.map((step) => (step.id === stepId ? { ...step, issue: null } : step)),
  );
  showToast("ثبت شد. به مدیرعامل خبر داده شد.");
}

/* ---------- کارکنان ---------- */

export function addWorker(name: string, mobile: string): void {
  set((state) => ({
    workers: [...state.workers, { id: nextId("worker"), name, mobile }],
  }));
  showToast(`حساب ${name} ساخته شد. با همین شماره و کد پیامکی وارد می‌شود.`);
}
