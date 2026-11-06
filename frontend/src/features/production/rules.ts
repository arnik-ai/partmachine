/**
 * قواعد پیگیری تولید: زمان‌بندی، وضعیت سفارش و گذر از هر فرایند.
 * همه‌ی تابع‌ها خالص‌اند و امروز و تقویم شرکت را ورودی می‌گیرند؛
 * وقتی بک‌اند ساخته شد این قواعد به سرور می‌رود و صفحه‌ها فقط نتیجه را نشان می‌دهند.
 */

import type {
  DurationUnit,
  OrderEntry,
  OrderPlan,
  OrderStatus,
  ProductionOrder,
  Step,
  StepPlan,
  WorkCalendar,
  WorkerTask,
} from "./types";

const DAY_MS = 86_400_000;
const EPS = 1e-9;

export const MAX_DAYS = 60;
export const MAX_HOURS = 200;
export const MAX_HOURS_PER_DAY = 16;

export function toDayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function toIsoDate(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIsoDate(toDayNumber(iso) + days);
}

export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

function isOff(day: number, calendar: WorkCalendar): boolean {
  return calendar.offWeekdays.includes(new Date(day * DAY_MS).getUTCDay());
}

export function durationInDays(step: Step, calendar: WorkCalendar): number {
  return step.unit === "hour" ? step.amount / calendar.hoursPerDay : step.amount;
}

/** زمان کاری را از یک لحظه جلو می‌برد و روزهای تعطیل را رد می‌کند */
export function addWork(start: number, days: number, calendar: WorkCalendar): number {
  // تقویم بدون هیچ روز کاری نباید مرورگر را در حلقه قفل کند
  if (calendar.offWeekdays.length >= 7) return start + days;
  let cursor = start;
  let left = days;
  while (left > EPS) {
    const day = Math.floor(cursor + EPS);
    if (isOff(day, calendar)) {
      cursor = day + 1;
      continue;
    }
    const used = Math.min(day + 1 - cursor, left);
    cursor += used;
    left -= used;
  }
  return cursor;
}

/** آخرین روزی که کار در آن انجام می‌شود */
function lastDay(moment: number): number {
  return Math.ceil(moment - EPS) - 1;
}

/** تعداد روزهای کاری بعد از روز a تا روز b */
function workDiff(a: number, b: number, calendar: WorkCalendar): number {
  let count = 0;
  for (let day = a + 1; day <= b; day++) if (!isOff(day, calendar)) count++;
  return count;
}

export function planOrder(
  order: ProductionOrder,
  today: string,
  calendar: WorkCalendar,
): OrderPlan {
  if (!order.steps?.length || order.startOn === null) {
    return { status: "waiting", rows: [], current: null, slip: 0 };
  }
  const now = toDayNumber(today);
  let cursor = toDayNumber(order.startOn);
  let current: StepPlan | null = null;
  const rows: StepPlan[] = [];

  for (let index = 0; index < order.steps.length; index++) {
    const step = order.steps[index];
    if (step.restartOn) cursor = toDayNumber(step.restartOn);
    const end = addWork(cursor, durationInDays(step, calendar), calendar);
    const due = lastDay(end);
    const dueOn = toIsoDate(due);
    if (step.doneOn) {
      const doneDay = toDayNumber(step.doneOn);
      cursor = doneDay;
      rows.push({ step, index, state: "done", dueOn, lateBy: workDiff(due, doneDay, calendar) });
    } else if (!current) {
      const lateBy = workDiff(due, now, calendar);
      cursor = lateBy > 0 ? now : end;
      current = { step, index, state: "current", dueOn, lateBy };
      rows.push(current);
    } else {
      cursor = end;
      rows.push({ step, index, state: "next", dueOn, lateBy: 0 });
    }
  }

  const slip = current ? workDiff(toDayNumber(order.deliverOn), lastDay(cursor), calendar) : 0;
  const status: OrderStatus = !current
    ? "done"
    : current.lateBy > 0
      ? "late"
      : slip > 0
        ? "risk"
        : "ok";
  return { status, rows, current, slip };
}

/** فقط فرایند جاری تیک می‌خورد؛ کلیک تکراری یا قدیمی هیچ اثری ندارد */
export function tickStep(steps: Step[], stepId: string, today: string): Step[] {
  const open = steps.find((step) => !step.doneOn);
  if (!open || open.id !== stepId) return steps;
  return steps.map((step) => (step.id === stepId ? { ...step, doneOn: today } : step));
}

export function undoTick(steps: Step[], stepId: string): Step[] {
  return steps.map((step) => (step.id === stepId ? { ...step, doneOn: null } : step));
}

