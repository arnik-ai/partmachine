"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileSignature,
  Printer,
  ScrollText,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/features/auth/store";
import {
  BUYER_ORDER_TERMS,
  SUPPLIER_TERMS,
} from "@/features/agreements/terms";
import { MOCK_ORDERS } from "@/features/orders/mock";
import { cn, faDate, faNumber, faToman } from "@/lib/utils";
import { useSignatureStore } from "../signature-store";

/** بند قرارداد با شماره‌ی ماده */
function Article({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-bold">
        ماده {faNumber(number)} — {title}
      </h3>
      <div className="text-sm leading-7 text-foreground/90">{children}</div>
    </section>
  );
}

function SignatureBox({
  partyLabel,
  name,
  signedAt,
  onSign,
  signLabel,
}: {
  partyLabel: string;
  name: string;
  signedAt?: string;
  onSign: () => void;
  signLabel: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-3 rounded-xl border p-4 text-center">
      <span className="text-xs text-muted-foreground">{partyLabel}</span>
      <span className="font-semibold">{name}</span>
      {signedAt ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4" />
          امضا شد — {faDate(signedAt)}
        </span>
      ) : (
        <Button onClick={onSign} size="sm" className="no-print">
          <FileSignature className="h-4 w-4" />
          {signLabel}
        </Button>
      )}
    </div>
  );
}

