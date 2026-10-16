/** جنس‌های پیکربندی صفحه‌ی اول؛ نام فارسی همان نام فهرست متریال پلتفرم است */
export const CONFIG_MATERIALS = [
  { key: "st37", fa: "فولاد St37", en: "St37 steel", density: 7.85, color: 0xc9c7d3, metalness: 1, roughness: 0.28 },
  { key: "ss304", fa: "استیل 304", en: "Stainless 304", density: 7.9, color: 0xe6e8ee, metalness: 1, roughness: 0.14 },
  { key: "al6061", fa: "آلومینیوم 6061", en: "Aluminum 6061", density: 2.7, color: 0xd6dbe2, metalness: 1, roughness: 0.36 },
  { key: "brass", fa: "برنج", en: "Brass", density: 8.5, color: 0xd8b46a, metalness: 1, roughness: 0.3 },
  { key: "castIron", fa: "چدن", en: "Cast iron", density: 7.2, color: 0x6f6b78, metalness: 0.9, roughness: 0.66 },
  { key: "pom", fa: "POM (پلی‌استال)", en: "POM (acetal)", density: 1.41, color: 0xe9e4d6, metalness: 0, roughness: 0.5 },
] as const;

export type ConfigMaterial = (typeof CONFIG_MATERIALS)[number];
export type GearConfig = { diameter: number; teeth: number; material: ConfigMaterial; quantity: number };

export const TEETH_OPTIONS = [12, 18, 24, 36] as const;
export const QUANTITY_OPTIONS = [10, 50, 200, 1000] as const;

type Pt = [number, number];
const polar = (r: number, a: number): Pt => [r * Math.cos(a), r * Math.sin(a)];
const shoelace = (pts: Pt[]) => Math.abs(pts.reduce((s, [x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; return s + x * v - u * y; }, 0)) / 2;

/**
 * هندسه‌ی چرخ‌دنده‌ی ساده (میلی‌متر): پیرامون دندانه‌ها، سوراخ وسط با جای خار، سوراخ‌های سبک‌کننده و توپی.
 * مدول از قطر بیرونی و تعداد دندانه: m = D / (z + 2).
 */
export function gearGeometry(diameter: number, teeth: number) {
  const m = diameter / (teeth + 2);
  const rp = (m * teeth) / 2;
  const ra = rp + m;
  const rf = rp - 1.25 * m;
  const p = (Math.PI * 2) / teeth;
  const outline: Pt[] = [];
  for (let i = 0; i < teeth; i++) {
    const c = i * p;
    outline.push(
      polar(rf, c - 0.31 * p),
      polar(rp, c - 0.25 * p),
      polar(ra, c - 0.15 * p),
      polar(ra, c + 0.15 * p),
      polar(rp, c + 0.25 * p),
      polar(rf, c + 0.31 * p),
      polar(rf, c + 0.5 * p),
    );
  }
  const boreR = Math.max(6, 0.11 * diameter);
  // جای خار بالای سوراخ وسط
  const kw = boreR * 0.5;
  const kd = boreR * 0.28;
  const half = Math.asin(kw / 2 / boreR);
  const bore: Pt[] = [];
  for (let i = 0; i <= 40; i++) bore.push(polar(boreR, Math.PI / 2 + half + (i / 40) * (Math.PI * 2 - 2 * half)));
  bore.push([kw / 2, boreR * Math.cos(half)], [kw / 2, boreR + kd], [-kw / 2, boreR + kd], [-kw / 2, boreR * Math.cos(half)]);
  const lightening: { x: number; y: number; r: number }[] = [];
  const ringR = (boreR * 1.9 + rf) / 2;
  const holeR = Math.min(0.28 * (rf - boreR * 1.9), ((Math.PI * ringR) / 6) * 0.7);
  if (diameter >= 120 && holeR >= 4) for (let i = 0; i < 6; i++) { const [x, y] = polar(ringR, (i * Math.PI) / 3 + Math.PI / 6); lightening.push({ x, y, r: holeR }); }
  const thickness = Math.min(40, Math.max(8, 8 * m));
  const hub = { r: Math.min(rf * 0.62, boreR * 1.9), h: thickness * 0.5 };
  return { m, rp, ra, rf, outline, bore, lightening, thickness, hub, boreR };
}

/** وزن هر قطعه از سطح واقعی شکل × ضخامت، به‌اضافه‌ی توپی */
export function gearWeightKg(config: Pick<GearConfig, "diameter" | "teeth" | "material">): number {
  const g = gearGeometry(config.diameter, config.teeth);
  const area = shoelace(g.outline) - shoelace(g.bore) - g.lightening.reduce((s, h) => s + Math.PI * h.r * h.r, 0);
  const hub = Math.PI * (g.hub.r * g.hub.r - g.boreR * g.boreR) * g.hub.h;
  return ((area * g.thickness + hub) * config.material.density) / 1e6;
}

/** پارامترهای فرم ثبت درخواست تا با همین مشخصات پر شود (فرم پلتفرم فارسی است) */
export function rfqPrefill(config: GearConfig): string {
  const g = gearGeometry(config.diameter, config.teeth);
  const title = `ساخت ${config.quantity} عدد چرخ‌دنده‌ی ساده ${config.teeth} دندانه، قطر ${config.diameter}`;
  const spec = `چرخ‌دنده‌ی ساده، قطر بیرونی ${config.diameter} میلی‌متر، ${config.teeth} دندانه (مدول ${g.m.toFixed(2)})، ضخامت ${Math.round(g.thickness)} میلی‌متر، جنس ${config.material.fa}. از پیکربندی صفحه‌ی اول.`;
  return new URLSearchParams({ title, material: config.material.fa, quantity: String(config.quantity), spec }).toString();
}
