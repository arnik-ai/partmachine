/**
 * بررسی سازگاری قرارداد API در زمان typecheck (بدون اثر در زمان اجرا).
 *
 * `schema.ts` از OpenAPI بک‌اند تولید می‌شود (`npm run gen:api`). اگر شکل پاسخ‌ها یا
 * ورودی‌های سرور تغییر کند و تایپ‌های فرانت هم‌خوان نماند، `npm run typecheck` شکست می‌خورد.
 */
import type {
  AdminUser,
  AdminUserPage,
  AdminVerification,
  AdminVerificationPage,
  AuditEventPage,
} from "@/features/admin/types";
import type { Agreement } from "@/features/agreements/types";
import type { UploadedFile } from "@/lib/upload";
import type {
  AuthOptions,
  AuthSession,
  ChangePasswordInput,
  LoginInput,
  PasswordResetConfirmInput,
  RegisterInput,
} from "@/features/auth/types";
import type {
  Invite,
  InviteCreated,
  InviteInfo,
  Organization,
} from "@/features/organization/types";
import type { Contract, UpdateContractInput } from "@/features/contracts/types";
import type { OrderDetail, OrderPage } from "@/features/orders/types";
import type {
  MyQuotation,
  MyQuotationPage,
  Quotation,
  QuotationInput,
} from "@/features/quotations/types";
import type { CreateRfqInput, Rfq, RfqPage } from "@/features/rfq/types";
import type {
  MySupplier,
  Supplier,
  SupplierPage,
  SupplierProfileInput,
} from "@/features/suppliers/types";
import type { SubmitVerificationInput, Verification } from "@/features/verification/types";
import type { components } from "./schema";

type Schemas = components["schemas"];
type Assignable<From, To> = [From] extends [To] ? true : false;
type Check<T extends true> = T;

/** پاسخ‌های سرور باید در تایپ‌هایی که فرانت مصرف می‌کند جا شوند */
export type ResponseContract = [
  Check<Assignable<Schemas["AuthSession"], AuthSession>>,
  Check<Assignable<Schemas["SupplierOut"], Supplier>>,
  Check<Assignable<Schemas["SupplierPage"], SupplierPage>>,
  Check<Assignable<Schemas["RfqOut"], Rfq>>,
  Check<Assignable<Schemas["RfqPage"], RfqPage>>,
  Check<Assignable<Schemas["QuotationOut"], Quotation>>,
  Check<Assignable<Schemas["MyQuotationOut"], MyQuotation>>,
  Check<Assignable<Schemas["MyQuotationPage"], MyQuotationPage>>,
  Check<Assignable<Schemas["AgreementOut"], Agreement>>,
  Check<Assignable<Schemas["OrganizationOut"], Organization>>,
  Check<Assignable<Schemas["InviteOut"], Invite>>,
  Check<Assignable<Schemas["InviteCreatedOut"], InviteCreated>>,
  Check<Assignable<Schemas["InviteInfoOut"], InviteInfo>>,
  Check<Assignable<Schemas["FileOut"], UploadedFile>>,
  Check<Assignable<Schemas["MySupplierOut"], MySupplier>>,
  Check<Assignable<Schemas["VerificationOut"], Verification>>,
  Check<Assignable<Schemas["AdminVerificationOut"], AdminVerification>>,
  Check<Assignable<Schemas["AdminVerificationPage"], AdminVerificationPage>>,
  Check<Assignable<Schemas["AdminUserOut"], AdminUser>>,
  Check<Assignable<Schemas["AdminUserPage"], AdminUserPage>>,
  Check<Assignable<Schemas["AuditEventPage"], AuditEventPage>>,
  Check<Assignable<Schemas["AuthOptionsOut"], AuthOptions>>,
  Check<Assignable<Schemas["MessageOut"], { detail: string }>>,
  Check<Assignable<Schemas["OrderDetailOut"], OrderDetail>>,
  Check<Assignable<Schemas["OrderPage"], OrderPage>>,
  Check<Assignable<Schemas["ContractOut"], Contract>>,
];

/** ورودی‌هایی که فرانت می‌فرستد باید برای سرور معتبر باشند */
export type RequestContract = [
  Check<Assignable<LoginInput, Schemas["LoginInput"]>>,
  Check<Assignable<RegisterInput, Schemas["RegisterInput"]>>,
  Check<Assignable<CreateRfqInput, Schemas["CreateRfqInput"]>>,
  Check<Assignable<QuotationInput, Schemas["CreateQuotationInput"]>>,
  Check<Assignable<{ quotesDue: string; deadline?: string }, Schemas["RescheduleRfqInput"]>>,
  Check<Assignable<SupplierProfileInput, Schemas["SupplierProfileInput"]>>,
  Check<Assignable<SubmitVerificationInput, Schemas["SubmitVerificationInput"]>>,
  Check<Assignable<{ reason: string }, Schemas["DecisionInput"]>>,
  Check<Assignable<{ reason: string }, Schemas["AdminActionInput"]>>,
  Check<Assignable<ChangePasswordInput, Schemas["ChangePasswordInput"]>>,
  Check<Assignable<{ email: string }, Schemas["PasswordResetRequestInput"]>>,
  Check<Assignable<PasswordResetConfirmInput, Schemas["PasswordResetConfirmInput"]>>,
  Check<Assignable<{ phone: string }, Schemas["PhoneCodeInput"]>>,
  Check<Assignable<{ phone: string; code: string }, Schemas["PhoneVerifyInput"]>>,
  Check<Assignable<{ reason: string }, Schemas["CancelOrderInput"]>>,
  Check<Assignable<{ note: string; fileId?: string | null }, Schemas["ShipOrderInput"]>>,
  Check<Assignable<{ note: string }, Schemas["ConfirmDeliveryInput"]>>,
  Check<Assignable<UpdateContractInput, Schemas["UpdateContractInput"]>>,
  Check<Assignable<{ version: number; password: string }, Schemas["SignContractInput"]>>,
  Check<Assignable<{ note: string }, Schemas["ChangeRequestInput"]>>,
];

/**
 * خودآزمایی: اگر این سازوکار به‌اشتباه همه‌چیز را بپذیرد، خط زیر دیگر خطا نمی‌دهد و
 * `@ts-expect-error` بی‌استفاده خودش typecheck را شکست می‌دهد.
 */
// @ts-expect-error — null سرور نباید در فیلدی که فقط string می‌پذیرد جا شود
export type SelfTest = Check<Assignable<{ address: string | null }, { address?: string }>>;

/** شکل یکسان همه‌ی پاسخ‌های خطا */
export type ApiErrorBody = Schemas["ErrorResponse"];
