import type { CapabilityValue } from "@/lib/constants";
import {
  COMPLEXITY_LEVELS,
  MACHINE_RATES,
  MATERIAL_INFO,
  PRICING_FACTORS,
  type ComplexityValue,
} from "./data";

export interface EstimateInput {
  capability: CapabilityValue;
  material: string;
  quantity: number;
  complexity: ComplexityValue;
  /** جرم هر قطعه به کیلوگرم — اختیاری؛ نبود، از پیش‌فرض متریال استفاده می‌شود */
  kgPerPiece?: number;
}

/** یک جزء از تفکیک قیمت، برای نمایش explainable */
export interface CostComponent {
  key: string;
  label: string;
  amountRials: number;
  detail: string;
}

export interface PriceEstimate {
  /** قیمت مرکزی هر قطعه */
  unitPriceRials: number;
  /** قیمت مرکزی کل سفارش */
  totalPriceRials: number;
  /** بازه‌ی منطقی کل سفارش */
  rangeLowRials: number;
  rangeHighRials: number;
  /** تفکیک اجزای قیمت کل */
  components: CostComponent[];
  /** زمان کل کار به ساعت (برای نمایش) */
  totalHours: number;
}

function complexityFactor(value: ComplexityValue): number {
  return (
    COMPLEXITY_LEVELS.find((c) => c.value === value)?.factor ?? 1
  );
}

/**
 * برآورد قیمت بر اساس روش استاندارد محاسبه‌ی هزینه:
 *   هزینه‌ی ساخت = مواد + (نرخ ساعتی ماشین × زمان کار)
 *   قیمت = (ساخت + سربار) × (۱ + سود) × (۱ + کارمزد پلتفرم)
 */
export function estimatePrice(input: EstimateInput): PriceEstimate {
  const machine = MACHINE_RATES[input.capability];
  const material =
    MATERIAL_INFO[input.material] ?? MATERIAL_INFO["سایر"];
  const qty = Math.max(1, input.quantity);
  const factor = complexityFactor(input.complexity);
  const kgPerPiece = input.kgPerPiece ?? material.defaultKgPerPiece;

  // ۱) هزینه‌ی مواد (با ۸٪ پرت)
  const materialCost = Math.round(
    qty * kgPerPiece * material.pricePerKgRials * 1.08,
  );

  // ۲) زمان کار: تنظیم ثابت + زمان هر قطعه × پیچیدگی × تعداد
  const totalMinutes =
    machine.setupMinutes + machine.minutesPerPiece * factor * qty;
  const totalHours = totalMinutes / 60;
  const machineCost = Math.round(totalHours * machine.hourlyRateRials);

  // ۳) هزینه‌ی ساخت
  const makingCost = materialCost + machineCost;

  // ۴) سربار اداری/فروش
  const overhead = Math.round(makingCost * PRICING_FACTORS.overheadRate);

  // ۵) سود
  const beforeProfit = makingCost + overhead;
  const profit = Math.round(beforeProfit * PRICING_FACTORS.profitRate);

  // ۶) کارمزد پلتفرم
  const beforeFee = beforeProfit + profit;
  const platformFee = Math.round(
    beforeFee * PRICING_FACTORS.platformFeeRate,
  );

  const total = beforeFee + platformFee;
  const spread = PRICING_FACTORS.rangeSpread;

  return {
    unitPriceRials: Math.round(total / qty),
    totalPriceRials: total,
    rangeLowRials: Math.round(total * (1 - spread)),
    rangeHighRials: Math.round(total * (1 + spread)),
    totalHours: Math.round(totalHours * 10) / 10,
    components: [
      {
        key: "material",
        label: "مواد اولیه",
        amountRials: materialCost,
        detail: `${qty.toLocaleString("fa-IR")} عدد × ${kgPerPiece} کیلوگرم + ۸٪ پرت`,
      },
      {
        key: "machine",
        label: "کار ماشین و دستمزد",
        amountRials: machineCost,
        detail: `${(Math.round(totalHours * 10) / 10).toLocaleString("fa-IR")} ساعت کار با نرخ ساعتی ماشین`,
      },
      {
        key: "overhead",
        label: "سربار اداری و فروش",
        amountRials: overhead,
        detail: "۱۲٪ هزینه‌ی ساخت",
      },
      {
        key: "profit",
        label: "سود مجری",
        amountRials: profit,
        detail: "۱۵٪",
      },
      {
        key: "platform_fee",
        label: "کارمزد پلتفرم",
        amountRials: platformFee,
        detail: "۵٪",
      },
    ],
  };
}

/** ارزیابی یک قیمت پیشنهادی نسبت به بازه‌ی منطقی برآوردشده */
export type PriceVerdict = "fair" | "low" | "high";

export function judgeQuotePrice(
  quotedTotal: number,
  estimate: PriceEstimate,
): { verdict: PriceVerdict; deviationPercent: number; message: string } {
  const deviation =
    ((quotedTotal - estimate.totalPriceRials) / estimate.totalPriceRials) *
    100;
  const rounded = Math.round(deviation);

  if (quotedTotal < estimate.rangeLowRials) {
    return {
      verdict: "low",
      deviationPercent: rounded,
      message: `حدود ${Math.abs(rounded)}٪ زیر برآورد منطقی — احتمال افت کیفیت یا حذف مراحل`,
    };
  }
  if (quotedTotal > estimate.rangeHighRials) {
    return {
      verdict: "high",
      deviationPercent: rounded,
      message: `حدود ${rounded}٪ بالای برآورد منطقی — قیمت گران`,
    };
  }
  return {
    verdict: "fair",
    deviationPercent: rounded,
    message: "در محدوده‌ی منطقی قیمت",
  };
}
