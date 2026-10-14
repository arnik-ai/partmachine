/**
 * بررسی سازگاری قرارداد API در زمان typecheck (بدون اثر در زمان اجرا).
 *
 * `schema.ts` از OpenAPI بک‌اند تولید می‌شود (`npm run gen:api`). اگر شکل پاسخ‌ها یا
 * ورودی‌های سرور تغییر کند و تایپ‌های فرانت هم‌خوان نماند، `npm run typecheck` شکست می‌خورد.
 */
import type { AuthSession, LoginInput, RegisterInput } from "@/features/auth/types";
import type { Quotation } from "@/features/quotations/types";
import type { CreateRfqInput, Rfq, RfqPage } from "@/features/rfq/types";
import type { Supplier, SupplierPage } from "@/features/suppliers/types";
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
];

/** ورودی‌هایی که فرانت می‌فرستد باید برای سرور معتبر باشند */
export type RequestContract = [
  Check<Assignable<LoginInput, Schemas["LoginInput"]>>,
  Check<Assignable<RegisterInput, Schemas["RegisterInput"]>>,
  Check<Assignable<CreateRfqInput, Schemas["CreateRfqInput"]>>,
];

/**
 * خودآزمایی: اگر این سازوکار به‌اشتباه همه‌چیز را بپذیرد، خط زیر دیگر خطا نمی‌دهد و
 * `@ts-expect-error` بی‌استفاده خودش typecheck را شکست می‌دهد.
 */
// @ts-expect-error — null سرور نباید در فیلدی که فقط string می‌پذیرد جا شود
export type SelfTest = Check<Assignable<{ address: string | null }, { address?: string }>>;

/** شکل یکسان همه‌ی پاسخ‌های خطا */
export type ApiErrorBody = Schemas["ErrorResponse"];
