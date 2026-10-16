import type { CapabilityValue } from "@/lib/constants";

export interface SupplierMachine {
  name: string;
  model: string;
  count: number;
}

export interface SupplierCertification {
  title: string;
  issuer: string;
  validUntil?: string | null;
}

/** خروجی موتور امتیاز اعتماد — explainable */
export interface TrustScore {
  trust: number; // 0-100
  risk: number; // 0-100 (کمتر بهتر)
  reliability: number; // 0-100
  quality: number; // 0-100
  components: Array<{
    key: string;
    label: string;
    value: number;
    weight: number;
    explanation: string;
  }>;
}

/** تصویر نمونه‌کار؛ `url` نسبی به آدرس API است و بدون ورود نمایش داده می‌شود */
export interface PortfolioImage {
  id: string;
  url: string;
}

export interface Supplier {
  id: string;
  companyName: string;
  description: string;
  city: string;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  foundedYear?: number | null;
  employeeCount?: number | null;
  capabilities: CapabilityValue[];
  machines: SupplierMachine[];
  certifications: SupplierCertification[];
  productionCapacityPerMonth?: number | null;
  leadTimeDays: number;
  completedJobs: number;
  /** سابقه‌ی واقعی در تراشینو (نسخه‌ی نمایشی ندارد) */
  deliveredJobs?: number;
  onTimeJobs?: number;
  ratingCount?: number;
  /** میانگین امتیاز ۱ تا ۵ کارفرماها؛ بدون امتیاز null */
  ratingAverage?: number | null;
  onTimeDeliveryRate: number; // 0-1
  responseTimeHours: number;
  verified: boolean;
  score: TrustScore;
  /** فقط داده‌ی نمونه‌ی نسخه‌ی نمایشی: عنوان نمونه‌کارها بدون تصویر */
  galleryTitles?: string[];
  /** تصاویر واقعی نمونه‌کار */
  portfolio?: PortfolioImage[];
  /** عکس پروفایل (لوگو)؛ بدون عکس، حرف اول نام نمایش داده می‌شود */
  logo?: PortfolioImage | null;
}

/** پروفایل سازمان خود قطعه‌ساز، با وضعیت‌هایی که فقط خودش می‌بیند */
export interface MySupplier extends Supplier {
  /** در فهرست عمومی دیده می‌شود؟ (شهر و حداقل یک خدمت لازم است) */
  listed: boolean;
  /** فقط مدیر سازمان ویرایش می‌کند */
  canEdit: boolean;
}

/** کل پروفایل عمومی، همان‌طور که فرم ویرایش می‌فرستد */
export interface SupplierProfileInput {
  companyName: string;
  description: string;
  city: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  foundedYear: number | null;
  employeeCount: number | null;
  capabilities: CapabilityValue[];
  machines: SupplierMachine[];
  certifications: Array<{ title: string; issuer: string; validUntil: string | null }>;
  productionCapacityPerMonth: number | null;
  leadTimeDays: number;
}

export interface SupplierFilters {
  q?: string;
  capability?: string;
  city?: string;
  /** فقط قطعه‌سازهای تأییدشده */
  verified?: boolean;
  limit?: number;
  offset?: number;
}

/** پاسخ صفحه‌بندی‌شده‌ی سرور */
export interface SupplierPage {
  items: Supplier[];
  total: number;
  limit: number;
  offset: number;
}
