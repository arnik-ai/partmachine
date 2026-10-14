/** تاریخ‌های بدون ساعت (YYYY-MM-DD) به وقت محلی مرورگر */

export function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function plusDays(days: number, from: string = localToday()): string {
  const date = new Date(`${from}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA");
}

/** چند روز تا تاریخ داده‌شده مانده است (امروز = ۰؛ گذشته = منفی) */
export function daysUntil(isoDate: string, from: string = localToday()): number {
  const target = new Date(`${isoDate}T00:00:00`).getTime();
  const start = new Date(`${from}T00:00:00`).getTime();
  return Math.round((target - start) / 86_400_000);
}
