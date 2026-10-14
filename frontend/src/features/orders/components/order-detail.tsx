"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Download,
  FileText,
  Hourglass,
  Truck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { downloadFile } from "@/features/files/api";
import { FileUploader, type UploadState } from "@/features/files/components/file-uploader";
import { ApiError, errorMessage } from "@/lib/api-client";
import { faDate, faDateTime, faNumber, faToman } from "@/lib/utils";
import { cancelOrder, confirmDelivery, shipOrder, useOrder, useOrderAction } from "../api";
import { ORDER_STATUS_LABELS, orderNumber, type OrderDetail, type OrderEvent } from "../types";
import { OrderFlow } from "./order-flow";

const SIDE_LABELS: Record<OrderEvent["actorSide"], string> = {
  buyer: "کارفرما",
  supplier: "قطعه‌ساز",
  qc: "آزمایشگاه",
  admin: "پشتیبانی",
  system: "سامانه",
};

const EVENT_LABELS: Record<string, string> = {
  created: "سفارش ساخته شد",
  cancel: "لغو سفارش",
  ship: "ثبت ارسال",
  confirm_delivery: "تأیید تحویل",
};

export function OrderDetailView({ orderId }: { orderId: string }) {
  const { data: order, isLoading, isError, error, refetch } = useOrder(orderId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (isError && !(error instanceof ApiError && error.status === 404)) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }
  if (!order) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-white/70">
        <p>سفارش موردنظر پیدا نشد یا اجازه‌ی دیدن آن را ندارید.</p>
        <Link href="/orders" className={buttonVariants({ variant: "outline" })}>
          بازگشت به سفارش‌ها
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/orders"
        className={buttonVariants({ variant: "outline", size: "sm" })}
        style={{ alignSelf: "flex-start" }}
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        بازگشت به سفارش‌ها
      </Link>
      <OrderHeader order={order} />
      <NextStep order={order} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>مراحل سفارش</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderFlow order={order} />
          </CardContent>
        </Card>
        <History order={order} />
      </div>
    </div>
  );
}

function OrderHeader({ order }: { order: OrderDetail }) {
  const facts = [
    ["تعداد", `${faNumber(order.quantity)} عدد`],
    ["متریال", order.material],
    ["مبلغ", faToman(order.amountRials)],
    ["زمان تولید", `${faNumber(order.leadTimeDays)} روز`],
    ["تاریخ تحویل تعهدشده", faDate(order.deliveryDue)],
    ["محل تحویل", order.deliveryCity],
  ];
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground" dir="ltr">
              {orderNumber(order.number)}
            </span>
            <h1 className="text-xl font-bold">{order.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={order.status === "cancelled" ? "destructive" : "secondary"}>
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
            {order.isOverdue && (
              <Badge variant="destructive">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                دیرکرد در تحویل
              </Badge>
            )}
          </div>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">کارفرما</span>
            <span className="font-medium">{order.buyer.name}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">قطعه‌ساز</span>
            <Link
              href={`/suppliers/${order.supplier.supplierId}`}
              className="flex items-center gap-1.5 font-medium hover:underline"
            >
              {order.supplier.name}
              {order.supplier.verified && (
                <BadgeCheck className="h-4 w-4 text-success" aria-label="تأییدشده" />
              )}
            </Link>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <Link
          href={`/rfqs/${order.rfqId}`}
          className="self-start text-sm text-primary hover:underline"
        >
          مشاهده‌ی درخواست و پیشنهادها
        </Link>
      </CardContent>
    </Card>
  );
}

type Dialog = "cancel" | "ship" | "confirm_delivery" | null;

