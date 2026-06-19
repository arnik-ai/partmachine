/**
 * داده‌های پایه‌ی موتور برآورد قیمت.
 *
 * مبنا: روش محاسبه‌ی هزینه‌ی استاندارد (REFA / VDI 3258):
 *   قیمت ساخت = هزینه‌ی مواد + (نرخ ساعتی ماشین × زمان کار) + سربار + سود
 *   زمان کار = زمان تنظیم (setup) + زمان هر قطعه × تعداد
 *
 * ارقام ریالی تقریبی و قابل‌ویرایش‌اند؛ در نسخه‌ی نهایی از پنل مدیر
 * یا داده‌ی واقعی بازار به‌روزرسانی می‌شوند.
 */

import type { CapabilityValue } from "@/lib/constants";

/** نرخ ساعتی ماشین + پارامترهای زمان برای هر خدمت تولیدی */
export interface MachineRate {
  /** نرخ ساعتی ماشین به ریال (استهلاک + بهره + نگهداری + انرژی + جا) */
  hourlyRateRials: number;
  /** زمان آماده‌سازی/تنظیم ثابت برای کل سفارش، به دقیقه */
  setupMinutes: number;
  /** زمان اجرای پایه برای هر قطعه، به دقیقه (پیش‌فرض پیچیدگی متوسط) */
  minutesPerPiece: number;
}

export const MACHINE_RATES: Record<CapabilityValue, MachineRate> = {
  cnc: { hourlyRateRials: 1_200_000, setupMinutes: 90, minutesPerPiece: 12 },
  injection_molding: {
    hourlyRateRials: 900_000,
    setupMinutes: 240,
    minutesPerPiece: 0.6,
  },
  sheet_metal: {
    hourlyRateRials: 850_000,
    setupMinutes: 45,
    minutesPerPiece: 5,
  },
  casting: { hourlyRateRials: 1_100_000, setupMinutes: 180, minutesPerPiece: 8 },
  welding: { hourlyRateRials: 700_000, setupMinutes: 30, minutesPerPiece: 15 },
  tooling: { hourlyRateRials: 1_500_000, setupMinutes: 300, minutesPerPiece: 40 },
  plastic_manufacturing: {
    hourlyRateRials: 800_000,
    setupMinutes: 120,
    minutesPerPiece: 0.8,
  },
  forging: { hourlyRateRials: 1_300_000, setupMinutes: 150, minutesPerPiece: 6 },
  heat_treatment: {
    hourlyRateRials: 600_000,
    setupMinutes: 60,
    minutesPerPiece: 3,
  },
  surface_treatment: {
    hourlyRateRials: 500_000,
    setupMinutes: 40,
    minutesPerPiece: 2,
  },
};

/** قیمت هر کیلوگرم متریال + جرم تقریبی هر قطعه (کیلوگرم) */
export interface MaterialInfo {
  pricePerKgRials: number;
  /** جرم پیش‌فرض هر قطعه، کیلوگرم — برای تخمین مصرف مواد */
  defaultKgPerPiece: number;
}

export const MATERIAL_INFO: Record<string, MaterialInfo> = {
  "فولاد St37": { pricePerKgRials: 420_000, defaultKgPerPiece: 1.5 },
  "فولاد CK45": { pricePerKgRials: 520_000, defaultKgPerPiece: 1.5 },
  "استیل 304": { pricePerKgRials: 1_350_000, defaultKgPerPiece: 1.2 },
  "استیل 316": { pricePerKgRials: 1_950_000, defaultKgPerPiece: 1.2 },
  "آلومینیوم 6061": { pricePerKgRials: 1_150_000, defaultKgPerPiece: 0.6 },
  "آلومینیوم 7075": { pricePerKgRials: 1_850_000, defaultKgPerPiece: 0.6 },
  برنج: { pricePerKgRials: 4_200_000, defaultKgPerPiece: 0.8 },
  مس: { pricePerKgRials: 5_500_000, defaultKgPerPiece: 0.8 },
  چدن: { pricePerKgRials: 350_000, defaultKgPerPiece: 2.0 },
  ABS: { pricePerKgRials: 750_000, defaultKgPerPiece: 0.15 },
  "POM (پلی‌استال)": { pricePerKgRials: 1_100_000, defaultKgPerPiece: 0.15 },
  "پلی‌آمید PA6": { pricePerKgRials: 980_000, defaultKgPerPiece: 0.15 },
  "پلی‌اتیلن PE": { pricePerKgRials: 620_000, defaultKgPerPiece: 0.15 },
  سایر: { pricePerKgRials: 800_000, defaultKgPerPiece: 1.0 },
};

/** ضرایب سربار و سود (نسبت‌های استاندارد محاسبه‌ی هزینه) */
export const PRICING_FACTORS = {
  /** سربار اداری/فروش روی هزینه‌ی ساخت (۱۲٪) */
  overheadRate: 0.12,
  /** حاشیه‌ی سود (۱۵٪) */
  profitRate: 0.15,
  /** کارمزد پلتفرم روی قیمت فروش (۵٪) */
  platformFeeRate: 0.05,
  /** پهنای بازه‌ی قیمت منطقی حول مقدار مرکزی (±۱۵٪) */
  rangeSpread: 0.15,
};

/** ضریب پیچیدگی قطعه — کاربر در فرم انتخاب می‌کند */
export const COMPLEXITY_LEVELS = [
  { value: "simple", label: "ساده", factor: 0.75 },
  { value: "normal", label: "متوسط", factor: 1 },
  { value: "complex", label: "پیچیده / دقت بالا", factor: 1.6 },
] as const;

export type ComplexityValue = (typeof COMPLEXITY_LEVELS)[number]["value"];
