"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Download, ExternalLink, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { downloadFile } from "@/features/files/api";
import { VERIFICATION_STATUS_LABELS } from "@/features/verification/types";
import { errorMessage } from "@/lib/api-client";
import { faDateTime, faNumber } from "@/lib/utils";
import {
  ADMIN_PAGE_SIZE,
  useDecideVerification,
  useVerifications,
  type VerificationDecision,
} from "../api";
import type { AdminVerification, VerificationFilter } from "../types";
import { Pager } from "./admin-shell";

const FILTERS: Array<{ value: VerificationFilter; label: string }> = [
  { value: "pending", label: "در انتظار بررسی" },
  { value: "approved", label: "تأییدشده" },
  { value: "rejected", label: "ردشده" },
  { value: "revoked", label: "لغوشده" },
  { value: "all", label: "همه" },
];

const DECISIONS: Record<
  VerificationDecision,
  { title: string; confirm: string; reasonLabel: string; required: boolean; destructive: boolean }
> = {
  approve: {
    title: "تأیید مدارک",
    confirm: "بله، تأیید کن",
    reasonLabel: "توضیح برای قطعه‌ساز (اختیاری)",
    required: false,
    destructive: false,
  },
  reject: {
    title: "رد مدارک",
    confirm: "رد کن",
    reasonLabel: "دلیل رد (به قطعه‌ساز نمایش داده می‌شود)",
    required: true,
    destructive: true,
  },
  revoke: {
    title: "لغو تأیید",
    confirm: "بله، تأیید را لغو کن",
    reasonLabel: "دلیل لغو (به قطعه‌ساز نمایش داده می‌شود)",
    required: true,
    destructive: true,
  },
};

function describe(decision: VerificationDecision, company: string): string {
  if (decision === "approve") {
    return `نشان «تأییدشده» برای «${company}» فعال می‌شود و در پروفایل عمومی و پیشنهادهایش نمایش داده می‌شود.`;
  }
  if (decision === "reject") {
    return `«${company}» دلیل را می‌بیند و می‌تواند مدارک تازه بفرستد.`;
  }
  return `نشان «تأییدشده»ی «${company}» بلافاصله برداشته می‌شود.`;
}

export function VerificationQueue() {
  const [status, setStatus] = useState<VerificationFilter>("pending");
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, error, refetch, isFetching } = useVerifications(status, page);
  const decide = useDecideVerification();
  const [action, setAction] = useState<{
    item: AdminVerification;
    decision: VerificationDecision;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  function open(item: AdminVerification, decision: VerificationDecision) {
    setAction({ item, decision });
    setReason("");
    setActionError(null);
  }

  async function confirm() {
    if (!action) return;
    if (DECISIONS[action.decision].required && !reason.trim()) {
      setActionError("دلیل را بنویسید؛ این متن به قطعه‌ساز نمایش داده می‌شود.");
      return;
    }
    setActionError(null);
    try {
      await decide.mutateAsync({ id: action.item.id, decision: action.decision, reason });
      setAction(null);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / ADMIN_PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="وضعیت درخواست‌ها">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={status === filter.value}
            className={buttonVariants({
              variant: status === filter.value ? "default" : "outline",
              size: "sm",
            })}
            onClick={() => {
              setStatus(filter.value);
              setPage(0);
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <p className="py-8 text-center text-white/70">
          {status === "pending" ? "درخواستی در انتظار بررسی نیست." : "موردی پیدا نشد."}
        </p>
      ) : (
        <div className="flex flex-col gap-3" style={{ opacity: isFetching ? 0.6 : 1 }}>
          {data.items.map((item) => (
            <VerificationCard key={item.id} item={item} onAction={(d) => open(item, d)} />
          ))}
          <Pager
            page={page}
            hasMore={page + 1 < pages}
            onChange={setPage}
            label={`صفحه‌ی ${faNumber(page + 1)} از ${faNumber(pages)}`}
          />
        </div>
      )}

      {action && (
        <ConfirmDialog
          open
          onClose={() => setAction(null)}
          onConfirm={confirm}
          pending={decide.isPending}
          error={actionError}
          destructive={DECISIONS[action.decision].destructive}
          title={DECISIONS[action.decision].title}
          confirmLabel={DECISIONS[action.decision].confirm}
          description={describe(action.decision, action.item.companyName)}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="decision-reason">{DECISIONS[action.decision].reasonLabel}</Label>
            <Textarea
              id="decision-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              className="min-h-20"
            />
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}

function VerificationCard({
  item,
  onAction,
}: {
  item: AdminVerification;
  onAction: (decision: VerificationDecision) => void;
}) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(id: string) {
    setError(null);
    setDownloading(id);
    try {
      await downloadFile(id);
    } catch (err) {
      setError(errorMessage(err, "دانلود انجام نشد."));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Card role="article" aria-label={item.companyName}>
      <CardContent className="flex flex-col gap-3 p-5 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold">{item.companyName}</span>
            <span className="text-xs text-muted-foreground">
              {item.city || "شهر ثبت نشده"} — ارسال: {item.submittedByName} (
              <span dir="ltr">{item.submittedByEmail}</span>) در {faDateTime(item.createdAt)}
            </span>
          </div>
          <Badge
            variant={
              item.status === "approved"
                ? "success"
                : item.status === "pending"
                  ? "secondary"
                  : "destructive"
            }
          >
            {VERIFICATION_STATUS_LABELS[item.status]}
          </Badge>
        </div>

        {item.note && <p>توضیح قطعه‌ساز: {item.note}</p>}

        <div className="flex flex-wrap gap-2">
          {item.files.map((file) => (
            <Button
              key={file.id}
              variant="outline"
              size="sm"
              disabled={downloading !== null}
              onClick={() => download(file.id)}
              aria-label={`دانلود ${file.name}`}
            >
              <Download className="h-4 w-4" aria-hidden />
              <span dir="ltr">{file.name}</span>
            </Button>
          ))}
          {item.supplierId && (
            <Link
              href={`/suppliers/${item.supplierId}`}
              target="_blank"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              پروفایل عمومی
            </Link>
          )}
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}

        {item.decidedAt && (
          <p className="text-xs text-muted-foreground">
            بررسی: {item.decidedByName ?? "—"} در {faDateTime(item.decidedAt)}
            {item.decisionReason ? ` — ${item.decisionReason}` : ""}
          </p>
        )}
        {item.revokedAt && (
          <p className="text-xs text-destructive">
            لغو تأیید در {faDateTime(item.revokedAt)} — {item.revokeReason}
          </p>
        )}

        {item.status === "pending" && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onAction("approve")}>
              <BadgeCheck className="h-4 w-4" aria-hidden />
              تأیید
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction("reject")}>
              <XCircle className="h-4 w-4" aria-hidden />
              رد
            </Button>
          </div>
        )}
        {item.status === "approved" && (
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => onAction("revoke")}
          >
            لغو تأیید
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
