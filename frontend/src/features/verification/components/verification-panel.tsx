"use client";

import { useState } from "react";
import { BadgeCheck, Clock, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  FileUploader,
  sizeLabel,
  type UploadState,
} from "@/features/files/components/file-uploader";
import type { MySupplier } from "@/features/suppliers/types";
import { errorMessage } from "@/lib/api-client";
import { faDate } from "@/lib/utils";
import { useMyVerification, useSubmitVerification } from "../api";
import type { Verification } from "../types";

const DOCUMENT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg"] as const;

/**
 * تأیید هویت قطعه‌ساز: مدارک → بررسی کارشناس پارت‌ماشین → نشان «تأییدشده».
 * در هر وضعیت فقط کاری که الان لازم است نمایش داده می‌شود.
 */
export function VerificationPanel({ supplier }: { supplier: MySupplier }) {
  const { data: latest, isLoading, isError, error, refetch } = useMyVerification();

  return (
    <Card>
      <CardHeader>
        <CardTitle>۳. تأیید هویت شرکت</CardTitle>
        <CardDescription>
          کارفرماها می‌توانند فقط قطعه‌سازهای تأییدشده را ببینند. با ارسال مدارک، کارشناسان
          پارت‌ماشین هویت شرکت شما را بررسی و نشان «تأییدشده» را فعال می‌کنند.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : supplier.verified ? (
          <Approved latest={latest ?? null} />
        ) : latest?.status === "pending" ? (
          <Pending request={latest} />
        ) : (
          <>
            {latest && <PreviousOutcome request={latest} />}
            {supplier.canEdit ? (
              <SubmitDocuments listed={supplier.listed} />
            ) : (
              <p className="text-sm text-muted-foreground">
                فقط مدیر سازمان می‌تواند مدارک تأیید را ارسال کند.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Approved({ latest }: { latest: Verification | null }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/5 p-4">
      <BadgeCheck className="h-6 w-6 shrink-0 text-success" aria-hidden />
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">شرکت شما تأییدشده است.</span>
        <span className="text-muted-foreground">
          نشان «تأییدشده» در پروفایل عمومی و کنار پیشنهادهای شما نمایش داده می‌شود.
          {latest?.status === "approved" && latest.decidedAt
            ? ` تاریخ تأیید: ${faDate(latest.decidedAt)}`
            : ""}
        </span>
        {latest?.status === "approved" && latest.decisionReason && (
          <span>توضیح کارشناس: {latest.decisionReason}</span>
        )}
      </div>
    </div>
  );
}

function Pending({ request }: { request: Verification }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
      <span className="flex items-center gap-2 font-semibold">
        <Clock className="h-5 w-5 text-primary" aria-hidden />
        مدارک شما در حال بررسی است.
      </span>
      <span className="text-muted-foreground">
        ارسال‌شده در {faDate(request.createdAt)}. نتیجه همین‌جا نمایش داده می‌شود.
      </span>
      <DocumentList request={request} />
    </div>
  );
}

function PreviousOutcome({ request }: { request: Verification }) {
  const revoked = request.status === "revoked";
  const reason = revoked ? request.revokeReason : request.decisionReason;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
      <div className="flex flex-col gap-1">
        <span className="font-semibold">
          {revoked ? "تأیید شرکت شما لغو شد." : "درخواست قبلی شما تأیید نشد."}
        </span>
        {reason && <span>دلیل: {reason}</span>}
        <span className="text-muted-foreground">
          می‌توانید مدارک تازه یا خواناتر بفرستید.
        </span>
      </div>
    </div>
  );
}

function DocumentList({ request }: { request: Verification }) {
  return (
    <ul className="flex flex-col gap-1">
      {request.files.map((file) => (
        <li key={file.id} className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" aria-hidden />
          <span dir="ltr">{file.name}</span> · {sizeLabel(file.size)}
        </li>
      ))}
    </ul>
  );
}

function SubmitDocuments({ listed }: { listed: boolean }) {
  const submit = useSubmitVerification();
  const [uploads, setUploads] = useState<UploadState>({ fileIds: [], busy: false, failed: false });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ready = listed && uploads.fileIds.length > 0 && !uploads.busy && !uploads.failed;

  async function handleSubmit() {
    setError(null);
    try {
      await submit.mutateAsync({ fileIds: uploads.fileIds, note });
    } catch (err) {
      setError(errorMessage(err, "ارسال انجام نشد. لطفاً دوباره تلاش کنید."));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-muted/50 p-3 text-sm leading-7">
        <p className="font-medium">یکی از این مدارک کافی است:</p>
        <ul className="list-inside list-disc text-muted-foreground">
          <li>روزنامه‌ی رسمی آگهی تأسیس یا آخرین تغییرات</li>
          <li>پروانه‌ی بهره‌برداری یا جواز کسب</li>
          <li>کارت بازرگانی</li>
        </ul>
        <p className="mt-1 text-xs text-muted-foreground">
          مدارک خصوصی‌اند و فقط کارشناسان پارت‌ماشین آن‌ها را می‌بینند.
        </p>
        <p className="mt-1 text-xs font-medium">
          پیش از ارسال مطمئن شوید نام شرکت در بخش ۱ با نام روی مدارک یکی است؛ پس از تأیید، نام شرکت
          قفل می‌شود.
        </p>
      </div>

      <FileUploader
        purpose="verification_document"
        extensions={DOCUMENT_EXTENSIONS}
        maxSizeMb={10}
        maxFiles={5}
        prompt="مدارک را اینجا رها کنید یا کلیک کنید"
        formatsHint="PDF · JPG · PNG — max 10MB"
        inputLabel="انتخاب مدارک تأیید هویت"
        onChange={setUploads}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="verification-note">توضیح برای کارشناس (اختیاری)</Label>
        <Textarea
          id="verification-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          className="min-h-16"
        />
      </div>

      {!listed && (
        <p className="text-sm text-muted-foreground">
          ابتدا اطلاعات شرکت (شهر و حداقل یک خدمت) را در بخش ۱ کامل و ذخیره کنید.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button onClick={handleSubmit} disabled={!ready || submit.isPending} className="self-start">
        {submit.isPending ? "در حال ارسال..." : "ارسال برای بررسی"}
      </Button>
    </div>
  );
}
