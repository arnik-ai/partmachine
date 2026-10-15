/**
 * Content-Security-Policy صفحه‌ها (گام 4e فاز ۴).
 *
 * هر درخواست یک nonce تازه می‌گیرد و فقط اسکریپت‌هایی اجرا می‌شوند که Next با همین nonce ساخته است؛
 * 'strict-dynamic' اجازه می‌دهد همان‌ها بقیه‌ی تکه‌های برنامه را بار کنند. اسکریپتی که مهاجم در صفحه
 * تزریق کند nonce را ندارد و اجرا نمی‌شود.
 *
 * style-src عمداً 'unsafe-inline' دارد: React ویژگی style را در HTML سرور می‌نویسد و CSS تزریق‌شده
 * نمی‌تواند کد اجرا کند.
 */

export type CspOptions = {
  nonce: string;
  /** حالت توسعه: React برای خطاهای خواناتر به eval نیاز دارد و بارگذاری دوباره از websocket است */
  dev: boolean;
  /** آدرس API؛ در تولید همان دامنه‌ی سایت است */
  apiUrl: string;
};

export function buildCsp({ nonce, dev, apiUrl }: CspOptions): string {
  const api = new URL(apiUrl);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${api.origin}`,
    "font-src 'self'",
    `connect-src 'self' ${api.origin}${dev ? " ws:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // روی https هر آدرس http جامانده هم امن درخواست شود؛ روی آزمون محلی (http) این کار سایت را می‌شکند
  if (api.protocol === "https:") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** ۱۶ بایت تصادفی (base64)، برای هر درخواست یک بار */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
