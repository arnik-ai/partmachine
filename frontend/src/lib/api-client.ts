/**
 * کلاینت HTTP مرکزی.
 *
 * تمام ماژول‌های feature از طریق همین لایه با بک‌اند صحبت می‌کنند.
 * تا زمان آماده‌شدن بک‌اند (افزایش ۲)، هر ماژول روی خطای شبکه به
 * داده‌ی Mock خودش fallback می‌کند (حالت دمو).
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** خطای دسترسی به شبکه — نشانه‌ی در دسترس نبودن بک‌اند (حالت دمو) */
export class NetworkError extends Error {
  constructor() {
    super("backend unreachable");
    this.name = "NetworkError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  accessToken?: string | null;
};

export async function apiFetch<T>(
  path: string,
  { body, accessToken, headers, ...init }: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: init.signal ?? AbortSignal.timeout(8000),
    });
  } catch {
    throw new NetworkError();
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      detail = typeof data.detail === "string" ? data.detail : detail;
    } catch {
      // بدنه‌ی غیر JSON
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** اجرای درخواست با fallback روی داده‌ی دمو وقتی بک‌اند در دسترس نیست */
export async function withDemoFallback<T>(
  request: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof NetworkError) return await fallback();
    throw error;
  }
}
