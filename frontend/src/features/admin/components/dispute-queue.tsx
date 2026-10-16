"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { downloadFile } from "@/features/files/api";
import { ORDER_STATUS_LABELS, orderNumber } from "@/features/orders/types";
import { errorMessage } from "@/lib/api-client";
import { faDateTime, faNumber, faToman } from "@/lib/utils";
import { ADMIN_PAGE_SIZE, useDisputes, useResolveDispute } from "../api";
import type { AdminDispute, DisputeFilter, DisputeResolution } from "../types";
import { Pager } from "./admin-shell";

const FILTERS: Array<{ value: DisputeFilter; label: string }> = [
  { value: "open", label: "در انتظار تصمیم" },
  { value: "resolved", label: "تصمیم‌گرفته‌شده" },
  { value: "all", label: "همه" },
];

const SIDES = { buyer: "کارفرما", supplier: "قطعه‌ساز" } as const;

const RESOLUTIONS: Record<
  DisputeResolution,
  { label: string; confirm: string; destructive: boolean }
> = {
  resume: { label: "ادامه‌ی سفارش", confirm: "سفارش ادامه یابد", destructive: false },
  complete: { label: "تکمیل سفارش", confirm: "سفارش تکمیل شود", destructive: false },
  cancel: { label: "لغو سفارش", confirm: "سفارش لغو شود", destructive: true },
};

function effect(resolution: DisputeResolution, item: AdminDispute): string {
  const result =
    resolution === "resume"
      ? `سفارش از مرحله‌ی «${ORDER_STATUS_LABELS[item.previousStatus]}» ادامه می‌یابد.`
      : resolution === "complete"
        ? "سفارش «تکمیل‌شده» ثبت می‌شود."
        : "سفارش لغو می‌شود و قابل بازگشت نیست.";
  return `${result} دلیل شما برای هر دو طرف نمایش داده می‌شود. پول از تراشینو عبور نمی‌کند؛ این تصمیم فقط وضعیت سفارش در پلتفرم است.`;
}

/** صف اختلاف‌ها: هر مورد با شرح مشکل، سند و تصمیم با دلیل (ادامه، تکمیل یا لغو) */
export function DisputeQueue() {
  const [status, setStatus] = useState<DisputeFilter>("open");
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, error, refetch, isFetching } = useDisputes(status, page);
  const resolve = useResolveDispute();
  const [action, setAction] = useState<{
    item: AdminDispute;
    resolution: DisputeResolution;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const pages = data ? Math.max(1, Math.ceil(data.total / ADMIN_PAGE_SIZE)) : 1;

  function open(item: AdminDispute, resolution: DisputeResolution) {
    setAction({ item, resolution });
    setReason("");
    setActionError(null);
  }

  async function confirm() {
    if (!action) return;
    if (reason.trim().length < 3) {
      setActionError("دلیل تصمیم را بنویسید؛ هر دو طرف آن را می‌بینند.");
      return;
    }
    setActionError(null);
    try {
      await resolve.mutateAsync({
        id: action.item.id,
        resolution: action.resolution,
        reason,
      });
      setAction(null);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="وضعیت اختلاف‌ها">
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
        <p className="py-8 text-center text-muted-foreground">
          {status === "open" ? "اختلافی در انتظار تصمیم نیست." : "موردی پیدا نشد."}
        </p>
      ) : (
        <div className="flex flex-col gap-3" style={{ opacity: isFetching ? 0.6 : 1 }}>
          {data.items.map((item) => (
            <DisputeCard key={item.id} item={item} onResolve={(r) => open(item, r)} />
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
          pending={resolve.isPending}
          error={actionError}
          destructive={RESOLUTIONS[action.resolution].destructive}
          title={`${RESOLUTIONS[action.resolution].label} — ${orderNumber(action.item.orderNumber)}`}
          confirmLabel={RESOLUTIONS[action.resolution].confirm}
          description={effect(action.resolution, action.item)}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="dispute-decision">دلیل تصمیم (به هر دو طرف نمایش داده می‌شود)</Label>
            <Textarea
              id="dispute-decision"
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

function DisputeCard({
  item,
  onResolve,
}: {
  item: AdminDispute;
  onResolve: (resolution: DisputeResolution) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = item.file;

  async function download(id: string) {
    setError(null);
    setDownloading(true);
    try {
      await downloadFile(id);
    } catch (err) {
      setError(errorMessage(err, "دانلود انجام نشد."));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card role="article" aria-label={`اختلاف ${orderNumber(item.orderNumber)}`}>
      <CardContent className="flex flex-col gap-3 p-5 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold">
              <span dir="ltr">{orderNumber(item.orderNumber)}</span> — {item.orderTitle}
            </span>
            <span className="text-xs text-muted-foreground">
              کارفرما: {item.buyerName} · قطعه‌ساز: {item.supplierName} ·{" "}
              {faToman(item.amountRials)}
            </span>
          </div>
          <Badge variant={item.status === "open" ? "warning" : "secondary"}>
            {item.status === "open"
              ? "در انتظار تصمیم"
              : RESOLUTIONS[item.resolution ?? "resume"].label}
          </Badge>
        </div>

        <p>
          <span className="font-medium">
            اعلام مشکل توسط {SIDES[item.openedSide]}
            {item.openedByName ? ` (${item.openedByName})` : ""}:
          </span>{" "}
          {item.reason}
        </p>
        <span className="text-xs text-muted-foreground">
          {faDateTime(item.openedAt)} — مرحله‌ی پیش از اختلاف:{" "}
          {ORDER_STATUS_LABELS[item.previousStatus]}
        </span>

        <div className="flex flex-wrap gap-2">
          {file && (
            <Button
              variant="outline"
              size="sm"
              disabled={downloading}
              onClick={() => download(file.id)}
              aria-label={`دانلود ${file.name}`}
            >
              <Download className="h-4 w-4" aria-hidden />
              <span dir="ltr">{file.name}</span>
            </Button>
          )}
          <Link
            href={`/orders/${item.orderId}`}
            target="_blank"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            مشاهده‌ی سفارش و تاریخچه
          </Link>
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}

        {item.status === "open" ? (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {(Object.keys(RESOLUTIONS) as DisputeResolution[]).map((resolution) => (
              <Button
                key={resolution}
                size="sm"
                variant={RESOLUTIONS[resolution].destructive ? "outline" : "default"}
                onClick={() => onResolve(resolution)}
              >
                {RESOLUTIONS[resolution].label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="border-t pt-3 text-xs text-muted-foreground">
            تصمیم: {RESOLUTIONS[item.resolution ?? "resume"].label} — {item.decisionReason}
            {item.resolvedByName ? ` — ${item.resolvedByName}` : ""}
            {item.resolvedAt ? ` در ${faDateTime(item.resolvedAt)}` : ""} — وضعیت فعلی سفارش:{" "}
            {ORDER_STATUS_LABELS[item.orderStatus]}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
