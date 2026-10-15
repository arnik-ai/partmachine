import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "./csp";

function directive(csp: string, name: string): string {
  return csp.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";
}

describe("buildCsp", () => {
  it("allows only scripts with this request's nonce in production", () => {
    const csp = buildCsp({
      nonce: "abc123",
      dev: false,
      apiUrl: "https://app.partmachine.ir/api/v1",
    });
    const scripts = directive(csp, "script-src");
    expect(scripts).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(scripts).not.toContain("unsafe");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://app.partmachine.ir");
    // روی https، آدرس‌های http جامانده امن درخواست می‌شوند
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("adds what local development needs, and only there", () => {
    const csp = buildCsp({ nonce: "n", dev: true, apiUrl: "http://localhost:8100/api/v1" });
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' http://localhost:8100 ws:");
    expect(directive(csp, "img-src")).toContain("http://localhost:8100");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});

describe("createNonce", () => {
  it("is random base64 of 16 bytes", () => {
    const first = createNonce();
    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(first);
  });
});
