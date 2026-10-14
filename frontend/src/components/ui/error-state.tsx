"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-client";

/** حالت خطا با پیام فارسی و دکمه‌ی «تلاش دوباره» — هرگز داده‌ی ساختگی جایگزین نمی‌شود. */
export function ErrorState({
  error,
  onRetry,
  title = "اطلاعات بارگذاری نشد",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-card p-8 text-center text-card-foreground"
    >
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}

/** پیام خطای یک فیلد فرم */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}
