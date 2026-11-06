import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { buildDemoData, sampleStep, type DemoData } from "./demo-data";
import { cloneSteps, nextId, stepTitle } from "./gadgets";
import { firstName, tehranToday } from "./format";
import { reworkTo, tickStep, undoTick } from "./rules";
import type { JobType, ProductionOrder, Step, WorkCalendar } from "./types";

/**
 * وضعیت نسخه‌ی نمایشی. فقط در همین مرورگر می‌ماند و چیزی به جایی فرستاده نمی‌شود، تا بتوان
 * پنل مدیرعامل و پنل کارگر را در دو پنجره کنار هم دید. پیام‌های «خبر داده شد» هم نمایشی‌اند.
 */

const STORAGE_KEY = "tarashino-production-demo";

/** کد ورود نسخه‌ی نمونه؛ کد واقعی را سرور می‌سازد و پیامک می‌کند */
export const DEMO_OTP = "123456";

export type Toast = {
  id: number;
  text: string;
  undo?: () => void;
};

type SavedState = DemoData & {
  today: string;
  /** کارگری که در پنل کارگر وارد شده است */
  workerId: string | null;
};

type ProductionState = SavedState & {
  toast: Toast | null;
};

function freshState(): SavedState {
  const today = tehranToday();
  return { ...buildDemoData(today), today, workerId: null };
}

export const useProductionStore = create<ProductionState>()(
  persist((): ProductionState => ({ ...freshState(), toast: null }), {
    name: STORAGE_KEY,
    version: 1,
    storage: createJSONStorage(() => localStorage),
    partialize: (state): SavedState => ({
      company: state.company,
      calendar: state.calendar,
      workers: state.workers,
      jobTypes: state.jobTypes,
      orders: state.orders,
      today: state.today,
      workerId: state.workerId,
    }),
    // نمونه هر روز از نو ساخته می‌شود تا تاریخ‌هایش کهنه نشود
    merge: (saved, current) => {
      const state = saved as SavedState | undefined;
      return state?.today === current.today ? { ...current, ...state } : current;
    },
  }),
);

// تیک در یک پنجره همان لحظه در پنجره‌ی دیگر همین مرورگر دیده می‌شود
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) void useProductionStore.persist.rehydrate();
  });
}

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

export function signInWorker(workerId: string): void {
  set({ workerId });
}

export function signOutWorker(): void {
  set({ workerId: null });
}

/** نمونه را به حالت اول برمی‌گرداند */
export function resetDemo(): void {
  set({ ...freshState(), toast: null });
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
