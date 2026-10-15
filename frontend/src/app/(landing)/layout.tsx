import localFont from "next/font/local";
import "@/features/landing/landing.css";

// اعداد و متن لاتین صفحه‌ی اول (مجوز OFL، داخل خود سایت؛ CSP قلم بیرونی را اجازه نمی‌دهد)
const outfit = localFont({
  src: "../../fonts/Outfit-Variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-outfit",
});

/** صفحه‌ی اول سرصفحه و پانویس خودش را دارد؛ سرصفحه‌ی پلتفرم اینجا نمی‌آید */
export default function LandingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={outfit.variable}>{children}</div>;
}
