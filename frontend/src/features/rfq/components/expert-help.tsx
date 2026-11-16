import { MessageCircle, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EXPERT_CONTACT, EXPERT_WHATSAPP_TEXT } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** «۰۹۱۲۱۲۳۴۵۶۷» برای نمایش؛ ارقام فارسی و فاصله‌ی خوانا */
function displayPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const grouped =
    digits.length === 11
      ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
      : digits;
  return grouped.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/**
 * تماس با کارشناس برای پیشنهاد روش ساخت، کنار انتخاب «نوع خدمت تولیدی».
 * اگر شماره‌ای در `EXPERT_CONTACT` تنظیم نشده باشد، چیزی نمایش داده نمی‌شود.
 */
export function ExpertHelp() {
  const { phone, whatsapp, hours } = EXPERT_CONTACT;
  if (!phone && !whatsapp) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">روش ساخت قطعه را نمی‌دانید؟</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          کارشناس تراشینو پیش از ثبت درخواست، روش ساخت و متریال مناسب را پیشنهاد می‌دهد.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {phone && (
          <a
            href={`tel:${phone}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shadow-soft")}
          >
            <Phone className="h-4 w-4" aria-hidden />
            تماس با کارشناس
            <span dir="ltr" className="text-xs text-muted-foreground">
              {displayPhone(phone)}
            </span>
          </a>
        )}
        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(EXPERT_WHATSAPP_TEXT)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shadow-soft")}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            واتساپ
          </a>
        )}
      </div>
      {hours && <p className="text-xs text-muted-foreground">{hours}</p>}
    </div>
  );
}
