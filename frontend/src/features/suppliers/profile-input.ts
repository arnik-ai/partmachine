/**
 * تبدیل فرم پروفایل قطعه‌ساز به ورودی سرور و برعکس (توابع خالص، با تست واحد).
 */
import type { CapabilityValue } from "@/lib/constants";
import { parseInteger } from "@/lib/money";
import type { MySupplier, SupplierProfileInput } from "./types";

export interface MachineRow {
  key: string;
  name: string;
  model: string;
  count: string;
}

export interface CertificationRow {
  key: string;
  title: string;
  issuer: string;
  validUntil: string;
}

export interface FormState {
  companyName: string;
  description: string;
  city: string;
  address: string;
  phone: string;
  website: string;
  foundedYear: string;
  employeeCount: string;
  productionCapacityPerMonth: string;
  leadTimeDays: string;
  capabilities: CapabilityValue[];
  machines: MachineRow[];
  certifications: CertificationRow[];
}

let rowCounter = 0;
export const newKey = () => `row-${++rowCounter}`;
const text = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

export function initialState(supplier: MySupplier): FormState {
  return {
    companyName: supplier.companyName,
    description: supplier.description,
    city: supplier.city,
    address: text(supplier.address),
    phone: text(supplier.phone),
    website: text(supplier.website),
    foundedYear: text(supplier.foundedYear),
    employeeCount: text(supplier.employeeCount),
    productionCapacityPerMonth: text(supplier.productionCapacityPerMonth),
    leadTimeDays: text(supplier.leadTimeDays),
    capabilities: [...supplier.capabilities],
    machines: supplier.machines.map((m) => ({
      key: newKey(),
      name: m.name,
      model: m.model,
      count: String(m.count),
    })),
    certifications: supplier.certifications.map((c) => ({
      key: newKey(),
      title: c.title,
      issuer: c.issuer,
      validUntil: c.validUntil ?? "",
    })),
  };
}

const NUMBER_FIELDS = [
  "foundedYear",
  "employeeCount",
  "productionCapacityPerMonth",
  "leadTimeDays",
] as const;

/**
 * فرم را به ورودی سرور تبدیل می‌کند. ردیف‌های کاملاً خالی ماشین‌آلات و گواهی‌ها حذف می‌شوند و
 * نگاشت اندیس‌ها نگه داشته می‌شود تا خطای سرور («machines.1.name») زیر همان ردیف بیاید.
 */
export function toInput(form: FormState) {
  const errors: Record<string, string> = {};
  const numbers: Partial<Record<(typeof NUMBER_FIELDS)[number], number | null>> = {};
  for (const field of NUMBER_FIELDS) {
    const raw = form[field].trim();
    const value = raw ? parseInteger(raw) : null;
    if (raw && value === null) errors[field] = "فقط عدد وارد کنید.";
    numbers[field] = value;
  }
  if (!form.companyName.trim()) errors.companyName = "نام شرکت را وارد کنید.";
  if (!form.city.trim()) errors.city = "شهر را وارد کنید.";
  if (form.capabilities.length === 0) errors.capabilities = "حداقل یک خدمت را انتخاب کنید.";
  if (numbers.leadTimeDays === null || numbers.leadTimeDays === undefined) {
    errors.leadTimeDays ??= "زمان معمول تحویل را وارد کنید.";
  }

  const machines = form.machines.filter((m) => m.name.trim() || m.model.trim());
  for (const machine of machines) {
    if (machine.count.trim() && parseInteger(machine.count) === null) {
      errors[`${machine.key}.count`] = "فقط عدد وارد کنید.";
    }
  }
  const certifications = form.certifications.filter((c) => c.title.trim() || c.issuer.trim());
  const input: SupplierProfileInput = {
    companyName: form.companyName,
    description: form.description,
    city: form.city,
    address: form.address.trim() || null,
    phone: form.phone.trim() || null,
    website: form.website.trim() || null,
    foundedYear: numbers.foundedYear ?? null,
    employeeCount: numbers.employeeCount ?? null,
    productionCapacityPerMonth: numbers.productionCapacityPerMonth ?? null,
    leadTimeDays: numbers.leadTimeDays ?? 0,
    capabilities: form.capabilities,
    machines: machines.map((m) => ({
      name: m.name,
      model: m.model,
      count: parseInteger(m.count) ?? 1,
    })),
    certifications: certifications.map((c) => ({
      title: c.title,
      issuer: c.issuer,
      validUntil: c.validUntil || null,
    })),
  };
  return {
    input,
    errors,
    machineKeys: machines.map((m) => m.key),
    certificationKeys: certifications.map((c) => c.key),
  };
}

/** خطاهای سرور برای ردیف‌ها («machines.0.name») را به کلید همان ردیف در فرم برمی‌گرداند */
export function mapRowErrors(
  fieldErrors: Record<string, string>,
  machineKeys: string[],
  certificationKeys: string[],
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [field, message] of Object.entries(fieldErrors)) {
    const match = /^(machines|certifications)\.(\d+)(?:\.(\w+))?$/.exec(field);
    if (!match) {
      mapped[field] = message;
      continue;
    }
    const keys = match[1] === "machines" ? machineKeys : certificationKeys;
    const key = keys[Number(match[2])];
    mapped[key ? `${key}.${match[3] ?? "row"}` : match[1]] = message;
  }
  return mapped;
}
