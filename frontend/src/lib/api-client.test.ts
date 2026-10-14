import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { headerOf, jsonResponse, mockFetch } from "@/test/helpers";
import {
  ApiError,
  NetworkError,
  apiFetch,
  configureAuth,
  errorMessage,
  withDemoFallback,
} from "./api-client";

/** خطای یک promise ردشده را برمی‌گرداند (اگر رد نشود، تست شکست می‌خورد) */
async function rejection<T>(promise: Promise<unknown>): Promise<T> {
  try {
    await promise;
  } catch (error) {
    return error as T;
  }
  throw new Error("expected the request to fail");
}

describe("apiFetch", () => {
  beforeEach(() => {
    configureAuth({ getToken: () => null, refresh: async () => null });
  });

  it("sends the access token automatically", async () => {
    configureAuth({ getToken: () => "token-1", refresh: async () => null });
    const fetch = mockFetch(jsonResponse({ ok: true }));
    await apiFetch("/rfqs/mine");
    expect(headerOf(fetch.mock.calls[0][1], "Authorization")).toBe("Bearer token-1");
  });

  it("does not send the token on public requests", async () => {
    configureAuth({ getToken: () => "token-1", refresh: async () => null });
    const fetch = mockFetch(jsonResponse({ items: [] }));
    await apiFetch("/suppliers", { auth: false });
    expect(headerOf(fetch.mock.calls[0][1], "Authorization")).toBeUndefined();
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    let token = "expired";
    const refresh = vi.fn(async () => {
      token = "fresh";
      return token;
    });
    configureAuth({ getToken: () => token, refresh });
    const fetch = mockFetch(
      jsonResponse({ detail: "نشست شما منقضی شده است.", code: "token_invalid" }, 401),
      jsonResponse({ id: "1" }),
    );
    await expect(apiFetch("/auth/me")).resolves.toEqual({ id: "1" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(headerOf(fetch.mock.calls[1][1], "Authorization")).toBe("Bearer fresh");
  });

  it("gives up when the session cannot be refreshed", async () => {
    configureAuth({ getToken: () => "expired", refresh: async () => null });
    mockFetch(
      jsonResponse({ detail: "برای ادامه وارد حساب کاربری شوید.", code: "not_authenticated" }, 401),
    );
    await expect(apiFetch("/auth/me")).rejects.toMatchObject({
      status: 401,
      code: "not_authenticated",
    });
  });

  it("maps validation errors to Persian messages per field", async () => {
    mockFetch(
      jsonResponse(
        {
          detail: "لطفاً خطاهای فرم را برطرف کنید.",
          code: "validation_error",
          errors: [
            { field: "quantity", message: "باید بیشتر از ۰ باشد." },
            { field: "deadline", message: "مهلت تحویل نمی‌تواند تاریخ گذشته باشد." },
          ],
          requestId: "abc123",
        },
        422,
      ),
    );
    const error = await rejection<ApiError>(apiFetch("/rfqs", { method: "POST", body: {} }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe("لطفاً خطاهای فرم را برطرف کنید.");
    expect(error.fieldErrors).toEqual({
      quantity: "باید بیشتر از ۰ باشد.",
      deadline: "مهلت تحویل نمی‌تواند تاریخ گذشته باشد.",
    });
    expect(error.requestId).toBe("abc123");
  });

  it("shows a Persian message when the error body is not JSON", async () => {
    mockFetch(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const error = await rejection<ApiError>(apiFetch("/suppliers", { auth: false }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toContain("۵۰۲");
  });

  it("reports an unreachable server as a NetworkError", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    const error = await rejection<NetworkError>(apiFetch("/suppliers", { auth: false }));
    expect(error).toBeInstanceOf(NetworkError);
    expect(errorMessage(error)).toContain("ارتباط با سرور برقرار نشد");
  });

  it("returns undefined for 204 responses", async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(apiFetch("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});

describe("withDemoFallback outside the demo build", () => {
  it("never replaces a failure with sample data", async () => {
    const fallback = vi.fn(() => "sample");
    await expect(
      withDemoFallback(() => Promise.reject(new NetworkError()), fallback),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(fallback).not.toHaveBeenCalled();
  });
});

describe("withDemoFallback in the demo build", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("uses sample data without contacting any server", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.resetModules();
    const demoClient = await import("./api-client");
    const request = vi.fn(async () => "real");
    await expect(demoClient.withDemoFallback(request, () => "sample")).resolves.toBe("sample");
    expect(request).not.toHaveBeenCalled();
  });
});
