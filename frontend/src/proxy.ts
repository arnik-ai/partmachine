import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/config";
import { buildCsp, createNonce } from "@/lib/csp";

/**
 * هر صفحه با CSP و nonce تازه (گام 4e فاز ۴). Next nonce را از همین هدر برمی‌دارد و روی
 * اسکریپت‌های خودش می‌گذارد؛ برای همین همه‌ی صفحه‌ها پویا ساخته می‌شوند (layout ریشه).
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development", apiUrl: API_URL });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // همه‌ی صفحه‌ها، جز فایل‌های ثابت Next و فایل‌های پوشه‌ی public (هر مسیری که پسوند دارد)
      source: "/((?!_next/static|_next/image|.*\\.[^/]+$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
