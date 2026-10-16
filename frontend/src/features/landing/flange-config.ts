import { estimatePrice } from "@/features/pricing/engine";

/** جنس‌های پیکربندی صفحه‌ی اول؛ نام فارسی همان نام فهرست متریال پلتفرم است */
export const CONFIG_MATERIALS = [
  { key: "st37", fa: "فولاد St37", en: "St37 steel", density: 7.85, color: 0xc9c7d3, metalness: 1, roughness: 0.28 },
  { key: "ss304", fa: "استیل 304", en: "Stainless 304", density: 7.9, color: 0xe6e8ee, metalness: 1, roughness: 0.14 },
  { key: "al6061", fa: "آلومینیوم 6061", en: "Aluminum 6061", density: 2.7, color: 0xd6dbe2, metalness: 1, roughness: 0.36 },
  { key: "brass", fa: "برنج", en: "Brass", density: 8.5, color: 0xd8b46a, metalness: 1, roughness: 0.3 },
  { key: "castIron", fa: "چدن", en: "Cast iron", density: 7.2, color: 0x6f6b78, metalness: 0.9, roughness: 0.66 },
] as const;

export type ConfigMaterial = (typeof CONFIG_MATERIALS)[number];
export type FlangeConfig = { diameter: number; holes: number; material: ConfigMaterial; quantity: number };

export const HOLE_OPTIONS = [4, 6, 8, 12] as const;
export const QUANTITY_OPTIONS = [10, 50, 200, 1000] as const;

/** ابعاد فلنج گلودار بر حسب واحد صحنه (۱ واحد = ۱۰۰ میلی‌متر) از روی قطر بیرونی */
export function flangeDims(diameter: number) {
  const R = diameter / 200;
  return {
    R,
    t: 0.12 + 0.05 * R,
    bore: 0.3 * R,
    boltR: 0.75 * R,
    holeR: 0.065 * R,
    hubBase: 0.52 * R,
    hubTop: 0.38 * R,
    hubH: 0.5 * R,
  };
}

/** وزن هر قطعه: دیسک بدون سوراخ‌ها + گلو (مخروط ناقص) بدون سوراخ وسط؛ هر واحد³ = ۱۰۰۰ سانتی‌متر مکعب */
export function flangeWeightKg(config: Pick<FlangeConfig, "diameter" | "holes" | "material">): number {
  const { R, t, bore, holeR, hubBase, hubTop, hubH } = flangeDims(config.diameter);
  const disk = (Math.PI * (R * R - bore * bore) - config.holes * Math.PI * holeR * holeR) * t;
  const hub = ((Math.PI * hubH) / 3) * (hubBase * hubBase + hubBase * hubTop + hubTop * hubTop) - Math.PI * bore * bore * hubH;
  return ((disk + hub) * 1000 * config.material.density) / 1000;
}

/** برآورد کل سفارش با همان فرمول شفاف پلتفرم (ماشین‌کاری CNC)، به تومان */
export function flangeEstimate(config: FlangeConfig) {
  const kg = flangeWeightKg(config);
  const estimate = estimatePrice({
    capability: "cnc",
    material: config.material.fa,
    quantity: config.quantity,
    complexity: config.holes >= 12 ? "complex" : config.holes <= 4 ? "simple" : "normal",
    kgPerPiece: kg,
  });
  return { kg, lowToman: estimate.rangeLowRials / 10, highToman: estimate.rangeHighRials / 10 };
}

/** پارامترهای فرم ثبت درخواست تا با همین مشخصات پر شود (فرم پلتفرم فارسی است) */
export function rfqPrefill(config: FlangeConfig): string {
  const title = `ساخت ${config.quantity} عدد فلنج گلودار Ø${config.diameter} با ${config.holes} سوراخ`;
  const spec = `فلنج گلودار، قطر بیرونی ${config.diameter} میلی‌متر، ${config.holes} سوراخ پیچ، جنس ${config.material.fa}. از پیکربندی صفحه‌ی اول.`;
  return new URLSearchParams({ title, material: config.material.fa, quantity: String(config.quantity), spec }).toString();
}