/** سفارش را به یک فرایند انجام‌شده برمی‌گرداند؛ آن فرایند و هرچه بعد از آن است دوباره باز می‌شود */
export function reworkTo(steps: Step[], stepId: string, today: string, note: string): Step[] {
  const target = steps.findIndex((step) => step.id === stepId);
  if (target === -1) return steps;
  return steps.map((step, index) => {
    if (index < target) return step;
    const reopened = { ...step, doneOn: null, restartOn: null, reworkNote: null, issue: null };
    return index === target ? { ...reopened, restartOn: today, reworkNote: note } : reopened;
  });
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** هنگام کشیدن کارت از from به to، کارت شماره‌ی index الان کجا دیده می‌شود */
export function previewIndex(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (to < from && index >= to && index < from) return index + 1;
  return index;
}

export function maxAmount(unit: DurationUnit): number {
  return unit === "hour" ? MAX_HOURS : MAX_DAYS;
}

export function clampAmount(amount: number, unit: DurationUnit): number {
  return Math.min(maxAmount(unit), Math.max(1, amount));
}

/** یک روز هفته را روشن یا خاموش می‌کند؛ دست‌کم یک روز کاری همیشه می‌ماند */
export function toggleOffDay(calendar: WorkCalendar, weekday: number): WorkCalendar {
  const off = calendar.offWeekdays;
  if (off.includes(weekday)) {
    return { ...calendar, offWeekdays: off.filter((day) => day !== weekday) };
  }
  return off.length >= 6 ? calendar : { ...calendar, offWeekdays: [...off, weekday] };
}

export function totalWorkDays(steps: Step[], calendar: WorkCalendar): number {
  return steps.reduce((total, step) => total + durationInDays(step, calendar), 0);
}

/** اگر همین امروز شروع شود، کی تمام می‌شود و چند روز کاری از موعد تحویل بیشتر است */
export function forecastFromToday(
  steps: Step[],
  today: string,
  deliverOn: string,
  calendar: WorkCalendar,
): { finishOn: string; overBy: number } {
  const end = steps.reduce(
    (cursor, step) => addWork(cursor, durationInDays(step, calendar), calendar),
    toDayNumber(today),
  );
  const finish = lastDay(end);
  return {
    finishOn: toIsoDate(finish),
    overBy: workDiff(toDayNumber(deliverOn), finish, calendar),
  };
}

export function isValidMobile(mobile: string): boolean {
  return /^09[0-9]{9}$/.test(mobile);
}

export function needsAttention({ plan }: OrderEntry): boolean {
  return (
    plan.status === "waiting" ||
    plan.status === "late" ||
    plan.status === "risk" ||
    Boolean(plan.current?.step.issue)
  );
}

const STATUS_RANK: Record<OrderStatus, number> = { waiting: 0, late: 1, risk: 2, ok: 3, done: 4 };

function byUrgency(a: OrderEntry, b: OrderEntry): number {
  return (
    STATUS_RANK[a.plan.status] - STATUS_RANK[b.plan.status] ||
    daysBetween(b.order.deliverOn, a.order.deliverOn)
  );
}

export function groupBoard(entries: OrderEntry[]): {
  attention: OrderEntry[];
  onTrack: OrderEntry[];
  finished: OrderEntry[];
} {
  const calm = entries.filter((entry) => !needsAttention(entry));
  return {
    attention: entries.filter(needsAttention).sort(byUrgency),
    onTrack: calm.filter((entry) => entry.plan.status === "ok").sort(byUrgency),
    finished: calm.filter((entry) => entry.plan.status === "done").sort(byUrgency),
  };
}

/** کارهای یک نفر؛ هر کارگر فقط همین‌ها را می‌بیند */
export function tasksOf(
  workerId: string,
  entries: OrderEntry[],
): { now: WorkerTask[]; later: WorkerTask[]; done: WorkerTask[] } {
  const now: WorkerTask[] = [];
  const later: WorkerTask[] = [];
  const done: WorkerTask[] = [];
  for (const { order, plan } of entries) {
    for (const row of plan.rows) {
      if (row.step.assigneeId !== workerId) continue;
      const bucket = row.state === "current" ? now : row.state === "next" ? later : done;
      bucket.push({ order, row });
    }
  }
  now.sort((a, b) => daysBetween(b.row.dueOn, a.row.dueOn));
  done.sort((a, b) => daysBetween(a.row.step.doneOn ?? a.row.dueOn, b.row.step.doneOn ?? b.row.dueOn));
  return { now, later, done };
}
