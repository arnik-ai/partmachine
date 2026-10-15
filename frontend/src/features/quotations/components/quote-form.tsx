"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { JalaliDateInput } from "@/components/ui/jalali-date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TomanInput } from "@/components/ui/toman-input";
import { ApiError, errorMessage } from "@/lib/api-client";
import { DEMO_MODE } from "@/lib/config";
import { localToday, plusDays } from "@/lib/dates";
import { MAX_TOMAN, normalizeDigits, parseToman, rialsToToman, tomanToRials } from "@/lib/money";
import { useSubmitQuotation, useUpdateQuotation } from "../hooks";
import type { Quotation } from "../types";

type Mode = "create" | "edit" | "resubmit";

const SUBMIT_LABEL: Record<Mode, string> = {
  create: "ثبت پیشنهاد",
  edit: "ذخیره‌ی تغییرات",
  resubmit: "ثبت دوباره‌ی پیشنهاد",
};

/** فرم ثبت، ویرایش یا ثبت دوباره‌ی پیشنهاد قیمت — مبلغ به تومان */
export function QuoteForm({
  rfqId,
  mode,
  existing,
  onDone,
  onCancel,
}: {
  rfqId: string;
  mode: Mode;
  existing?: Quotation;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const submit = useSubmitQuotation(rfqId);
  const update = useUpdateQuotation();
  const [price, setPrice] = useState(
    existing ? String(rialsToToman(existing.totalPriceRials)) : "",
  );
  const [leadTime, setLeadTime] = useState(existing ? String(existing.leadTimeDays) : "");
  const [validUntil, setValidUntil] = useState(() =>
    existing && existing.validUntil >= localToday() ? existing.validUntil : plusDays(14),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const pending = submit.isPending || update.isPending;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const toman = parseToman(price);
    const days = Number(normalizeDigits(leadTime));
    const local: Record<string, string> = {};
    if (!toman || toman <= 0) local.totalPriceRials = "مبلغ را به تومان و فقط با رقم وارد کنید.";
    else if (toman > MAX_TOMAN) local.totalPriceRials = "مبلغ بیش از حد مجاز است.";
    if (!Number.isInteger(days) || days <= 0) local.leadTimeDays = "زمان تحویل را به روز وارد کنید.";
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      return;
    }

    const input = {
      totalPriceRials: tomanToRials(toman as number),
      leadTimeDays: days,
      validUntil,
      note: note.trim() || undefined,
    };
    try {
      if (mode === "edit" && existing) await update.mutateAsync({ id: existing.id, input });
      else await submit.mutateAsync(input);
      onDone();
    } catch (err) {
      setError(errorMessage(err, "ثبت پیشنهاد انجام نشد. لطفاً دوباره تلاش کنید."));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="quote-price">قیمت کل (تومان)</Label>
        <TomanInput id="quote-price" value={price} onChange={setPrice} required />
        <FieldError message={fieldErrors.totalPriceRials} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="quote-lead">زمان تحویل (روز)</Label>
          <Input
            id="quote-lead"
            inputMode="numeric"
            dir="ltr"
            className="text-left"
            required
            value={leadTime}
            onChange={(e) => setLeadTime(e.target.value)}
            placeholder="14"
          />
          <FieldError message={fieldErrors.leadTimeDays} />
        </div>
        <div className="flex flex-col gap-2">
          <JalaliDateInput
            id="quote-valid"
            label="اعتبار پیشنهاد تا"
            required
            min={localToday()}
            value={validUntil}
            onChange={setValidUntil}
          />
          <FieldError message={fieldErrors.validUntil} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="quote-note">توضیحات (اختیاری)</Label>
        <Textarea
          id="quote-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="شرایط پرداخت، ضمانت، نحوه‌ی تحویل..."
        />
        <FieldError message={fieldErrors.note} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {DEMO_MODE && (
        <p className="text-sm text-warning">در نسخه‌ی نمایشی پیشنهاد ثبت نمی‌شود.</p>
      )}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            انصراف
          </Button>
        )}
        <Button type="submit" disabled={pending || DEMO_MODE}>
          {pending ? "در حال ثبت..." : SUBMIT_LABEL[mode]}
        </Button>
      </div>
    </form>
  );
}
