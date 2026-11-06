import { useCallback, useMemo } from "react";
import { useProductionStore } from "./demo-store";
import { planOrder } from "./rules";
import type { OrderEntry, Worker } from "./types";

/**
 * تنها درِ ورود صفحه‌ها به داده. فعلاً همه‌چیز داده‌ی نمونه است و فقط در همین مرورگر می‌ماند؛
 * وقتی بک‌اند ساخته شد فقط همین فایل به API وصل می‌شود و صفحه‌ها دست نمی‌خورند.
 */

export {
  DEMO_OTP,
  addWorker,
  clearIssue,
  createJobType,
  deleteJobType,
  hideToast,
  newStep,
  renameJobType,
  reportIssue,
  resetDemo,
  reworkOrder,
  setCalendar,
  setJobTypeSteps,
  setOrderSteps,
  showToast,
  signInWorker,
  signOutWorker,
  startOrder,
  tickOrderStep,
} from "./demo-store";

export const useToday = () => useProductionStore((state) => state.today);
export const useCalendar = () => useProductionStore((state) => state.calendar);
export const useCompany = () => useProductionStore((state) => state.company);
export const useWorkers = () => useProductionStore((state) => state.workers);
export const useJobTypes = () => useProductionStore((state) => state.jobTypes);
export const useToast = () => useProductionStore((state) => state.toast);

/** کارگری که در پنل کارگر وارد شده است */
export function useSignedInWorker(): Worker | null {
  const workerId = useProductionStore((state) => state.workerId);
  const workers = useWorkers();
  return useMemo(
    () => workers.find((worker) => worker.id === workerId) ?? null,
    [workers, workerId],
  );
}

/** سفارش‌ها همراه با برنامه و وضعیت محاسبه‌شده‌ی هر کدام */
export function useOrderEntries(): OrderEntry[] {
  const orders = useProductionStore((state) => state.orders);
  const today = useToday();
  const calendar = useCalendar();
  return useMemo(
    () => orders.map((order) => ({ order, plan: planOrder(order, today, calendar) })),
    [orders, today, calendar],
  );
}

export function useWorkerName(): (workerId: string | null) => string {
  const workers = useWorkers();
  return useCallback(
    (workerId) => workers.find((worker) => worker.id === workerId)?.name ?? "",
    [workers],
  );
}
