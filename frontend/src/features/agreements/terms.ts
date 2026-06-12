/**
 * متن قوانین و تعهدات هر نقش.
 * در افزایش‌های بعدی، پذیرش هر بند با تاریخ و نسخه در بک‌اند ثبت می‌شود
 * (audit log) تا قابل استناد باشد.
 */

export interface Term {
  id: string;
  text: string;
  /** بندهای حیاتی با نشان ویژه نمایش داده می‌شوند */
  critical?: boolean;
}

/** تعهدات کارفرما — قبل از انتشار هر RFQ باید تیک بخورد */
export const BUYER_ORDER_TERMS: Term[] = [
  {
    id: "buyer-info-accuracy",
    text: "صحت نقشه‌ها، مشخصات فنی و اطلاعات ثبت‌شده را تأیید می‌کنم و مسئولیت خطای اطلاعات با من است.",
  },
  {
    id: "buyer-escrow",
    text: "می‌پذیرم که پرداخت فقط از طریق کیف پول امانی (Escrow) پلتفرم انجام شود و پرداخت خارج از پلتفرم ممنوع است.",
    critical: true,
  },
  {
    id: "buyer-qc-respect",
    text: "نتیجه‌ی بازرسی کنترل کیفیت مرضی‌الطرفین را به‌عنوان مبنای تأیید یا رد قطعات می‌پذیرم.",
  },
  {
    id: "buyer-platform-rules",
    text: "قوانین عمومی پلتفرم و فرآیند حل اختلاف را مطالعه کرده و می‌پذیرم.",
  },
];

/** تعهدات مجری (قطعه‌ساز) — هنگام ثبت‌نام باید تیک بخورد */
export const SUPPLIER_TERMS: Term[] = [
  {
    id: "supplier-nda",
    text: "تعهد عدم افشا (NDA): نقشه‌ها، فایل‌های فنی و اطلاعات کارفرما را محرمانه نگه می‌دارم، به شخص ثالث منتقل نمی‌کنم و فقط برای انجام همان سفارش استفاده می‌کنم.",
    critical: true,
  },
  {
    id: "supplier-info-accuracy",
    text: "اطلاعات پروفایل، ماشین‌آلات، گواهینامه‌ها و توانمندی‌هایی که ثبت می‌کنم واقعی است.",
  },
  {
    id: "supplier-quality",
    text: "قطعات را مطابق نقشه و تلرانس‌های اعلام‌شده تولید می‌کنم و نتیجه‌ی بازرسی QC را می‌پذیرم.",
  },
  {
    id: "supplier-deadline",
    text: "به زمان تحویل اعلام‌شده در استعلام قیمت خود پایبند می‌مانم و تأخیر بر امتیاز اعتمادم اثر می‌گذارد.",
  },
  {
    id: "supplier-escrow",
    text: "تسویه فقط از طریق پلتفرم انجام می‌شود و معامله‌ی مستقیم خارج از پلتفرم با کارفرمای معرفی‌شده ممنوع است.",
    critical: true,
  },
];

/** تعهدات کارفرما هنگام ثبت‌نام (نسخه‌ی خلاصه) */
export const BUYER_SIGNUP_TERMS: Term[] = [
  {
    id: "buyer-signup-rules",
    text: "قوانین عمومی پلتفرم را مطالعه کرده و می‌پذیرم.",
  },
  {
    id: "buyer-signup-escrow",
    text: "می‌پذیرم پرداخت سفارش‌ها از طریق کیف پول امانی پلتفرم انجام شود.",
    critical: true,
  },
];

/** تعهدات آزمایشگاه QC هنگام ثبت‌نام */
export const QC_TERMS: Term[] = [
  {
    id: "qc-impartial",
    text: "بازرسی‌ها را بی‌طرفانه و بر اساس استانداردهای اعلام‌شده انجام می‌دهم.",
    critical: true,
  },
  {
    id: "qc-nda",
    text: "تعهد عدم افشا: نقشه‌ها و نتایج آزمون را محرمانه نگه می‌دارم.",
    critical: true,
  },
  {
    id: "qc-docs",
    text: "گزارش‌ها و گواهی‌های صادره معتبر و قابل استناد است و مسئولیت صحت آن با آزمایشگاه است.",
  },
];

/** تعهدات مأمور خرید هنگام ثبت‌نام */
export const AGENT_TERMS: Term[] = [
  {
    id: "agent-authority",
    text: "از طرف کارفرمای خود مجاز به ثبت درخواست و مذاکره هستم.",
  },
  {
    id: "agent-nda",
    text: "اطلاعات فنی و قیمت‌های دریافتی را فقط برای همان فرآیند خرید استفاده می‌کنم.",
    critical: true,
  },
];

export function signupTermsForRole(role: string): Term[] {
  switch (role) {
    case "supplier":
      return SUPPLIER_TERMS;
    case "qc":
      return QC_TERMS;
    case "agent":
      return AGENT_TERMS;
    default:
      return BUYER_SIGNUP_TERMS;
  }
}
