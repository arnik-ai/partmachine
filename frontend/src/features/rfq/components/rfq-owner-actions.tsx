"use client";

import { useState } from "react";
import { CalendarClock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/error-state";
import { JalaliDateInput } from "@/components/ui/jalali-date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api-client";
import { localToday } from "@/lib/dates";
import { useCancelRfq, useRescheduleRfq } from "../hooks";
import type { Rfq } from "../types";

const MANAGEABLE = new Set(["published", "quoting", "evaluating", "expired"]);

/** اقدام‌های صاحب درخواست: تغییر مهلت و لغو — تا وقتی برنده انتخاب نشده یا لغو نشده باشد */
export function RfqOwnerActions({ rfq }: { rfq: Rfq }) {
  const cancel = useCancelRfq(rfq.id);
  const reschedule = useRescheduleRfq(rfq.id);
  const [dialog, setDialog] = useState<"cancel" | "reschedule" | null>(null);
  const [reason, setReason] = useState("");
  const [quotesDue, setQuotesDue] = useState(rfq.quotesDue);
  const [deadline, setDeadline] = useState(rfq.deadline);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!MANAGEABLE.has(rfq.status)) return null;

  function open(kind: "cancel" | "reschedule") {
    setError(null);
    setFieldErrors({});
    setQuotesDue(rfq.quotesDue >= localToday() ? rfq.quotesDue : localToday());
    setDeadline(rfq.deadline);
    setDialog(kind);
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setFieldErrors({});
    try {
      await action();
      setDialog(null);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => open("reschedule")}>
        <CalendarClock className="h-4 w-4" aria-hidden />
        تغییر مهلت
      </Button>
      <Button variant="outline" onClick={() => open("cancel")}>
        <Ban className="h-4 w-4" aria-hidden />
        لغو درخواست
      </Button>

      <ConfirmDialog
        open={dialog === "reschedule"}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          run(() =>
            reschedule.mutateAsync({
              quotesDue,
              deadline: deadline !== rfq.deadline ? deadline : undefined,
            }),
          )
        }
        pending={reschedule.isPending}
        error={error}
        title="تغییر مهلت"
        confirmLabel="ذخیره"
        description="با تمدید مهلت دریافت پیشنهاد، درخواست دوباره برای قطعه‌سازها باز می‌شود."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <JalaliDateInput
              id="resched-quotes"
              label="مهلت دریافت پیشنهاد"
              required
              min={localToday()}
              max={deadline}
              value={quotesDue}
              onChange={setQuotesDue}
            />
            <FieldError message={fieldErrors.quotesDue} />
          </div>
          <div className="flex flex-col gap-2">
            <JalaliDateInput
              id="resched-deadline"
              label="مهلت تحویل"
              required
              min={localToday()}
              value={deadline}
              onChange={setDeadline}
            />
            <FieldError message={fieldErrors.deadline} />
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        onConfirm={() => run(() => cancel.mutateAsync(reason.trim() || undefined))}
        pending={cancel.isPending}
        error={error}
        destructive
        title="لغو درخواست"
        confirmLabel="بله، لغو کن"
        description="درخواست بسته می‌شود و دیگر پیشنهادی نمی‌پذیرد. این کار قابل بازگشت نیست."
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="cancel-reason">دلیل (اختیاری؛ فقط برای سازمان شما)</Label>
          <Textarea
            id="cancel-reason"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثلاً: پروژه منتفی شد"
          />
          <FieldError message={fieldErrors.reason} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
