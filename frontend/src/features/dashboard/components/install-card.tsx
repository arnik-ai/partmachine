"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from "@/lib/pwa";
import { useHydrated } from "@/lib/use-hydrated";

const DISMISS_KEY = "pm-install-card-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * پیشنهاد نصب اپ روی داشبورد: در اندروید و ویندوز (Chrome/Edge) دکمه‌ی «نصب اپ»، در آیفون
 * راهنمای «Add to Home Screen». پس از نصب یا بستن دیگر نمایش داده نمی‌شود.
 */
export function InstallCard() {
  const promptable = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  // وضعیت دستگاه فقط در مرورگر معلوم است؛ پیش از hydration چیزی نمایش داده نمی‌شود
  const hydrated = useHydrated();
  const [dismissed, setDismissed] = useState(false);

  if (!hydrated || dismissed || readDismissed() || isStandalone()) return null;
  const ios = isIos();
  if (!promptable && !ios) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // بدون حافظه‌ی مرورگر فقط تا بارگذاری بعدی پنهان می‌ماند
    }
    setDismissed(true);
  }

  return (
    <Card className="rounded-2xl border-gold/40">
      <CardContent className="flex items-start gap-3 p-4 text-sm">
        <div className="rounded-xl bg-primary/[0.08] p-2.5 text-primary">
          {ios ? <Share className="h-5 w-5" aria-hidden /> : <Download className="h-5 w-5" aria-hidden />}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <span className="font-semibold">تراشینو را مثل اپ نصب کنید</span>
          {ios ? (
            <span className="text-muted-foreground">
              در Safari دکمه‌ی اشتراک‌گذاری (مربع با فلش رو به بالا) را بزنید و بعد «Add to Home
              Screen» را انتخاب کنید تا آیکون تراشینو روی صفحه‌ی گوشی‌تان بیاید.
            </span>
          ) : (
            <>
              <span className="text-muted-foreground">
                با یک لمس، آیکون تراشینو روی گوشی یا کامپیوترتان قرار می‌گیرد و تمام‌صفحه باز
                می‌شود.
              </span>
              <Button size="sm" className="self-start" onClick={() => void promptInstall()}>
                <Download className="h-4 w-4" aria-hidden />
                نصب اپ
              </Button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="بستن پیشنهاد نصب"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </CardContent>
    </Card>
  );
}
