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
  Microscope,
  ShieldAlert,
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
import { InspectionCard } from "@/features/inspections/components/inspection-card";
import { RatingCard } from "./rating-card";
import { PaymentsCard } from "@/features/payments/components/payments-card";
import { ApiError, errorMessage } from "@/lib/api-client";
import { faDate, faDateTime, faNumber, faToman } from "@/lib/utils";
import {
  cancelOrder,
  confirmDelivery,
  keepOrder,
  openDispute,
  shipOrder,
  useOrder,
  useOrderAction,
} from "../api";
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
  contract_revised: "نسخه‌ی تازه‌ی قرارداد",
  contract_signed: "امضای قرارداد",
  contract_change_requested: "درخواست اصلاح قرارداد",
  payment_reported: "اعلام پرداخت",
  payment_confirmed: "تأیید دریافت پرداخت",
  payment_rejected: "رد اعلام پرداخت",
  inspection_requested: "درخواست بازرسی کیفیت",
  inspection_lab_changed: "تغییر آزمایشگاه بازرسی",
  inspection_removed: "حذف بازرسی کیفیت",
  inspection_ready: "اعلام آمادگی برای بازرسی",
  inspection_passed: "قبولی بازرسی",
  inspection_failed: "رد بازرسی",
  cancel_requested: "درخواست لغو",
  cancel_request_closed: "بسته شدن درخواست لغو",
  dispute: "اعلام مشکل",
  dispute_resolved: "تصمیم پشتیبانی",
  rated: "امتیاز کارفرما",
  completed: "تکمیل سفارش",
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
      {/* آزمایشگاه فقط بخش بازرسی را دارد؛ مبلغ، پرداخت‌ها و قرارداد برایش نیست */}
      {order.mySide !== "qc" && <NextStep order={order} />}
      {order.status === "completed" && order.mySide !== "qc" && <RatingCard order={order} />}
      <InspectionCard order={order} />
      {order.mySide !== "qc" && <PaymentsCard order={order} />}
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
    ...(order.amountRials !== null ? [["مبلغ", faToman(order.amountRials)]] : []),
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
        {order.mySide !== "qc" && (
          <Link
            href={`/rfqs/${order.rfqId}`}
            className="self-start text-sm text-primary hover:underline"
          >
            مشاهده‌ی درخواست و پیشنهادها
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

type Dialog = "cancel" | "ship" | "confirm_delivery" | "dispute" | "agree_cancel" | "keep" | null;

const EMPTY_UPLOAD: UploadState = { fileIds: [], busy: false, failed: false };

function NextStep({ order }: { order: OrderDetail }) {
  const action = useOrderAction(order.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const [upload, setUpload] = useState<UploadState>(EMPTY_UPLOAD);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const can = (name: OrderDetail["nextActions"][number]) => order.nextActions.includes(name);
  const otherSide = order.mySide === "buyer" ? "قطعه‌ساز" : "کارفرما";
  const signed = order.status !== "awaiting_contract";
  const request = order.cancelRequest;
  const requestedByMe = request ? request.side === order.mySide : false;

  function open(next: Dialog) {
    setText("");
    setUpload(EMPTY_UPLOAD);
    setError(null);
    setDialog(next);
  }

  async function confirm() {
    setError(null);
    if (dialog === "cancel" && text.trim().length < 3) {
      setError("دلیل لغو را بنویسید؛ طرف مقابل آن را می‌بیند.");
      return;
    }
    if (dialog === "dispute" && text.trim().length < 10) {
      setError("مشکل را کمی دقیق‌تر شرح دهید (دست‌کم ۱۰ نویسه).");
      return;
    }
    if ((dialog === "ship" || dialog === "dispute") && (upload.busy || upload.failed)) {
      setError("صبر کنید تا بارگذاری سند تمام شود، یا سند ناموفق را حذف کنید.");
      return;
    }
    try {
      await action.mutateAsync(() => {
        if (dialog === "cancel") return cancelOrder(order.id, text);
        if (dialog === "agree_cancel") return cancelOrder(order.id, "");
        if (dialog === "keep") return keepOrder(order.id, text);
        if (dialog === "ship") {
          return shipOrder(order.id, { note: text, fileId: upload.fileIds[0] ?? null });
        }
        if (dialog === "dispute") {
          return openDispute(order.id, { reason: text, fileId: upload.fileIds[0] ?? null });
        }
        return confirmDelivery(order.id, text);
      });
      setDialog(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function downloadEvidence(fileId: string) {
    setDownloading(true);
    try {
      await downloadFile(fileId);
    } finally {
      setDownloading(false);
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
  } else if (order.status === "disputed") {
    message = (
      <span className="flex items-start gap-2">
        <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <span>
          {order.dispute
            ? `${SIDE_LABELS[order.dispute.openedSide]} برای این سفارش مشکل اعلام کرده است: ${order.dispute.reason}`
            : "برای این سفارش مشکل اعلام شده است."}{" "}
          تا تصمیم پشتیبانی تراشینو، سفارش متوقف است. پشتیبانی با هر دو طرف تماس می‌گیرد و
          تصمیم را با دلیل ثبت می‌کند: ادامه‌ی سفارش، تکمیل یا لغو.
        </span>
      </span>
    );
  } else if (order.status === "awaiting_contract") {
    message = (
      <span className="flex items-start gap-2">
        <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span>
          قدم بعدی تنظیم و امضای قرارداد توسط مدیر هر دو طرف است.
          {order.mySide === "buyer" ? " شرایط قرارداد (تاریخ تحویل، پرداخت و جریمه) را شما تنظیم می‌کنید." : ""}{" "}
          تا پیش از امضای قرارداد، هر طرف می‌تواند سفارش را با ذکر دلیل لغو کند.
        </span>
      </span>
    );
  } else if (order.status === "awaiting_prepayment") {
    message = (
      <span className="flex items-start gap-2">
        <Hourglass className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span>
          {order.mySide === "buyer"
            ? "قرارداد امضا شد. پیش‌پرداخت را طبق قرارداد به قطعه‌ساز بپردازید و در بخش «پرداخت‌ها» اعلام کنید."
            : order.mySide === "supplier"
              ? "قرارداد امضا شد. پس از دریافت پیش‌پرداخت، آن را در بخش «پرداخت‌ها» تأیید کنید تا تولید شروع شود."
              : "منتظر پیش‌پرداخت کارفرما و تأیید قطعه‌ساز هستیم."}
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
  } else if (order.status === "in_inspection") {
    message = (
      <span className="flex items-start gap-2">
        <Microscope className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span>سفارش در مرحله‌ی بازرسی کیفیت است؛ جزئیات و نتیجه در بخش «کنترل کیفیت».</span>
      </span>
    );
  } else if (order.status === "in_production" && order.inspection) {
    message = (
      <span className="flex items-start gap-2">
        <Microscope className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span>
          {order.mySide === "supplier"
            ? "پیش از ارسال، بازرسی کیفیت لازم است. وقتی قطعات آماده شد، در بخش «کنترل کیفیت» آمادگی برای بازرسی را اعلام کنید."
            : "قطعه‌ساز در حال تولید است؛ پس از آماده شدن، آزمایشگاه قطعات را پیش از ارسال بازرسی می‌کند."}
        </span>
      </span>
    );
  } else if (can("confirm_delivery")) {
    message = (
      <span className="flex items-start gap-2">
        <Truck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span>
          سفارش ارسال شده است. پس از دریافت و بررسی، تحویل را تأیید کنید؛ اگر کالا مشکل دارد،
          «اعلام مشکل» کنید.
        </span>
      </span>
    );
  } else if (order.status === "delivered" || order.status === "completed") {
    message = (
      <span className="flex items-start gap-2">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
        <span>
          {order.status === "completed"
            ? "این سفارش با موفقیت تکمیل شده است."
            : order.mySide === "buyer"
              ? "کالا تحویل شد. تسویه‌ی پایانی را بپردازید و در بخش «پرداخت‌ها» اعلام کنید."
              : "کالا تحویل شد. پس از دریافت تسویه‌ی پایانی، آن را در بخش «پرداخت‌ها» تأیید کنید."}
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
        {order.status === "disputed" && order.dispute?.file && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={downloading}
            onClick={() => order.dispute?.file && downloadEvidence(order.dispute.file.id)}
            aria-label={`دانلود ${order.dispute.file.name}`}
          >
            <Download className="h-4 w-4" aria-hidden />
            سند مشکل
          </Button>
        )}

        {request && (
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <span className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <span>
                {requestedByMe
                  ? `درخواست لغو شما منتظر پاسخ ${otherSide} است. دلیل: ${request.reason}`
                  : `${otherSide} درخواست لغو این سفارش را داده است. دلیل: ${request.reason}. پس از امضای قرارداد، لغو فقط با موافقت شما انجام می‌شود.`}
              </span>
            </span>
            <div className="flex flex-wrap gap-2">
              {!requestedByMe && can("cancel") && (
                <Button variant="destructive" size="sm" onClick={() => open("agree_cancel")}>
                  موافقت با لغو
                </Button>
              )}
              {can("keep") && (
                <Button variant="outline" size="sm" onClick={() => open("keep")}>
                  {requestedByMe ? "پس گرفتن درخواست لغو" : "ادامه‌ی سفارش"}
                </Button>
              )}
            </div>
          </div>
        )}

        {order.status !== "cancelled" && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/orders/${order.id}/contract`}
              className={buttonVariants({
                variant: order.status === "awaiting_contract" ? "default" : "outline",
              })}
            >
              {order.status === "awaiting_contract" && order.mySide !== "admin"
                ? "مشاهده و امضای قرارداد"
                : "مشاهده‌ی قرارداد"}
            </Link>
            {can("ship") && <Button onClick={() => open("ship")}>ثبت ارسال</Button>}
            {can("confirm_delivery") && (
              <Button onClick={() => open("confirm_delivery")}>تأیید تحویل</Button>
            )}
            {can("dispute") && (
              <Button variant="outline" onClick={() => open("dispute")}>
                اعلام مشکل
              </Button>
            )}
            {can("cancel") && !request && (
              <Button variant="outline" onClick={() => open("cancel")}>
                {signed ? "درخواست لغو" : "لغو سفارش"}
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
        title={signed ? "درخواست لغو سفارش" : "لغو سفارش"}
        confirmLabel={signed ? "ثبت درخواست لغو" : "بله، سفارش لغو شود"}
        description={
          signed
            ? `پس از امضای قرارداد، سفارش فقط با موافقت ${otherSide} لغو می‌شود. دلیل شما برای او نمایش داده می‌شود و تا پاسخ او سفارش ادامه دارد.`
            : "لغو قابل بازگشت نیست. دلیل شما برای طرف مقابل نمایش داده می‌شود."
        }
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
        open={dialog === "agree_cancel"}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
        pending={action.isPending}
        error={error}
        destructive
        title="موافقت با لغو سفارش"
        confirmLabel="بله، سفارش لغو شود"
        description={`سفارش با توافق دو طرف لغو می‌شود و قابل بازگشت نیست. دلیل ثبت‌شده: ${request?.reason ?? ""}`}
      />

      <ConfirmDialog
        open={dialog === "keep"}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
        pending={action.isPending}
        error={error}
        title={requestedByMe ? "پس گرفتن درخواست لغو" : "ادامه‌ی سفارش"}
        confirmLabel={requestedByMe ? "پس گرفتن درخواست" : "سفارش ادامه یابد"}
        description={
          requestedByMe
            ? "درخواست لغو بسته می‌شود و سفارش مثل قبل ادامه دارد."
            : `با لغو موافقت نمی‌کنید و سفارش ادامه دارد. ${otherSide} باخبر می‌شود؛ اگر مشکلی هست، «اعلام مشکل» کنید.`
        }
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="keep-note">توضیح (اختیاری)</Label>
          <Input
            id="keep-note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "dispute"}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
        pending={action.isPending}
        error={error}
        destructive
        title="اعلام مشکل"
        confirmLabel="ثبت و ارسال برای پشتیبانی"
        description="سفارش تا تصمیم پشتیبانی تراشینو متوقف می‌شود. پشتیبانی با هر دو طرف تماس می‌گیرد و تصمیم را با دلیل ثبت می‌کند: ادامه‌ی سفارش، تکمیل یا لغو. پول از تراشینو عبور نمی‌کند؛ این تصمیم فقط وضعیت سفارش در پلتفرم است."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dispute-reason">شرح مشکل</Label>
            <Textarea
              id="dispute-reason"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              className="min-h-20"
            />
          </div>
          {dialog === "dispute" && (
            <FileUploader
              purpose="order_document"
              extensions={["pdf", "png", "jpg", "jpeg"]}
              maxSizeMb={10}
              maxFiles={1}
              prompt="عکس یا سند مشکل (اختیاری)"
              formatsHint="PDF · JPG · PNG — max 10MB"
              inputLabel="انتخاب سند مشکل"
              onChange={setUpload}
            />
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "ship"}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
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
