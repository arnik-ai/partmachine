import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store";
import type { AuthSession } from "@/features/auth/types";
import { MemoryStorage, jsonResponse, mockFetch } from "@/test/helpers";
import { enableTwoFactor } from "./api";

const SESSION: AuthSession = {
  user: {
    id: "u1",
    email: "buyer@example.com",
    fullName: "مریم احمدی",
    role: "buyer",
    organizationId: "o1",
    companyName: "صنایع نمونه",
    verified: false,
  },
  accessToken: "access-token-new",
  expiresIn: 900,
};

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  useAuthStore.setState({
    user: SESSION.user,
    accessToken: "access-token-old",
    status: "authenticated",
    isDemo: false,
  });
});

describe("enableTwoFactor", () => {
  it("keeps this browser signed in and returns the one-time recovery codes", async () => {
    const fetch = mockFetch(
      jsonResponse({ recoveryCodes: ["code-1", "code-2"] }),
      // روشن شدن، توکن دسترسی قبلی را باطل می‌کند؛ نشست همین مرورگر با refresh ادامه می‌یابد
      jsonResponse({ detail: "نشست شما معتبر نیست.", code: "token_invalid" }, 401),
      jsonResponse(SESSION),
      jsonResponse({ ...SESSION.user, twoFactorEnabled: true }),
    );

    const codes = await enableTwoFactor("setup-token", "123456", "Passw0rd-long!");

    expect(codes).toEqual(["code-1", "code-2"]);
    // بدون کوکی، سرور نشست این مرورگر را نمی‌شناسد و آن را هم می‌بندد
    expect(fetch.mock.calls[0][1]?.credentials).toBe("include");
    expect(String(fetch.mock.calls[2][0])).toContain("/auth/refresh");
    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      accessToken: "access-token-new",
      user: { twoFactorEnabled: true },
    });
  });
});
