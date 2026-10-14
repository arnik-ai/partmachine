/**
 * پول: سرور همه‌ی مبالغ را به **ریال صحیح** نگه می‌دارد؛ کاربر به **تومان** می‌بیند و وارد می‌کند (P1).
 */

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** ارقام فارسی و عربی را لاتین می‌کند و جداکننده‌ها و فاصله‌ها را حذف می‌کند */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[\s,٬،]/g, "");
}

/** متن ورودی عدد صحیح (ارقام فارسی یا لاتین، با جداکننده) ⇒ عدد، یا null اگر خالی یا نامعتبر باشد */
export function parseInteger(value: string): number | null {
  const digits = normalizeDigits(value);
  if (!/^\d+$/.test(digits)) return null;
  const number = Number(digits);
  return Number.isSafeInteger(number) ? number : null;
}

/** متن ورودی تومان ⇒ عدد صحیح تومان، یا null اگر خالی یا نامعتبر باشد */
export function parseToman(value: string): number | null {
  return parseInteger(value);
}

export function tomanToRials(toman: number): number {
  return toman * 10;
}

export function rialsToToman(rials: number): number {
  return Math.floor(rials / 10);
}

/** سقف مبلغ در سرور: ۱۰^۱۵ ریال */
export const MAX_TOMAN = 10 ** 14;
