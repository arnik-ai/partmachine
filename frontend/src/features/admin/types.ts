import type { RoleValue } from "@/lib/constants";
import type { Verification, VerificationStatus } from "@/features/verification/types";

export interface AdminVerification extends Verification {
  organizationId: string;
  supplierId: string | null;
  companyName: string;
  city: string;
  submittedByName: string;
  submittedByEmail: string;
  decidedByName?: string | null;
}

export interface AdminVerificationPage {
  items: AdminVerification[];
  total: number;
  limit: number;
  offset: number;
}

export type VerificationFilter = VerificationStatus | "all";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleValue;
  orgRole: "owner" | "member";
  organizationId: string;
  organizationName: string;
  isActive: boolean;
  /** تأیید دستی مأمور خرید و آزمایشگاه */
  verified: boolean;
  /** برای قطعه‌سازها: نشان «تأییدشده»ی سازمان */
  supplierId?: string | null;
  supplierVerified?: boolean | null;
  createdAt: string;
}

export interface AdminUserPage {
  items: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUserFilters {
  q?: string;
  role?: RoleValue;
  active?: boolean;
}

export interface AuditEvent {
  id: string;
  createdAt: string;
  action: string;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  entityType: string;
  entityId?: string | null;
  data: Record<string, unknown>;
  requestId?: string | null;
}

export interface AuditEventPage {
  items: AuditEvent[];
  hasMore: boolean;
  limit: number;
  offset: number;
}

export interface AuditFilters {
  action?: string;
  actor?: string;
  since?: string;
  until?: string;
}

/** برچسب فارسی رویدادها؛ رویداد ناشناخته با همان نام فنی نمایش داده می‌شود */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "admin.created": "ساخت حساب ادمین",
  "admin.user_activated": "فعال‌سازی کاربر",
  "admin.user_deactivated": "غیرفعال‌سازی کاربر",
  "admin.user_verified": "تأیید حساب کاربر",
  "admin.user_unverified": "لغو تأیید حساب کاربر",
  "auth.refresh_reuse_detected": "استفاده‌ی مشکوک از نشست (ابطال)",
  "file.uploaded": "بارگذاری فایل",
  "file.deleted": "حذف فایل",
  "file.downloaded": "دانلود فایل",
  "organization.invite_created": "ساخت لینک دعوت",
  "organization.invite_revoked": "ابطال لینک دعوت",
  "organization.member_joined": "پیوستن عضو",
  "organization.member_removed": "حذف عضو",
  "quotation.submitted": "ثبت پیشنهاد",
  "quotation.resubmitted": "ثبت دوباره‌ی پیشنهاد",
  "quotation.revised": "ویرایش پیشنهاد",
  "quotation.withdrawn": "پس‌گرفتن پیشنهاد",
  "rfq.awarded": "انتخاب برنده",
  "rfq.created": "ثبت درخواست",
  "rfq.cancelled": "لغو درخواست",
  "rfq.rescheduled": "تمدید مهلت درخواست",
  "rfq.nda_accepted": "پذیرش تعهد عدم افشا",
  "supplier.profile_updated": "ویرایش پروفایل قطعه‌ساز",
  "verification.submitted": "ارسال مدارک تأیید",
  "verification.approved": "تأیید مدارک",
  "verification.rejected": "رد مدارک",
  "verification.revoked": "لغو تأیید قطعه‌ساز",
};

/** گروه‌های فیلتر رویدادها (پیشوند) */
export const AUDIT_ACTION_GROUPS: Array<{ value: string; label: string }> = [
  { value: "admin", label: "اقدام‌های ادمین" },
  { value: "verification", label: "تأیید هویت" },
  { value: "file", label: "فایل‌ها" },
  { value: "rfq", label: "درخواست‌ها" },
  { value: "quotation", label: "پیشنهادها" },
  { value: "organization", label: "سازمان و اعضا" },
  { value: "supplier", label: "پروفایل قطعه‌ساز" },
  { value: "auth", label: "امنیت نشست" },
];
