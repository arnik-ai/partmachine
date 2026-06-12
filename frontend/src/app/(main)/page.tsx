import Link from "next/link";
import {
  FileSearch,
  Handshake,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CAPABILITIES } from "@/lib/constants";

const STEPS = [
  {
    icon: FileSearch,
    title: "۱. درخواست خود را ثبت کنید",
    description:
      "نقشه و فایل CAD قطعه را آپلود کنید؛ متریال، تعداد و مهلت تحویل را مشخص کنید.",
  },
  {
    icon: Handshake,
    title: "۲. استعلام قیمت بگیرید",
    description:
      "هوش مصنوعی بهترین قطعه‌سازان را پیشنهاد می‌دهد و آن‌ها قیمت و زمان تحویل ارائه می‌کنند.",
  },
  {
    icon: Wallet,
    title: "۳. پرداخت امن (Escrow)",
    description:
      "مبلغ نزد پلتفرم امانت می‌ماند و فقط پس از تأیید کنترل کیفیت و شما آزاد می‌شود.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-16 py-8">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 text-center">
        <h1 className="max-w-3xl text-3xl font-bold leading-relaxed sm:text-4xl sm:leading-relaxed">
          بازار صنعتی <span className="text-primary">قطعه‌سازی</span> ایران
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          کارفرمایان را به بهترین قطعه‌سازان و آزمایشگاه‌های کنترل کیفیت متصل
          می‌کنیم — با امتیاز اعتماد هوش مصنوعی و پرداخت امن امانی.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/rfqs/new" className={buttonVariants({ size: "lg" })}>
            ثبت درخواست ساخت قطعه
          </Link>
          <Link
            href="/suppliers"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            جستجوی قطعه‌سازان
          </Link>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-success" />
          پرداخت امانی + بازرسی کیفیت مستقل روی تمام سفارش‌ها
        </div>
      </section>

      {/* خدمات تولیدی */}
      <section className="flex flex-col gap-6">
        <h2 className="text-center text-2xl font-bold">خدمات تولیدی</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CAPABILITIES.map((cap) => (
            <Link
              key={cap.value}
              href={`/suppliers?capability=${cap.value}`}
              className="rounded-lg border bg-card p-4 text-center text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              {cap.label}
            </Link>
          ))}
        </div>
      </section>

      {/* چطور کار می‌کند */}
      <section className="flex flex-col gap-6">
        <h2 className="text-center text-2xl font-bold">چطور کار می‌کند؟</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.title}>
              <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                <div className="rounded-full bg-accent p-3">
                  <step.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
