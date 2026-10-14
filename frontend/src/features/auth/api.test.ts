import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage, headerOf, jsonResponse, mockFetch } from "@/test/helpers";
import { login, logout, refreshSession, restoreSession } from "./api";
import { safeNextPath } from "./next-path";
import { useAuthStore } from "./store";
import type { AuthSession } from "./types";

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
  accessToken: "access-token-123",
  expiresIn: 900,
};

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  useAuthStore.setState({ user: null, accessToken: null, status: "unknown", isDemo: false });
});

describe("login", () => {
  it("keeps the access token in memory only", async () => {
    const fetch = mockFetch(jsonResponse(SESSION));
    await login({ email: "buyer@example.com", password: "Passw0rd-long!" });
    expect(fetch.mock.calls[0][1]?.credentials).toBe("include");
    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      accessToken: "access-token-123",
    });
    expect(storage.dump()).not.toContain("access-token-123");
  });
});

describe("refreshSession", () => {
  it("sends a single request for concurrent callers", async () => {
    const fetch = mockFetch(jsonResponse(SESSION));
    const tokens = await Promise.all([refreshSession(), refreshSession()]);
    expect(tokens).toEqual(["access-token-123", "access-token-123"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = fetch.mock.calls[0][1];
    expect(init?.credentials).toBe("include");
    expect(headerOf(init, "X-Requested-With")).toBe("fetch");
  });

  it("signs the user out when the session is no longer valid", async () => {
    storage.setItem("pm_session_hint", "1");
    useAuthStore.setState({ user: SESSION.user, accessToken: "old", status: "authenticated" });
    mockFetch(jsonResponse({ detail: "نشست شما معتبر نیست.", code: "session_revoked" }, 401));
    await expect(refreshSession()).resolves.toBeNull();
    expect(useAuthStore.getState().status).toBe("anonymous");
    expect(storage.getItem("pm_session_hint")).toBeNull();
  });

  it("keeps the user signed in during a temporary network failure", async () => {
    useAuthStore.setState({ user: SESSION.user, accessToken: "old", status: "authenticated" });
    mockFetch(new TypeError("Failed to fetch"));
    await expect(refreshSession()).resolves.toBeNull();
    expect(useAuthStore.getState().status).toBe("authenticated");
  });
});

describe("restoreSession", () => {
  it("does not contact the server for first-time visitors", async () => {
    const fetch = mockFetch();
    await restoreSession();
    expect(fetch).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe("anonymous");
  });

  it("restores the session after a page reload", async () => {
    storage.setItem("pm_session_hint", "1");
    mockFetch(jsonResponse(SESSION));
    await restoreSession();
    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      accessToken: "access-token-123",
    });
  });

  it("treats the visitor as signed out when the server is down", async () => {
    storage.setItem("pm_session_hint", "1");
    mockFetch(new TypeError("Failed to fetch"));
    await restoreSession();
    expect(useAuthStore.getState().status).toBe("anonymous");
  });
});

describe("logout", () => {
  it("revokes the server session and clears local data", async () => {
    storage.setItem("pm_session_hint", "1");
    storage.setItem("partmachine-demo-rfqs", "[]");
    useAuthStore.setState({
      user: SESSION.user,
      accessToken: "access-token-123",
      status: "authenticated",
    });
    const fetch = mockFetch(new Response(null, { status: 204 }));
    await logout();
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toContain("/auth/logout");
    expect(init?.credentials).toBe("include");
    expect(headerOf(init, "X-Requested-With")).toBe("fetch");
    expect(useAuthStore.getState()).toMatchObject({
      status: "anonymous",
      accessToken: null,
      user: null,
    });
    expect(storage.length).toBe(0);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["?next=/rfqs/123", "/rfqs/123"],
    ["?next=%2Frfqs%3Fpage%3D2", "/rfqs?page=2"],
    ["?next=//evil.example", "/dashboard"],
    ["?next=/%5Cevil.example", "/dashboard"],
    ["?next=https://evil.example", "/dashboard"],
    ["", "/dashboard"],
  ])("%s → %s", (search, expected) => {
    expect(safeNextPath(search)).toBe(expected);
  });
});
