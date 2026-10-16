import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import { DemoBanner } from "@/components/layout/demo-banner";
import { PwaSetup } from "@/components/layout/pwa-setup";
import { Providers } from "./providers";
import "./globals.css";

// فونت داخل خود سایت (مجوز OFL)؛ build و نمایش به سرور خارجی وابسته نیست
const vazirmatn = localFont({
  src: "../fonts/Vazirmatn-Variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-vazirmatn",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // تا لبه‌ی صفحه در آیفون‌های با بریدگی؛ فاصله‌ها با safe-area در globals.css
  viewportFit: "cover",
  themeColor: "#212d48",
};

export const metadata: Metadata = {
  title: {
    default: "تراشینو — سفارش ساخت قطعات صنعتی",
    template: "%s | تراشینو",
  },
  description:
    "پلتفرم اتصال قطعه‌سازان و کارفرمایان: ثبت درخواست، دریافت پیشنهاد قیمت، قرارداد و پیگیری سفارش.",
  applicationName: "تراشینو",
  // نصب روی آیفون (Add to Home Screen): عنوان و نوار وضعیت؛ محتوا زیر نوار وضعیت شروع می‌شود
  appleWebApp: { capable: true, title: "تراشینو", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // نسخه‌های قدیمی‌تر iOS فقط نام قدیمی این تگ را می‌شناسند
  other: { "apple-mobile-web-app-capable": "yes" },
};

// CSP با nonce (گام 4e): هر صفحه هنگام درخواست ساخته می‌شود تا Next بتواند nonce همان درخواست را روی
// اسکریپت‌ها بگذارد. خروجی استاتیک نسخه‌ی نمایشی درخواستی ندارد و CSP هم ندارد.
const isStaticExport = process.env.NEXT_OUTPUT === "export";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!isStaticExport) await connection();
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="min-h-screen font-[family-name:var(--font-vazirmatn)] antialiased">
        <PwaSetup />
        <DemoBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
