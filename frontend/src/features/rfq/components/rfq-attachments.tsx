"use client";

import { useState } from "react";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptanceOf, useAgreement } from "@/features/agreements/api";
import { AgreementChecklist } from "@/features/agreements/components/agreement-checklist";
import { allTermsAccepted } from "@/features/agreements/components/terms-checklist";
import { downloadFile } from "@/features/files/api";
import { errorMessage } from "@/lib/api-client";
import { DEMO_MODE } from "@/lib/config";
import { faNumber } from "@/lib/utils";
import { useAcceptRfqNda } from "../hooks";
import type { Rfq, RfqFile } from "../types";

const KIND_LABEL: Record<string, string> = {
  pdf: "سند PDF",
  cad: "مدل سه‌بعدی CAD",
  drawing: "نقشه‌ی فنی",
  image: "تصویر",
  other: "فایل",
};

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${faNumber(Math.round((bytes / 1024 / 1024) * 10) / 10)} مگابایت`
    : `${faNumber(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
}

/**
 * فایل‌های فنی RFQ. صاحب درخواست همیشه فهرست را می‌بیند؛ قطعه‌ساز پس از پذیرش تعهد عدم افشای
 * همین درخواست. هر دانلود با لینک کوتاه‌عمر و ثبت در سرور انجام می‌شود.
 */
export function RfqAttachments({ rfq }: { rfq: Rfq }) {
  if (rfq.fileCount === 0) return null;
  if (rfq.files.length === 0 && rfq.ndaAccepted === false) return <NdaGate rfq={rfq} />;
  return <FileList files={rfq.files} />;
}

function FileList({ files }: { files: RfqFile[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(file: RfqFile) {
    setError(null);
    setBusy(file.id);
    try {
      await downloadFile(file.id);
    } catch (err) {
      setError(errorMessage(err, "دانلود انجام نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" aria-hidden />
          فایل‌های فنی ({faNumber(files.length)})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate" dir="ltr">
                {file.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {KIND_LABEL[file.kind] ?? "فایل"} · {sizeLabel(file.size)}
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null || DEMO_MODE}
              onClick={() => handleDownload(file)}
              aria-label={`دانلود ${file.name}`}
            >
              <Download className="h-4 w-4" aria-hidden />
              {busy === file.id ? "در حال آماده‌سازی..." : "دانلود"}
            </Button>
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function NdaGate({ rfq }: { rfq: Rfq }) {
  const accept = useAcceptRfqNda(rfq.id);
  const agreement = useAgreement("rfq_nda").data;
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const terms = agreement?.items ?? [];
  const ready = terms.length > 0 && allTermsAccepted(terms, accepted);

  async function handleAccept() {
    setError(null);
    try {
      await accept.mutateAsync(acceptanceOf(agreement)[0]);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          {faNumber(rfq.fileCount)} فایل فنی محرمانه
        </CardTitle>
        <CardDescription>
          برای دیدن و دانلود فایل‌ها، تعهد عدم افشای این درخواست را از طرف سازمان خود بپذیرید.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AgreementChecklist agreementKey="rfq_nda" accepted={accepted} onChange={setAccepted} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          onClick={handleAccept}
          disabled={!ready || accept.isPending || DEMO_MODE}
          className="self-start"
        >
          {accept.isPending ? "در حال ثبت..." : "می‌پذیرم و فایل‌ها را نشان بده"}
        </Button>
      </CardContent>
    </Card>
  );
}