export function ContractDocument({ orderId }: { orderId: string }) {
  const order = MOCK_ORDERS.find((o) => o.id === orderId);
  const { user } = useAuthStore();
  const { signatures, sign } = useSignatureStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!order) {
    return (
      <p className="py-12 text-center text-white/65">سفارش پیدا نشد.</p>
    );
  }

  const sig = mounted ? signatures[order.id] : undefined;
  const buyerName = mounted
    ? (user?.companyName ?? user?.fullName ?? "کارفرمای نمونه")
    : "کارفرمای نمونه";
  const bothSigned = Boolean(sig?.buyerSignedAt && sig?.supplierSignedAt);
  const contractDate = order.stageDates.placed ?? order.expectedDelivery;
  const penaltyPerDayRials = Math.round(order.amountRials * 0.005);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* نوار ابزار — در چاپ مخفی می‌شود */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/orders"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowRight className="h-4 w-4" />
          بازگشت به سفارش‌ها
        </Link>
        <div className="flex items-center gap-2">
          {bothSigned && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-sm font-medium text-success-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-white">قرارداد نافذ است</span>
            </span>
          )}
          <Button onClick={() => window.print()} variant="secondary" size="sm">
            <Printer className="h-4 w-4" />
            چاپ / ذخیره PDF
          </Button>
        </div>
      </div>

      {/* سند قرارداد */}
      <article className="contract-sheet flex flex-col gap-6 rounded-2xl border bg-card p-6 text-card-foreground shadow-sm sm:p-10">
        {/* سربرگ */}
        <header className="flex flex-col items-center gap-2 text-center">
          <ScrollText className="h-8 w-8 text-gold" />
          <h1 className="text-xl font-bold">قرارداد ساخت و تأمین قطعات صنعتی</h1>
          <p className="text-sm text-muted-foreground">
            شماره‌ی قرارداد: <span dir="ltr">{order.id.toUpperCase()}</span> ·
            تاریخ تنظیم: {faDate(contractDate)} · صادرشده به‌صورت خودکار توسط
            پلتفرم پارت‌ماشین
          </p>
          <div className="h-1 w-24 rounded-full bg-gold" />
        </header>

        <Article number={1} title="طرفین قرارداد">
          این قرارداد فی‌مابین <strong>{buyerName}</strong> (از این پس
          «کارفرما») و <strong>{order.supplierName}</strong> به نشانی{" "}
          {order.supplierCity} (از این پس «مجری») در بستر پلتفرم پارت‌ماشین
          منعقد می‌گردد و طرفین با هویت احرازشده در پلتفرم، خود را متعهد به
          مفاد آن می‌دانند.
        </Article>

        <Article number={2} title="موضوع قرارداد">
          ساخت و تحویل <strong>{faNumber(order.quantity)} عدد</strong> از قطعه‌ی
          موضوع سفارش «{order.title}» با متریال <strong>{order.material}</strong>{" "}
          مطابق نقشه‌ها، فایل‌های فنی و تلرانس‌های پیوست درخواست استعلام قیمت
          (RFQ) که جزء لاینفک این قرارداد است.
        </Article>

        <Article number={3} title="مبلغ قرارداد و پرداخت امانی (Escrow)">
          مبلغ کل قرارداد <strong>{faToman(order.amountRials)}</strong> است که
          کارفرما آن را به کیف پول امانی پلتفرم واریز می‌کند. وجه نزد پلتفرم
          مسدود می‌ماند و صرفاً پس از تأیید گزارش کنترل کیفیت و تأیید نهایی
          کارفرما به مجری آزاد می‌شود. پرداخت خارج از پلتفرم ممنوع و فاقد
          پشتیبانی است.
        </Article>

        <Article number={4} title="مدت و محل تحویل">
          مجری متعهد است موضوع قرارداد را حداکثر تا تاریخ{" "}
          <strong>{faDate(order.expectedDelivery)}</strong> در شهر{" "}
          <strong>{order.deliveryCity}</strong> تحویل دهد. ریسک حمل تا لحظه‌ی
          تحویل بر عهده‌ی مجری است مگر آنکه طرفین به‌نحو دیگری توافق کنند.
        </Article>

        <Article number={5} title="تعهدات مجری">
          <ul className="mr-5 list-disc space-y-1.5">
            {SUPPLIER_TERMS.map((t) => (
              <li key={t.id}>
                {t.critical && (
                  <strong className="text-gold">[بند اساسی] </strong>
                )}
                {t.text}
              </li>
            ))}
          </ul>
        </Article>

        <Article number={6} title="تعهدات کارفرما">
          <ul className="mr-5 list-disc space-y-1.5">
            {BUYER_ORDER_TERMS.map((t) => (
              <li key={t.id}>
                {t.critical && (
                  <strong className="text-gold">[بند اساسی] </strong>
                )}
                {t.text}
              </li>
            ))}
          </ul>
        </Article>

        <Article number={7} title="کنترل کیفیت و معیار پذیرش">
          بازرسی توسط آزمایشگاه کنترل کیفیت مرضی‌الطرفین معرفی‌شده در پلتفرم
          انجام می‌شود. معیار پذیرش، انطباق با نقشه و تلرانس‌های پیوست است.
          در صورت رد بخشی از محموله، مجری موظف به اصلاح یا تولید مجدد همان
          بخش بدون هزینه‌ی اضافی است.
        </Article>

        <Article number={8} title="جریمه‌ی تأخیر">
          به ازای هر روز تأخیر غیرموجه در تحویل، معادل نیم‌درصد (۰٫۵٪) از مبلغ
          کل قرارداد ({faToman(penaltyPerDayRials)} به ازای هر روز) و حداکثر تا
          سقف ده‌درصد (۱۰٪) مبلغ قرارداد، از مطالبات مجری کسر می‌گردد. تأخیر
          بیش از بیست روز، حق فسخ و استرداد وجه امانی را برای کارفرما ایجاد
          می‌کند.
        </Article>

        <Article number={9} title="محرمانگی و عدم افشا (NDA)">
          مجری متعهد است کلیه‌ی نقشه‌ها، اسناد فنی، نمونه‌ها و اطلاعات تجاری
          کارفرما را محرمانه نگه دارد، از آن‌ها صرفاً برای اجرای همین قرارداد
          استفاده کند و از تکثیر، افشا یا ساخت برای شخص ثالث خودداری نماید.
          این تعهد تا <strong>پنج سال</strong> پس از خاتمه‌ی قرارداد معتبر است.
        </Article>

        <Article number={10} title="حل اختلاف">
          در صورت بروز اختلاف، موضوع ابتدا از طریق سازوکار داوری و حل اختلاف
          پلتفرم پارت‌ماشین (با استناد به مستندات ثبت‌شده: قرارداد، گزارش QC،
          تاریخچه‌ی سفارش و مکاتبات) رسیدگی می‌شود. در صورت عدم حصول نتیجه،
          مراجع قانونی ذی‌صلاح صالح به رسیدگی خواهند بود.
        </Article>

        <Article number={11} title="اعتبار نسخه‌ی الکترونیکی">
          این قرارداد به‌صورت الکترونیکی تنظیم و با تأیید (امضای) برخط طرفین
          در پلتفرم نافذ می‌گردد. تاریخ، هویت و نسخه‌ی متن تأییدشده توسط هر
          طرف در سامانه ثبت و قابل استناد است و نسخه‌ی چاپی آن معادل نسخه‌ی
          الکترونیکی اعتبار دارد.
        </Article>

        <Separator />

        {/* امضاها */}
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-bold">امضای طرفین</h3>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SignatureBox
              partyLabel="کارفرما"
              name={buyerName}
              signedAt={sig?.buyerSignedAt}
              onSign={() => sign(order.id, "buyer")}
              signLabel="تأیید و امضای کارفرما"
            />
            <SignatureBox
              partyLabel="مجری (قطعه‌ساز)"
              name={order.supplierName}
              signedAt={sig?.supplierSignedAt}
              onSign={() => sign(order.id, "supplier")}
              signLabel="تأیید و امضای مجری (دمو)"
            />
          </div>
          <p className="no-print text-xs text-muted-foreground">
            در نسخه‌ی نهایی، هر طرف فقط از حساب کاربری خودش امضا می‌کند و
            رویداد امضا با کد تأیید پیامکی در سامانه ثبت می‌شود — اینجا برای
            نمایش، هر دو دکمه فعال است.
          </p>
        </section>
      </article>
    </div>
  );
}