function NextStep({ order }: { order: OrderDetail }) {
  const action = useOrderAction(order.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const [upload, setUpload] = useState<UploadState>({ fileIds: [], busy: false, failed: false });
  const [error, setError] = useState<string | null>(null);
  const can = (name: OrderDetail["nextActions"][number]) => order.nextActions.includes(name);
  const otherSide = order.mySide === "buyer" ? "قطعه‌ساز" : "کارفرما";

  function open(next: Dialog) {
    setText("");
    setError(null);
    setDialog(next);
  }

  async function confirm() {
    setError(null);
    if (dialog === "cancel" && text.trim().length < 3) {
      setError("دلیل لغو را بنویسید؛ طرف مقابل آن را می‌بیند.");
      return;
    }
    try {
      await action.mutateAsync(() => {
        if (dialog === "cancel") return cancelOrder(order.id, text);
        if (dialog === "ship") {
          return shipOrder(order.id, { note: text, fileId: upload.fileIds[0] ?? null });
        }
        return confirmDelivery(order.id, text);
      });
      setDialog(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  let message: React.ReactNode;
  if (order.status === "cancelled") {
    message = (
      <span className="flex items-start gap-2">
        <XCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <span>
          این سفارش لغو شده است.
          {order.cancelReason ? ` دلیل: ${order.cancelReason}` : ""}
        </span>
      </span>
    );
  } else if (order.status === "awaiting_contract") {
    message = (
      <span className="flex items-start gap-2">
        <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span>
          قدم بعدی تنظیم و امضای قرارداد توسط مدیر هر دو طرف است. این بخش به‌زودی فعال می‌شود.
          تا پیش از امضای قرارداد، هر طرف می‌تواند سفارش را با ذکر دلیل لغو کند.
        </span>
      </span>
    );
  } else if (can("ship")) {
    message = (
      <span className="flex items-start gap-2">
        <Truck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span>پس از آماده شدن سفارش، ارسال را با اطلاعات باربری و بارنامه ثبت کنید.</span>
      </span>
    );
  } else if (can("confirm_delivery")) {
    message = (
      <span className="flex items-start gap-2">
        <Truck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span>سفارش ارسال شده است. پس از دریافت و بررسی، تحویل را تأیید کنید.</span>
      </span>
    );
  } else if (order.status === "delivered" || order.status === "completed") {
    message = (
      <span className="flex items-start gap-2">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
        <span>
          {order.status === "completed"
            ? "این سفارش با موفقیت تکمیل شده است."
            : "کالا تحویل شده است. تسویه‌ی نهایی به‌زودی از همین‌جا پیگیری می‌شود."}
        </span>
      </span>
    );
  } else {
    message = (
      <span className="flex items-start gap-2">
        <Hourglass className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <span>منتظر اقدام {order.mySide === "admin" ? "طرفین" : otherSide} هستیم.</span>
      </span>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>کار بعدی</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {message}
        {order.nextActions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {can("ship") && <Button onClick={() => open("ship")}>ثبت ارسال</Button>}
            {can("confirm_delivery") && (
              <Button onClick={() => open("confirm_delivery")}>تأیید تحویل</Button>
            )}
            {can("cancel") && (
              <Button variant="outline" onClick={() => open("cancel")}>
                لغو سفارش
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
        pending={action.isPending}
        error={error}
        destructive
        title="لغو سفارش"
        confirmLabel="بله، سفارش لغو شود"
        description="لغو قابل بازگشت نیست. دلیل شما برای طرف مقابل نمایش داده می‌شود."
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="cancel-reason">دلیل لغو</Label>
          <Textarea
            id="cancel-reason"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            className="min-h-16"
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "ship"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (upload.busy || upload.failed) {
            setError("صبر کنید تا بارگذاری سند تمام شود، یا سند ناموفق را حذف کنید.");
            return;
          }
          void confirm();
        }}
        pending={action.isPending}
        error={error}
        title="ثبت ارسال"
        confirmLabel="ثبت ارسال"
        description="کارفرما پس از دریافت، تحویل را تأیید می‌کند."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ship-note">اطلاعات ارسال (اختیاری)</Label>
            <Input
              id="ship-note"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="مثلاً نام باربری و شماره‌ی بارنامه"
            />
          </div>
          {dialog === "ship" && (
            <FileUploader
              purpose="order_document"
              extensions={["pdf", "png", "jpg", "jpeg"]}
              maxSizeMb={10}
              maxFiles={1}
              prompt="بارنامه یا سند ارسال (اختیاری)"
              formatsHint="PDF · JPG · PNG — max 10MB"
              inputLabel="انتخاب سند ارسال"
              onChange={setUpload}
            />
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "confirm_delivery"}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
        pending={action.isPending}
        error={error}
        title="تأیید تحویل"
        confirmLabel="بله، کالا را تحویل گرفتم"
        description="با تأیید، دریافت کالا در تاریخچه‌ی سفارش ثبت می‌شود."
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="delivery-note">توضیح (اختیاری)</Label>
          <Input
            id="delivery-note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
          />
        </div>
      </ConfirmDialog>
    </Card>
  );
}

function History({ order }: { order: OrderDetail }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(id: string) {
    setError(null);
    setBusy(id);
    try {
      await downloadFile(id);
    } catch (err) {
      setError(errorMessage(err, "دانلود انجام نشد."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>تاریخچه</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {[...order.events].reverse().map((event) => {
          const file = event.file;
          return (
          <div key={event.id} className="flex flex-col gap-1 py-3 text-sm first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{EVENT_LABELS[event.action] ?? event.action}</span>
              <span className="text-xs text-muted-foreground">{faDateTime(event.createdAt)}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {SIDE_LABELS[event.actorSide]}
              {event.actorName ? ` — ${event.actorName}` : ""}
            </span>
            {event.note && <p>{event.note}</p>}
            {file && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={busy !== null}
                onClick={() => download(file.id)}
                aria-label={`دانلود ${file.name}`}
              >
                <Download className="h-4 w-4" aria-hidden />
                <span dir="ltr">{file.name}</span>
              </Button>
            )}
          </div>
          );
        })}
        {error && (
          <p role="alert" className="pt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
