/** خدمات تولیدی قابل‌ارائه در پلتفرم */
export const CAPABILITIES = [
  { value: "cnc", label: "ماشین‌کاری CNC" },
  { value: "injection_molding", label: "تزریق پلاستیک" },
  { value: "sheet_metal", label: "ورق‌کاری فلز" },
  { value: "casting", label: "ریخته‌گری" },
  { value: "welding", label: "جوشکاری" },
  { value: "tooling", label: "قالب‌سازی" },
  { value: "plastic_manufacturing", label: "تولید قطعات پلاستیکی" },
  { value: "forging", label: "آهنگری و فورج" },
  { value: "heat_treatment", label: "عملیات حرارتی" },
  { value: "surface_treatment", label: "پوشش‌دهی و آبکاری" },
] as const;

export type CapabilityValue = (typeof CAPABILITIES)[number]["value"];

export function capabilityLabel(value: string): string {
  return CAPABILITIES.find((c) => c.value === value)?.label ?? value;
}

/** متریال‌های رایج */
export const MATERIALS = [
  "فولاد St37",
  "فولاد CK45",
  "استیل 304",
  "استیل 316",
  "آلومینیوم 6061",
  "آلومینیوم 7075",
  "برنج",
  "مس",
  "چدن",
  "ABS",
  "POM (پلی‌استال)",
  "پلی‌آمید PA6",
  "پلی‌اتیلن PE",
  "سایر",
] as const;

/** شهرهای پرتکرار صنعتی */
export const CITIES = [
  "تهران",
  "اصفهان",
  "تبریز",
  "مشهد",
  "شیراز",
  "کرج",
  "قم",
  "اراک",
  "قزوین",
  "ساوه",
  "سایر",
] as const;

export const ROLES = [
  { value: "buyer", label: "کارفرما / خریدار" },
  { value: "supplier", label: "قطعه‌ساز / تأمین‌کننده" },
  { value: "agent", label: "مأمور خرید" },
  { value: "qc", label: "آزمایشگاه کنترل کیفیت" },
] as const;

export type RoleValue = (typeof ROLES)[number]["value"] | "admin";

export function roleLabel(value: string): string {
  if (value === "admin") return "مدیر پلتفرم";
  return ROLES.find((r) => r.value === value)?.label ?? value;
}
