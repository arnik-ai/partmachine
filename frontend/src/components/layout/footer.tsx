import { Factory } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
        <span className="flex items-center gap-2">
          <Factory className="h-4 w-4" />
          پارت‌ماشین — بازار صنعتی قطعه‌سازی
        </span>
        <span>اتصال امن کارفرما، قطعه‌ساز و آزمایشگاه کنترل کیفیت</span>
      </div>
    </footer>
  );
}
