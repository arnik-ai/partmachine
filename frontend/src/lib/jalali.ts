/**
 * تقویم شمسی (جلالی) بدون وابستگی، با الگوریتم jalaali-js (بورکوفسکی) که برای سال‌های
 * ۱ تا ۳۱۷۷ شمسی دقیق است. تاریخ‌های بدون ساعت با API به قالب ISO میلادی (YYYY-MM-DD)
 * رد و بدل می‌شوند و فقط در رابط کاربری شمسی نمایش داده یا انتخاب می‌شوند.
 */

export type JalaliDate = { jy: number; jm: number; jd: number };

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** به ترتیب getUTCDay (یکشنبه = ۰) */
const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"] as const;

// سال‌های شکست چرخه‌ی ۳۳ساله‌ی کبیسه‌ها
const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
  2456, 3178,
];

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

/** leap: چند سال از آخرین کبیسه گذشته (۰ یعنی همین سال کبیسه است)؛ march: روز نوروز در اسفند میلادی */
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  if (jy < BREAKS[0] || jy >= BREAKS[BREAKS.length - 1]) {
    throw new RangeError(`سال شمسی ${jy} پشتیبانی نمی‌شود`);
  }
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

/** شماره‌ی روز ژولینی تاریخ میلادی */
function g2d(gy: number, gm: number, gd: number): number {
  const d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): JalaliDate {
  const { gy } = d2g(jdn);
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function toJalali(gy: number, gm: number, gd: number): JalaliDate {
  return d2j(g2d(gy, gm, gd));
}

export function toGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  return d2g(j2d(jy, jm, jd));
}

export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

/** شش ماه اول ۳۱ روز، پنج ماه بعد ۳۰ روز، اسفند ۲۹ روز (در سال کبیسه ۳۰ روز) */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** «2026-10-15» ⇒ ۲۳ مهر ۱۴۰۵؛ قالب یا تاریخ ناممکن (مثل 2026-02-30) ⇒ null */
export function isoToJalali(iso: string): JalaliDate | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const [gy, gm, gd] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (gm < 1 || gm > 12 || gd < 1 || gd > 31) return null;
  const date = toJalali(gy, gm, gd);
  const back = toGregorian(date.jy, date.jm, date.jd);
  return back.gy === gy && back.gm === gm && back.gd === gd ? date : null;
}

export function jalaliToIso({ jy, jm, jd }: JalaliDate): string {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

/** ارقام فارسی بدون جداکننده‌ی هزارگان (برای روز و سال) */
export function faDigits(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

/** «۲۳ مهر ۱۴۰۵»؛ با weekday: «پنجشنبه ۲۳ مهر ۱۴۰۵». ورودی نامعتبر همان‌طور برمی‌گردد. */
export function formatJalali(iso: string, options: { weekday?: boolean } = {}): string {
  const date = isoToJalali(iso);
  if (!date) return iso;
  const text = `${faDigits(date.jd)} ${JALALI_MONTHS[date.jm - 1]} ${faDigits(date.jy)}`;
  if (!options.weekday) return text;
  const [gy, gm, gd] = iso.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay()]} ${text}`;
}
