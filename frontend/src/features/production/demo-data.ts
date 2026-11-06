import { createStep } from "./gadgets";
import { addDays } from "./rules";
import type { JobType, ProductionOrder, Step, WorkCalendar, Worker } from "./types";

/** داده‌ی نمونه فقط برای نسخه‌ی نمایشی؛ زمان‌ها نسبت به امروز ساخته می‌شوند تا همیشه تازه بمانند */

/** مسئول پیش‌فرض هر فرایند در نمونه */
const DEFAULT_ASSIGNEE: Record<string, string> = {
  cutting: "hasan",
  casting: "hasan",
  welding: "hasan",
  heat_treatment: "hasan",
  forging: "hasan",
  turning: "ali",
  cnc: "ali",
  milling: "reza",
  grinding: "reza",
  sheet_metal: "reza",
  qc: "sara",
  packing: "narges",
  surface_treatment: "narges",
  shipping: "narges",
};

export function sampleStep(key: string): Step {
  return createStep(key, DEFAULT_ASSIGNEE[key] ?? null);
}

export type DemoData = {
  company: string;
  calendar: WorkCalendar;
  workers: Worker[];
  jobTypes: JobType[];
  orders: ProductionOrder[];
};

export function buildDemoData(today: string): DemoData {
  const at = (offset: number) => addDays(today, offset);
  const done = (key: string, offset: number): Step => ({ ...sampleStep(key), doneOn: at(offset) });
  const open = (...keys: string[]): Step[] => keys.map(sampleStep);

  return {
    company: "کارگاه نمونه‌سازان",
    calendar: { offWeekdays: [5], hoursPerDay: 8 },
    workers: [
      { id: "ali", name: "علی رضایی", mobile: null },
      { id: "hasan", name: "حسن مرادی", mobile: null },
      { id: "reza", name: "رضا نوری", mobile: null },
      { id: "sara", name: "سارا کریمی", mobile: null },
      { id: "narges", name: "نرگس امینی", mobile: null },
    ],
    jobTypes: [
      { id: "machining", name: "قطعه‌ی تراشکاری", steps: open("cutting", "turning", "milling", "qc", "packing") },
      { id: "sheet", name: "ورق‌کاری و جوش", steps: open("sheet_metal", "welding", "surface_treatment", "qc", "packing") },
    ],
    orders: [
      {
        id: "flange",
        title: "فلنج اتصال لوله",
        customer: "شرکت نمونه‌صنعت",
        quantity: 200,
        startOn: at(-6),
        deliverOn: at(2),
        steps: [done("cutting", -5), ...open("turning", "milling", "qc", "packing")],
      },
      {
        id: "gearbox",
        title: "پوسته‌ی گیربکس",
        customer: "کارگاه نمونه",
        quantity: 50,
        startOn: at(-1),
        deliverOn: at(6),
        steps: open("casting", "cnc", "qc", "packing"),
      },
      {
        id: "shaft",
        title: "شفت انتقال قدرت",
        customer: "صنایع نمونه",
        quantity: 100,
        startOn: at(-4),
        deliverOn: at(8),
        steps: [done("cutting", -3), done("turning", -1), ...open("milling", "qc", "packing")],
      },
      {
        id: "bracket",
        title: "براکت ورقی",
        customer: "شرکت نمونه‌سازان",
        quantity: 300,
        startOn: at(-1),
        deliverOn: at(10),
        steps: open("sheet_metal", "welding", "surface_treatment", "qc", "packing"),
      },
      {
        id: "bushing",
        title: "بوش برنجی",
        customer: "صنایع نمونه",
        quantity: 500,
        startOn: at(-9),
        deliverOn: at(1),
        steps: [done("cutting", -8), done("turning", -4), done("qc", -4), done("packing", -4)],
      },
      {
        id: "gear",
        title: "چرخ‌دنده‌ی ساده",
        customer: "شرکت نمونه‌صنعت",
        quantity: 80,
        startOn: null,
        deliverOn: at(12),
        steps: null,
      },
    ],
  };
}
