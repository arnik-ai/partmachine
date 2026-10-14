"use client";

import { Input } from "@/components/ui/input";
import { parseToman } from "@/lib/money";
import { faNumber } from "@/lib/utils";

/**
 * ورود مبلغ به تومان. ارقام فارسی، عربی و لاتین و جداکننده‌ها پذیرفته می‌شوند و مبلغ خوانا
 * (تومان و ریال) زیر فیلد نمایش داده می‌شود تا صفرها اشتباه نشود.
 */
export function TomanInput({
  id,
  value,
  onChange,
  required,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const toman = parseToman(value);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          className="pl-14 text-left"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="مثلاً 185000000"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          تومان
        </span>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {toman && toman > 0
          ? `${faNumber(toman)} تومان (${faNumber(toman * 10)} ریال)`
          : "مبلغ کل را به تومان وارد کنید."}
      </p>
    </div>
  );
}
