import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** عدد را با ارقام و جداکننده‌ی فارسی قالب‌بندی می‌کند */
export function faNumber(value: number): string {
  return new Intl.NumberFormat("fa-IR").format(value);
}

/** مبلغ ریالی را به‌صورت خوانا (تومان) نمایش می‌دهد */
export function faToman(rials: number): string {
  return `${faNumber(Math.floor(rials / 10))} تومان`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * تاریخ بدون ساعت (YYYY-MM-DD) همان روز تقویم است و در هر منطقه‌ی زمانی همان روز نمایش
 * داده می‌شود؛ زمان‌های کامل به وقت تهران.
 */
function persianFormat(date: string | Date, withTime: boolean): string {
  const plain = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const timeZone = plain ? "UTC" : "Asia/Tehran";
  const key = `${timeZone}|${withTime}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
      timeZone,
      year: "numeric",
      month: "long",
      day: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
    });
    formatters.set(key, formatter);
  }
  return formatter.format(new Date(date));
}

/** تاریخ به تقویم شمسی، مثل «۲۳ مهر ۱۴۰۵» */
export function faDate(date: string | Date): string {
  return persianFormat(date, false);
}

/** تاریخ و ساعت به تقویم شمسی و وقت تهران */
export function faDateTime(date: string | Date): string {
  return persianFormat(date, true);
}
