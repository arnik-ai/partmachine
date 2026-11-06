import {
  Box,
  Boxes,
  Cog,
  Cpu,
  Disc,
  DraftingCompass,
  Drill,
  FlaskConical,
  Flame,
  Hammer,
  Layers,
  Package,
  PaintRoller,
  Plus,
  Puzzle,
  Scissors,
  ShieldCheck,
  Syringe,
  Truck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { capabilityLabel } from "@/lib/constants";
import type { Step } from "./types";

export type Gadget = {
  key: string;
  name: string;
  icon: LucideIcon;
  /** زمان پیش‌فرض به روز */
  days: number;
  /** در نگاه اول دیده می‌شود؛ بقیه با «نمایش همه‌ی فرایندها» */
  common?: boolean;
};

export const CUSTOM_GADGET = "custom";

/**
 * فهرست کارت‌های فرایند: افزودن یک فرایند تازه یعنی یک خط در همین فهرست.
 * کلید فرایندهایی که با خدمات قطعه‌سازان یکی است همان کلید CAPABILITIES است.
 */
export const GADGETS: readonly Gadget[] = [
  { key: "cutting", name: "برش", icon: Scissors, days: 1, common: true },
  { key: "turning", name: "تراش", icon: Cog, days: 3, common: true },
  { key: "milling", name: "فرز", icon: Drill, days: 2, common: true },
  { key: "welding", name: capabilityLabel("welding"), icon: Zap, days: 2, common: true },
  { key: "heat_treatment", name: capabilityLabel("heat_treatment"), icon: Flame, days: 2, common: true },
  { key: "qc", name: "کنترل کیفیت", icon: ShieldCheck, days: 1, common: true },
  { key: "packing", name: "بسته‌بندی", icon: Package, days: 1, common: true },
  { key: "drawing_review", name: "بررسی نقشه", icon: DraftingCompass, days: 1 },
  { key: "material", name: "تأمین مواد", icon: Boxes, days: 2 },
  { key: "cnc", name: capabilityLabel("cnc"), icon: Cpu, days: 3 },
  { key: "grinding", name: "سنگ‌زنی", icon: Disc, days: 1 },
  { key: "sheet_metal", name: capabilityLabel("sheet_metal"), icon: Layers, days: 2 },
  { key: "casting", name: capabilityLabel("casting"), icon: FlaskConical, days: 4 },
  { key: "forging", name: capabilityLabel("forging"), icon: Hammer, days: 3 },
  { key: "tooling", name: capabilityLabel("tooling"), icon: Box, days: 7 },
  { key: "injection_molding", name: capabilityLabel("injection_molding"), icon: Syringe, days: 2 },
  { key: "assembly", name: "مونتاژ", icon: Puzzle, days: 1 },
  { key: "surface_treatment", name: capabilityLabel("surface_treatment"), icon: PaintRoller, days: 2 },
  { key: "shipping", name: "آماده‌ی ارسال", icon: Truck, days: 1 },
];

export function gadgetIcon(key: string): LucideIcon {
  return GADGETS.find((gadget) => gadget.key === key)?.icon ?? Plus;
}

let sequence = 0;

export function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function createStep(key: string, assigneeId: string | null = null): Step {
  const gadget = GADGETS.find((item) => item.key === key);
  return {
    id: nextId("step"),
    gadget: gadget?.key ?? CUSTOM_GADGET,
    name: gadget?.name ?? "",
    amount: gadget?.days ?? 1,
    unit: "day",
    assigneeId,
    doneOn: null,
    restartOn: null,
    reworkNote: null,
    issue: null,
  };
}

/** رونوشت تازه برای یک سفارش: تغییر زمان این قطعه به «نوع کار» برنمی‌گردد */
export function cloneSteps(steps: Step[]): Step[] {
  return steps.map((step) => ({
    ...step,
    id: nextId("step"),
    doneOn: null,
    restartOn: null,
    reworkNote: null,
    issue: null,
  }));
}

export function stepTitle(step: Step): string {
  return step.name || "فرایند دلخواه";
}
