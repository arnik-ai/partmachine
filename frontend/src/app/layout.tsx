import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
});

export const metadata: Metadata = {
  title: {
    default: "پارت‌ماشین — بازار صنعتی قطعه‌سازی",
    template: "%s | پارت‌ماشین",
  },
  description:
    "پلتفرم اتصال قطعه‌سازان، کارفرمایان و آزمایشگاه‌های کنترل کیفیت. ثبت RFQ، دریافت استعلام قیمت و پرداخت امن.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="min-h-screen font-[family-name:var(--font-vazirmatn)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
