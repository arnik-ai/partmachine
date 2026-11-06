import { faNumber } from "@/lib/utils";
import { stepTitle } from "./gadgets";
import { daysBetween } from "./rules";
import type { OrderPlan, Step, StepPlan, WorkCalendar } from "./types";

const TEHRAN_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** امروز به وقت تهران، به شکل YYYY-MM-DD */
export function tehranToday(): string {
  const parts = Object.fromEntries(
    TEHRAN_DAY.formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const SHORT_DATE = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** مثلاً «۱۵ آبان» */
export function shortDate(iso: string): string {
  return SHORT_DATE.format(new Date(`${iso}T00:00:00Z`));
}

export function relativeDay(from: string, to: string): string {
  const days = daysBetween(from, to);
  if (days === 0) return "امروز";
  if (days === 1) return "فردا";
  if (days === -1) return "دیروز";
  return days > 1 ? `${faNumber(days)} روز دیگر` : `${faNumber(-days)} روز پیش`;
}

export function unitLabel(step: Step): string {
  return step.unit === "hour" ? "ساعت" : "روز";
}

export function durationText(step: Step): string {
  return `${faNumber(step.amount)} ${unitLabel(step)}`;
}

/** مجموع زمان کاری؛ مثلاً «۲ روز و ۴ ساعت» */
export function workText(days: number, hoursPerDay: number): string {
  const totalHours = Math.round(days * hoursPerDay);
  const wholeDays = Math.floor(totalHours / hoursPerDay);
  const hours = totalHours - wholeDays * hoursPerDay;
  const parts = [
    wholeDays ? `${faNumber(wholeDays)} روز` : "",
    hours ? `${faNumber(hours)} ساعت` : "",
  ].filter(Boolean);
  return parts.join(" و ") || "۰ روز";
}

/** روزهای هفته به ترتیب تقویم ایران؛ عدد همان Date.getUTCDay است */
export const WEEK: readonly (readonly [number, string])[] = [
  [6, "شنبه"],
  [0, "یکشنبه"],
  [1, "دوشنبه"],
  [2, "سه‌شنبه"],
  [3, "چهارشنبه"],
  [4, "پنجشنبه"],
  [5, "جمعه"],
];

/** مثلاً «شنبه تا پنجشنبه»؛ اگر پشت‌سرهم نباشند نام همه‌ی روزها */
export function workingDaysText(calendar: WorkCalendar): string {
  const on = WEEK.map(([day], index) => ({ day, index })).filter(
    ({ day }) => !calendar.offWeekdays.includes(day),
  );
  const contiguous = on.every(({ index }, i) => i === 0 || index === on[i - 1].index + 1);
  const names = on.map(({ index }) => WEEK[index][1]);
  return contiguous && names.length > 2
    ? `${names[0]} تا ${names[names.length - 1]}`
    : names.join("، ");
}

export function firstName(name: string): string {
  return name.split(" ")[0] ?? "";
}

/** متن وضعیت، فقط وقتی سفارش نیاز به توجه دارد */
export function attentionLabel(plan: OrderPlan): string | null {
  if (plan.current?.step.issue) return "مشکل گزارش شده";
  if (plan.status === "waiting") return "منتظر برنامه";
  if (plan.status === "late" && plan.current) return `${faNumber(plan.current.lateBy)} روز دیر`;
  if (plan.status === "risk") return "در خطر";
  return null;
}

export function planMessage(plan: OrderPlan): string {
  const slip = `تحویل ${faNumber(plan.slip)} روز عقب می‌افتد.`;
  if (plan.status === "late" && plan.current) {
    const lateness = `«${stepTitle(plan.current.step)}» ${faNumber(plan.current.lateBy)} روز دیر است.`;
    return `${lateness} ${plan.slip > 0 ? `با این روند، ${slip}` : "هنوز به موعد تحویل می‌رسد."}`;
  }
  return plan.status === "risk" ? `با این برنامه، ${slip}` : "";
}

/** مهلت برای صفحه‌ی کارگر */
export function dueText(row: StepPlan, today: string): string {
  if (row.lateBy > 0) return `${faNumber(row.lateBy)} روز دیر`;
  const left = daysBetween(today, row.dueOn);
  if (left <= 0) return "مهلت امروز";
  return left === 1 ? "مهلت فردا" : `${faNumber(left)} روز مهلت`;
}
