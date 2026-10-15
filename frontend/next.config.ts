import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// NEXT_OUTPUT=export: خروجی استاتیک نسخه‌ی نمایشی (GitHub Pages)؛ در غیر این صورت سرور standalone
const isStaticExport = process.env.NEXT_OUTPUT === "export";
const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    // نسخه‌ی سروری (واقعی) هرگز نباید با داده‌ی نمایشی ساخته شود
    if (isDemo && !isStaticExport) {
      throw new Error(
        "NEXT_PUBLIC_DEMO_MODE=true is only allowed for the static demo export (NEXT_OUTPUT=export).",
      );
    }
    // خروجی استاتیک نشست سروری و صفحات پویا ندارد؛ فقط برای نسخه‌ی نمایشی (GitHub Pages) است
    if (isStaticExport && !isDemo) {
      throw new Error(
        "NEXT_OUTPUT=export is only supported for the demo build (set NEXT_PUBLIC_DEMO_MODE=true).",
      );
    }
  }

  return {
    reactStrictMode: true,
    poweredByHeader: false,
    output: isStaticExport ? "export" : "standalone",
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
    images: isStaticExport ? { unoptimized: true } : undefined,
    ...(isStaticExport
      ? {}
      : {
          async headers() {
            return [
              { source: "/:path*", headers: securityHeaders },
              // نسخه‌ی تازه‌ی service worker بدون ماندن در کش مرورگر برسد
              { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
            ];
          },
        }),
  };
}
