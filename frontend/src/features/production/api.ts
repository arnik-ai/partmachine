import { useCallback, useMemo } from "react";
import { useProductionStore } from "./demo-store";
import { planOrder } from "./rules";
import type { OrderEntry } from "./types";

/**
 * تنها درِ ورود صفحه‌ها به داده. فعلاً همه‌چیز از دیتای نمونه در حافظه‌ی مرورگر می‌آید؛
 * وقتی بک‌اند ساخته شد فقط همین فایل به API وصل می‌شود و صفحه‌ها دست نمی‌خورند.
 */

export {
  CEO,
  addWorker,
  clearIssue,
  createJobType,
  deleteJobType,
  hideToast,
  newStep,
  renameJobType,
  reportIssue,
  reworkOrder,
  setCalendar,
  setJobTypeSteps,
  setOrderSteps,
  setViewAs,
  showToast,
  startOrder,
  tickOrderStep,
} from "./demo-store";

export const useToday = () => useProductionStore((state) => state.today);
export const useCalendar = () => useProductionStore((state) => state.calendar);
export const useCompany = () => useProductionStore((state) => state.company);
export const useWorkers = () => useProductionStore((state) => state.workers);
export const useJobTypes = () => useProductionStore((state) => state.jobTypes);
export const useViewAs = () => useProductionStore((state) => state.viewAs);
export const useToast = () => useProductionStore((state) => state.toast);

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
