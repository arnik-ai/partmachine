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

/** تاریخ را به تقویم جلالی فارسی قالب‌بندی می‌کند */
export function faDate(date: string | Date): string {
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}
