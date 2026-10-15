"use client";

import { useState } from "react";
import { CheckCircle2, Download, Info, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState, FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { JalaliDateInput } from "@/components/ui/jalali-date-input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { downloadFile } from "@/features/files/api";
import { FileUploader, type UploadState } from "@/features/files/components/file-uploader";
import type { OrderDetail } from "@/features/orders/types";
import { ApiError, errorMessage } from "@/lib/api-client";
import { localToday } from "@/lib/dates";
import { faDate, faNumber, faToman } from "@/lib/utils";
import {
  confirmPayment,
  rejectPayment,
  reportPayment,
  usePaymentAction,
  usePayments,
} from "../api";
import { PAYMENT_STATUS_LABELS, paymentTitle, type Payment } from "../types";

type Dialog = { kind: "report" | "confirm" | "reject"; payment: Payment } | null;

/** اقساط سفارش طبق قرارداد. پول از پلتفرم عبور نمی‌کند؛ فقط اعلام و تأیید ثبت می‌شود. */
export function PaymentsCard({ order }: { order: OrderDetail }) {
  const signed =
    order.mySide !== "qc" && !["awaiting_contract", "cancelled"].includes(order.status);
  const { data, isLoading, isError, error, refetch } = usePayments(order.id, signed);
  const action = usePaymentAction(order.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [paidOn, setPaidOn] = useState(localToday());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [upload, setUpload] = useState<UploadState>({ fileIds: [], busy: false, failed: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (!signed) return null;

  function open(next: Dialog) {
    setPaidOn(localToday());
    setReference("");
    setNote("");
    setReason("");
    setFormError(null);
    setFieldErrors({});
    setDialog(next);
  }

  async function confirm() {
    if (!dialog) return;
    setFormError(null);
    setFieldErrors({});
    if (dialog.kind === "report" && (upload.busy || upload.failed)) {
      setFormError("صبر کنید تا بارگذاری رسید تمام شود، یا رسید ناموفق را حذف کنید.");
      return;
    }
    const id = dialog.payment.id;
    try {
      await action.mutateAsync(() => {
        if (dialog.kind === "report") {
          return reportPayment(order.id, id, {
            paidOn,
            reference,
            note,
            fileId: upload.fileIds[0] ?? null,
          });
        }
        if (dialog.kind === "confirm") return confirmPayment(order.id, id);
        return rejectPayment(order.id, id, reason);
      });
      setDialog(null);
    } catch (err) {
      setFormError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    }
  }

  async function download(fileId: string) {
    setBusy(fileId);
    try {
      await downloadFile(fileId);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" aria-hidden />
          پرداخت‌ها
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          پول از تراشینو عبور نمی‌کند. کارفرما مبلغ را مستقیماً به قطعه‌ساز می‌پردازد و این‌جا با
          شماره‌ی پیگیری یا رسید اعلام می‌کند؛ قطعه‌ساز دریافت را تأیید می‌کند.
        </p>

        {isLoading ? (
          <Skeleton className="h-24" />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} title="پرداخت‌ها بارگذاری نشد" />
        ) : !data || data.items.length === 0 ? (
          <p className="text-muted-foreground">اقساطی برای این سفارش ثبت نشده است.</p>
        ) : (
          <>
            {data.items.map((payment) => (
              <div key={payment.id} className="flex flex-col gap-2 rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">
                      {paymentTitle(payment)} ({faNumber(payment.percent)}٪)
                    </span>
                    <span>{faToman(payment.amountRials)}</span>
                  </div>
                  <Badge
                    variant={
                      payment.status === "confirmed"
                        ? "success"
                        : payment.status === "reported"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {payment.status === "confirmed" && (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {PAYMENT_STATUS_LABELS[payment.status]}
                  </Badge>
                </div>
                {payment.status !== "pending" && (
                  <span className="text-xs text-muted-foreground">
                    اعلام: {payment.reportedByName}
                    {payment.paidOn ? ` — پرداخت در ${faDate(payment.paidOn)}` : ""}
                    {payment.reference ? ` — شماره‌ی پیگیری ` : ""}
                    {payment.reference && <span dir="ltr">{payment.reference}</span>}
                  </span>
                )}
                {payment.note && payment.status !== "pending" && <p>{payment.note}</p>}
                {payment.confirmedAt && (
                  <span className="text-xs text-success">
                    دریافت توسط {payment.confirmedByName} در {faDate(payment.confirmedAt)} تأیید شد.
                  </span>
                )}
                {payment.rejectionReason && payment.status === "pending" && (
                  <p className="text-xs text-destructive">
                    پرداخت قبلی رد شد: {payment.rejectionReason}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {payment.receipt && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => payment.receipt && download(payment.receipt.id)}
                      aria-label={`دانلود ${payment.receipt.name}`}
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      رسید
                    </Button>
                  )}
                  {payment.canReport && (
                    <Button size="sm" onClick={() => open({ kind: "report", payment })}>
                      اعلام {paymentTitle(payment)}
                    </Button>
                  )}
                  {payment.canConfirm && (
                    <>
                      <Button size="sm" onClick={() => open({ kind: "confirm", payment })}>
                        تأیید دریافت {paymentTitle(payment)}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => open({ kind: "reject", payment })}
                      >
                        پرداخت نرسیده است
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              تأییدشده: {faToman(data.confirmedRials)} از {faToman(data.totalRials)}
            </p>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={dialog?.kind === "report"}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
        pending={action.isPending}
        error={Object.keys(fieldErrors).length ? null : formError}
        title="اعلام پرداخت"
        confirmLabel="ثبت اعلام پرداخت"
        description={
          dialog?.kind === "report"
            ? `${paymentTitle(dialog.payment)}: ${faToman(dialog.payment.amountRials)}. شماره‌ی پیگیری یا تصویر رسید لازم است.`
            : undefined
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <JalaliDateInput
              id="paid-on"
              label="تاریخ پرداخت"
              max={localToday()}
              value={paidOn}
              onChange={setPaidOn}
            />
            <FieldError message={fieldErrors.paidOn} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reference">شماره‌ی پیگیری یا حواله</Label>
            <Input
              id="reference"
              dir="ltr"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={100}
            />
            <FieldError message={fieldErrors.reference} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-note">توضیح (اختیاری)</Label>
            <Input
              id="payment-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
          {dialog?.kind === "report" && (
            <FileUploader
              purpose="order_document"
              extensions={["pdf", "png", "jpg", "jpeg"]}
              maxSizeMb={10}
              maxFiles={1}
              prompt="تصویر یا PDF رسید (اختیاری)"
              formatsHint="PDF · JPG · PNG — max 10MB"
              inputLabel="انتخاب رسید پرداخت"
              onChange={setUpload}
            />
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "confirm"}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
        pending={action.isPending}
        error={formError}
        title="تأیید دریافت پرداخت"
        confirmLabel="بله، مبلغ را دریافت کردم"
        description={
          dialog?.kind === "confirm"
            ? `فقط اگر ${faToman(dialog.payment.amountRials)} واقعاً به حساب شما رسیده است تأیید کنید.`
            : undefined
        }
      />

      <ConfirmDialog
        open={dialog?.kind === "reject"}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
        pending={action.isPending}
        error={formError}
        destructive
        title="رد اعلام پرداخت"
        confirmLabel="ثبت رد"
        description="کارفرما دلیل را می‌بیند و می‌تواند دوباره اعلام کند."
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="reject-reason">دلیل</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="min-h-16"
          />
        </div>
      </ConfirmDialog>
    </Card>
  );
}
