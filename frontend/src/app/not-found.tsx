import Link from "next/link";
import { BackButton } from "@/components/layout/back-button";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
      <BackButton fallback="/" className="absolute start-4 top-6" />
      <p className="text-5xl font-bold text-foreground">۴۰۴</p>
      <h1 className="text-xl font-bold">صفحه‌ای که دنبالش بودید پیدا نشد</h1>
      <p className="text-sm text-muted-foreground">
        ممکن است آدرس اشتباه وارد شده باشد یا این صفحه جابه‌جا شده باشد.
      </p>
      <Link href="/" className={buttonVariants()}>
        بازگشت به صفحه‌ی اصلی
      </Link>
    </main>
  );
}
