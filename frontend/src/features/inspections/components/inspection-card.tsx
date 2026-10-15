"use client";

import { useState } from "react";
import { CheckCircle2, Download, FileText, Microscope, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState, FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { acceptanceOf, useAgreement } from "@/features/agreements/api";
import { AgreementChecklist } from "@/features/agreements/components/agreement-checklist";
import { allTermsAccepted } from "@/features/agreements/components/terms-checklist";
import { downloadFile } from "@/features/files/api";
import {
  FileUploader,
  sizeLabel,
  type UploadState,
} from "@/features/files/components/file-uploader";
import type { OrderDetail, OrderFile } from "@/features/orders/types";
import { ApiError, errorMessage } from "@/lib/api-client";
import { faDate, faNumber } from "@/lib/utils";
import {
  acceptInspectionNda,
  chooseLab,
  markReady,
  recordResult,
  removeInspection,
  useInspection,
  useInspectionAction,
  useQcLabs,
} from "../api";
import { INSPECTION_STATUS_LABELS, type Inspection } from "../types";

type Dialog = "choose" | "remove" | "ready" | "pass" | "fail" | null;

const EMPTY_UPLOAD: UploadState = { fileIds: [], busy: false, failed: false };

/** متنی که هر طرف درباره‌ی وضعیت فعلی بازرسی می‌بیند */
function guidance(order: OrderDetail, inspection: Inspection): string {
  const side = order.mySide;
  switch (inspection.status) {
    case "none":
      return (
        "اختیاری: پیش از ارسال، یک آزمایشگاه تأییدشده‌ی تراشینو قطعات را بازرسی کند. در این " +
        "صورت قطعه‌ساز فقط پس از قبولی بازرسی ارسال می‌کند. هزینه‌ی بازرسی را مستقیماً با " +
        "آزمایشگاه حساب می‌کنید."
      );
    case "requested":
      if (side === "supplier") {
        return inspection.canMarkReady
          ? "کارفرما بازرسی کیفیت خواسته است. وقتی قطعات آماده شد، آمادگی برای بازرسی را اعلام کنید؛ ارسال پس از قبولی بازرسی ممکن است."
          : "کارفرما بازرسی کیفیت خواسته است. پس از امضای قرارداد و شروع تولید، آمادگی برای بازرسی را اعلام می‌کنید؛ ارسال پس از قبولی بازرسی ممکن است.";
      }
      if (side === "qc") {
        return "کارفرما شما را برای بازرسی این سفارش انتخاب کرده است. قطعه‌ساز هنوز آمادگی برای بازرسی را اعلام نکرده است.";
      }
      return "آزمایشگاه انتخاب شد. پس از اعلام آمادگی قطعه‌ساز، آزمایشگاه بازرسی می‌کند. هماهنگی و هزینه‌ی بازرسی میان شما و آزمایشگاه است.";
    case "ready":
      if (side === "qc") {
        return inspection.canRecordResult
          ? "سفارش آماده‌ی بازرسی است. پس از بازرسی، نتیجه را همراه گزارش ثبت کنید."
          : "حساب آزمایشگاه شما در حال حاضر تأییدشده نیست؛ برای ثبت نتیجه با پشتیبانی تراشینو تماس بگیرید.";
      }
      return "آزمایشگاه در حال بازرسی است؛ نتیجه همین‌جا نمایش داده می‌شود.";
    case "failed":
      if (side === "supplier") {
        return "بازرسی رد شد. ایرادها را اصلاح کنید و دوباره آمادگی برای بازرسی را اعلام کنید.";
      }
      if (side === "qc") {
        return "نتیجه‌ی رد ثبت شد. پس از اصلاح، قطعه‌ساز دوباره آمادگی برای بازرسی را اعلام می‌کند.";
      }
      return "بازرسی رد شد. قطعه‌ساز ایرادها را اصلاح می‌کند و دوباره برای بازرسی اعلام آمادگی می‌کند.";
    case "passed":
      if (side === "supplier") return "بازرسی قبول شد؛ حالا می‌توانید ارسال را ثبت کنید.";
      if (side === "qc") return "نتیجه‌ی قبول ثبت شد.";
      return "بازرسی قبول شد؛ قطعه‌ساز می‌تواند سفارش را ارسال کند.";
  }
}

/**
 * کنترل کیفیت اختیاری سفارش (O9): انتخاب آزمایشگاه (کارفرما)، اعلام آمادگی (قطعه‌ساز)،
 * تعهد عدم افشا، فایل‌های فنی و ثبت نتیجه با گزارش (آزمایشگاه).
 */
export function InspectionCard({ order }: { order: OrderDetail }) {
  const enabled = Boolean(order.inspection) || order.mySide === "buyer";
  const { data, isLoading, isError, error, refetch } = useInspection(order.id, enabled);
  const action = useInspectionAction(order.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [labId, setLabId] = useState("");
  const [note, setNote] = useState("");
  const [upload, setUpload] = useState<UploadState>(EMPTY_UPLOAD);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const labs = useQcLabs(dialog === "choose");

  if (!enabled) return null;
  if (isLoading) return <Skeleton className="h-28" />;
  if (isError) {
    return <ErrorState error={error} onRetry={() => refetch()} title="بخش کنترل کیفیت بارگذاری نشد" />;
  }
  if (!data || (data.status === "none" && !data.canChooseLab)) return null;
  const inspection = data;

  function open(next: Dialog) {
    setLabId(inspection.lab?.organizationId ?? "");
    setNote("");
    setUpload(EMPTY_UPLOAD);
    setFormError(null);
    setFieldErrors({});
    setDialog(next);
  }

  async function run(request: () => Promise<Inspection>) {
    setFormError(null);
    setFieldErrors({});
    try {
      await action.mutateAsync(request);
      setDialog(null);
    } catch (err) {
      setFormError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    }
  }

  function submitResult(passed: boolean) {
    if (upload.busy || upload.failed) {
      setFormError("صبر کنید تا بارگذاری گزارش تمام شود، یا فایل ناموفق را حذف کنید.");
      return;
    }
    if (upload.fileIds.length === 0) {
      setFieldErrors({ fileId: "گزارش بازرسی (PDF یا تصویر) را بارگذاری کنید." });
      return;
    }
    if (!passed && note.trim().length < 3) {
      setFieldErrors({ note: "دلیل رد را بنویسید تا قطعه‌ساز بداند چه چیزی را اصلاح کند." });
      return;
    }
    void run(() =>
      recordResult(order.id, {
        attempt: inspection.attempt,
        passed,
        note,
        fileId: upload.fileIds[0],
      }),
    );
  }

  async function download(file: OrderFile) {
    setDownloadError(null);
    setBusy(file.id);
    try {
      await downloadFile(file.id);
    } catch (err) {
      setDownloadError(errorMessage(err, "دانلود انجام نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(null);
    }
  }

  const hasResult = inspection.status === "passed" || inspection.status === "failed";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Microscope className="h-5 w-5 text-primary" aria-hidden />
          کنترل کیفیت
          {inspection.status !== "none" && (
            <Badge
              variant={
                inspection.status === "passed"
                  ? "success"
                  : inspection.status === "failed"
                    ? "destructive"
                    : "secondary"
              }
            >
              {INSPECTION_STATUS_LABELS[inspection.status]}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">{guidance(order, inspection)}</p>

        {inspection.lab && (
          <p>
            آزمایشگاه: <span className="font-medium">{inspection.lab.name}</span>
            {inspection.attempt > 0 && (
              <span className="text-muted-foreground"> — دور {faNumber(inspection.attempt)}</span>
            )}
          </p>
        )}

        {(hasResult || inspection.resultAt) && (
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <span className="flex items-center gap-2 font-medium">
              {inspection.status === "passed" ? (
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" aria-hidden />
              )}
              {hasResult ? "آخرین نتیجه" : "نتیجه‌ی دور قبل"}:{" "}
              {inspection.status === "passed" ? "قبول" : "رد"}
            </span>
            {inspection.resultNote && <p>{inspection.resultNote}</p>}
            {inspection.resultAt && (
              <span className="text-xs text-muted-foreground">
                {inspection.resultByName ? `${inspection.resultByName} — ` : ""}
                {faDate(inspection.resultAt)}
              </span>
            )}
            {inspection.report && (
              <FileButton
                file={inspection.report}
                label="گزارش بازرسی"
                busy={busy}
                onDownload={download}
              />
            )}
          </div>
        )}

        {order.mySide === "qc" && <LabFiles order={order} inspection={inspection} busy={busy} onDownload={download} />}

        {downloadError && (
          <p role="alert" className="text-destructive">
            {downloadError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {inspection.canChooseLab && (
            <Button
              variant={inspection.status === "none" ? "default" : "outline"}
              onClick={() => open("choose")}
            >
              {inspection.status === "none" ? "انتخاب آزمایشگاه" : "تغییر آزمایشگاه"}
            </Button>
          )}
          {inspection.canRemove && (
            <Button variant="outline" onClick={() => open("remove")}>
              حذف بازرسی
            </Button>
          )}
          {inspection.canMarkReady && (
            <Button onClick={() => open("ready")}>
              {inspection.status === "failed"
                ? "اصلاح انجام شد؛ آماده‌ی بازرسی دوباره"
                : "اعلام آمادگی برای بازرسی"}
            </Button>
          )}
          {inspection.canRecordResult && (
            <>
              <Button onClick={() => open("pass")}>ثبت قبولی</Button>
              <Button variant="outline" onClick={() => open("fail")}>
                ثبت رد
              </Button>
            </>
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        open={dialog === "choose"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (!labId) {
            setFormError("یک آزمایشگاه را انتخاب کنید.");
            return;
          }
          void run(() => chooseLab(order.id, labId));
        }}
        pending={action.isPending}
        error={Object.keys(fieldErrors).length ? null : formError}
        title={inspection.status === "none" ? "انتخاب آزمایشگاه" : "تغییر آزمایشگاه"}
        confirmLabel="انتخاب این آزمایشگاه"
        description="آزمایشگاه فقط همین سفارش را می‌بیند: مشخصات قطعه و نام دو طرف. نقشه‌ها را پس از پذیرش تعهد عدم افشا می‌بیند و مبلغ، پرداخت‌ها و قرارداد را نمی‌بیند. تا پیش از قبولی بازرسی می‌توانید آزمایشگاه را عوض یا بازرسی را حذف کنید."
      >
        {labs.isLoading ? (
          <Skeleton className="h-20" />
        ) : labs.isError ? (
          <ErrorState error={labs.error} onRetry={() => labs.refetch()} title="فهرست آزمایشگاه‌ها بارگذاری نشد" />
        ) : !labs.data || labs.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            هنوز آزمایشگاه تأییدشده‌ای در تراشینو ثبت نشده است.
          </p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">آزمایشگاه‌های تأییدشده</legend>
            {labs.data.items.map((lab) => (
              <label
                key={lab.organizationId}
                className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary"
              >
                <input
                  type="radio"
                  name="qc-lab"
                  value={lab.organizationId}
                  checked={labId === lab.organizationId}
                  onChange={() => setLabId(lab.organizationId)}
                />
                <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
                {lab.name}
              </label>
            ))}
            <FieldError message={fieldErrors.labOrganizationId} />
          </fieldset>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "remove"}
        onClose={() => setDialog(null)}
        onConfirm={() => void run(() => removeInspection(order.id))}
        pending={action.isPending}
        error={formError}
        destructive
        title="حذف بازرسی کیفیت"
        confirmLabel="بله، بدون بازرسی"
        description="آزمایشگاه دیگر به این سفارش دسترسی ندارد و قطعه‌ساز بدون بازرسی ارسال می‌کند."
      />

      <ConfirmDialog
        open={dialog === "ready"}
        onClose={() => setDialog(null)}
        onConfirm={() => void run(() => markReady(order.id, note))}
        pending={action.isPending}
        error={formError}
        title="اعلام آمادگی برای بازرسی"
        confirmLabel="اعلام آمادگی"
        description="آزمایشگاه بازرسی را انجام می‌دهد و نتیجه را همین‌جا ثبت می‌کند."
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="ready-note">توضیح برای آزمایشگاه (اختیاری)</Label>
          <Input
            id="ready-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="مثلاً محل و زمان مناسب برای بازدید"
          />
        </div>
      </ConfirmDialog>

      {(["pass", "fail"] as const).map((kind) => (
        <ConfirmDialog
          key={kind}
          open={dialog === kind}
          onClose={() => setDialog(null)}
          onConfirm={() => submitResult(kind === "pass")}
          pending={action.isPending}
          error={Object.keys(fieldErrors).length ? null : formError}
          destructive={kind === "fail"}
          title={kind === "pass" ? "ثبت قبولی بازرسی" : "ثبت رد بازرسی"}
          confirmLabel={kind === "pass" ? "ثبت قبولی" : "ثبت رد"}
          description={
            kind === "pass"
              ? "گزارش بازرسی لازم است. با ثبت قبولی، قطعه‌ساز می‌تواند سفارش را ارسال کند."
              : "گزارش بازرسی و دلیل رد لازم است. سفارش به مرحله‌ی تولید برمی‌گردد تا قطعه‌ساز اصلاح کند."
          }
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`result-note-${kind}`}>
                {kind === "pass" ? "توضیح (اختیاری)" : "دلیل رد"}
              </Label>
              <Textarea
                id={`result-note-${kind}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                className="min-h-16"
              />
              <FieldError message={fieldErrors.note} />
            </div>
            {dialog === kind && (
              <FileUploader
                purpose="order_document"
                extensions={["pdf", "png", "jpg", "jpeg"]}
                maxSizeMb={10}
                maxFiles={1}
                prompt="گزارش بازرسی (PDF یا تصویر)"
                formatsHint="PDF · JPG · PNG — max 10MB"
                inputLabel="انتخاب گزارش بازرسی"
                onChange={setUpload}
              />
            )}
            <FieldError message={fieldErrors.fileId} />
          </div>
        </ConfirmDialog>
      ))}
    </Card>
  );
}

function FileButton({
  file,
  label,
  busy,
  onDownload,
}: {
  file: OrderFile;
  label?: string;
  busy: string | null;
  onDownload: (file: OrderFile) => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="self-start"
      disabled={busy !== null}
      onClick={() => onDownload(file)}
      aria-label={`دانلود ${file.name}`}
    >
      <Download className="h-4 w-4" aria-hidden />
      {label ?? <span dir="ltr">{file.name}</span>}
    </Button>
  );
}

/** نقشه‌ها و فایل‌های فنی سفارش برای آزمایشگاه؛ پس از پذیرش تعهد عدم افشای همین سفارش */
function LabFiles({
  order,
  inspection,
  busy,
  onDownload,
}: {
  order: OrderDetail;
  inspection: Inspection;
  busy: string | null;
  onDownload: (file: OrderFile) => void;
}) {
  const action = useInspectionAction(order.id);
  const agreement = useAgreement("inspection_nda").data;
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const count = inspection.fileCount ?? 0;

  if (count === 0) {
    return <p className="text-muted-foreground">این سفارش فایل فنی پیوست ندارد.</p>;
  }

  if (!inspection.ndaAccepted) {
    const terms = agreement?.items ?? [];
    const ready = terms.length > 0 && allTermsAccepted(terms, accepted);
    return (
      <div className="flex flex-col gap-3 rounded-xl border p-3">
        <span className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          {faNumber(count)} فایل فنی محرمانه
        </span>
        <p className="text-muted-foreground">
          برای دیدن و دانلود نقشه‌ها، تعهد عدم افشای این سفارش را از طرف آزمایشگاه بپذیرید.
        </p>
        <AgreementChecklist agreementKey="inspection_nda" accepted={accepted} onChange={setAccepted} />
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button
          className="self-start"
          disabled={!ready || action.isPending}
          onClick={async () => {
            setError(null);
            try {
              await action.mutateAsync(() =>
                acceptInspectionNda(order.id, acceptanceOf(agreement)[0]),
              );
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          {action.isPending ? "در حال ثبت..." : "می‌پذیرم و فایل‌ها را نشان بده"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 font-medium">
        <FileText className="h-4 w-4 text-primary" aria-hidden />
        فایل‌های فنی ({faNumber(count)})
      </span>
      {(inspection.files ?? []).map((file) => (
        <div
          key={file.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate" dir="ltr">
              {file.name}
            </span>
            <span className="text-xs text-muted-foreground">{sizeLabel(file.size)}</span>
          </span>
          <FileButton file={file} label="دانلود" busy={busy} onDownload={onDownload} />
        </div>
      ))}
    </div>
  );
}
