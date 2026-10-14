/**
 * کلاینت HTTP مرکزی.
 *
 * - توکن دسترسی (فقط در حافظه) خودکار به درخواست‌ها اضافه می‌شود.
 * - اگر توکن منقضی شده باشد، یک‌بار نشست تازه می‌شود و درخواست تکرار می‌شود.
 * - خطاها همیشه پیام فارسی قابل‌نمایش دارند (`ApiError.message`) و خطای هر فیلد فرم
 *   در `fieldErrors` است.
 * - داده‌ی ساختگی (mock) فقط در حالت دمو (NEXT_PUBLIC_DEMO_MODE=true) استفاده می‌شود.
 */

import { API_CONFIGURED, API_URL, DEMO_MODE } from "./config";
import { faNumber } from "./utils";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fieldErrors: Record<string, string> = {},
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** سرور در دسترس نیست (قطعی اینترنت، خاموش بودن سرور، timeout) */
export class NetworkError extends Error {
  constructor() {
    super(
      "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
    );
    this.name = "NetworkError";
  }
}

/** هدر لازم برای درخواست‌هایی که با کوکی نشست کار می‌کنند (محافظت CSRF) */
export const CSRF_HEADERS = { "X-Requested-With": "fetch" } as const;

type AuthHooks = {
  getToken: () => string | null;
  refresh: () => Promise<string | null>;
};

let authHooks: AuthHooks = { getToken: () => null, refresh: async () => null };

/** ماژول auth این را هنگام بارگذاری صدا می‌زند (برای جلوگیری از import حلقوی) */
export function configureAuth(hooks: AuthHooks) {
  authHooks = hooks;
}

/** برای آپلود با XMLHttpRequest (نمایش پیشرفت): همان توکن و همان تازه‌سازی نشست */
export function currentAccessToken(): string | null {
  return authHooks.getToken();
}

export function refreshAccessToken(): Promise<string | null> {
  return authHooks.refresh();
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** پیش‌فرض true: توکن دسترسی اضافه شود و در صورت انقضا نشست تازه شود */
  auth?: boolean;
};

const TIMEOUT_MS = 15_000;

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new NetworkError();
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  let detail = `خطایی رخ داد (کد ${faNumber(response.status)}). لطفاً دوباره تلاش کنید.`;
  let code: string | undefined;
  let requestId: string | undefined;
  const fieldErrors: Record<string, string> = {};
  try {
    const data = await response.json();
    if (typeof data.detail === "string") detail = data.detail;
    code = data.code;
    requestId = data.requestId;
    for (const err of data.errors ?? []) {
      if (err?.field && err?.message && !fieldErrors[err.field]) {
        fieldErrors[err.field] = err.message;
      }
    }
  } catch {
    // بدنه‌ی غیر JSON (مثلاً خطای proxy)
  }
  return new ApiError(response.status, detail, code, fieldErrors, requestId);
}

export async function apiFetch<T>(
  path: string,
  { body, auth = true, headers, ...init }: RequestOptions = {},
): Promise<T> {
  const attempt = (token: string | null) =>
    send(path, {
      ...init,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  const token = auth ? authHooks.getToken() : null;
  let response = await attempt(token);
  if (response.status === 401 && auth && token) {
    // توکن دسترسی منقضی شده؛ یک‌بار نشست را تازه کن و دوباره بفرست
    const fresh = await authHooks.refresh();
    if (fresh) response = await attempt(fresh);
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * در حالت دمو، اگر بک‌اند در دسترس نباشد داده‌ی نمونه برمی‌گرداند.
 * در هر حالت دیگری خطا عیناً به UI می‌رسد تا پیام خطا و دکمه‌ی «تلاش دوباره» نمایش داده شود.
 */
export async function withDemoFallback<T>(
  request: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  if (!DEMO_MODE) return request();
  if (!API_CONFIGURED) return fallback();
  try {
    return await request();
  } catch (error) {
    if (error instanceof NetworkError) return await fallback();
    throw error;
  }
}

/** پیام قابل‌نمایش برای هر خطا */
export function errorMessage(error: unknown, fallback = "خطایی رخ داد. لطفاً دوباره تلاش کنید."): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return fallback;
}
