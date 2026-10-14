import type { Term } from "./terms";

/** متن نسخه‌دار یک توافق (قوانین ثبت‌نام، تعهدات کارفرما، NDA) — مرجع اصلی متن در سرور است */
export interface Agreement {
  key: string;
  title: string;
  version: string;
  items: Term[];
}

/** نسخه‌ای از متن که کاربر هنگام ارسال فرم پذیرفته است */
export interface AcceptedAgreement {
  key: string;
  version: string;
}
