import type { CapabilityValue } from "@/lib/constants";

export interface SupplierMachine {
  name: string;
  model: string;
  count: number;
}

export interface SupplierCertification {
  title: string;
  issuer: string;
  validUntil?: string;
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

export interface Supplier {
  id: string;
  companyName: string;
  description: string;
  city: string;
  address?: string;
  phone?: string;
  website?: string;
  foundedYear?: number;
  employeeCount?: number;
  capabilities: CapabilityValue[];
  machines: SupplierMachine[];
  certifications: SupplierCertification[];
  productionCapacityPerMonth?: number;
  leadTimeDays: number;
  completedJobs: number;
  onTimeDeliveryRate: number; // 0-1
  responseTimeHours: number;
  verified: boolean;
  score: TrustScore;
  /** عناوین نمونه‌کارهای گالری (تا اتصال S3، به‌صورت placeholder نمایش داده می‌شود) */
  galleryTitles?: string[];
}

export interface SupplierFilters {
  q?: string;
  capability?: string;
  city?: string;
}
