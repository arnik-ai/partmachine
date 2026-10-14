"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSignature,
  Printer,
  ScrollText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState, FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api-client";
import { localToday } from "@/lib/dates";
import { parseInteger } from "@/lib/money";
import { cn, faDate, faDateTime, faNumber } from "@/lib/utils";
import {
  requestContractChange,
  signContract,
  updateContract,
  useContract,
  useContractAction,
} from "../api";
import { CONTRACT_STATUS_LABELS, type Contract, type ContractSignature } from "../types";

const PENALTIES: Array<{ value: number; label: string }> = [
  { value: 0, label: "بدون جریمه" },
  { value: 20, label: "۰٫۲٪ در روز" },
  { value: 50, label: "۰٫۵٪ در روز" },
  { value: 100, label: "۱٪ در روز" },
];
const CAPS = [5, 10, 20];
const PREPAYMENT_PRESETS = [0, 30, 50];

/** قرارداد واقعی سفارش: متن، امضاها، و کار هر طرف (تنظیم، امضا، درخواست اصلاح) */
export function ContractView({ orderId }: { orderId: string }) {
  const { data: contract, isLoading, isError, error, refetch } = useContract(orderId);

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (isError && !(error instanceof ApiError && error.status === 404)) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }
  if (!contract) {
    return (
      <p className="py-12 text-center text-white/70">
        قرارداد پیدا نشد یا اجازه‌ی دیدن آن را ندارید.
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/orders/${orderId}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          بازگشت به سفارش
        </Link>
        <Button onClick={() => window.print()} variant="secondary" size="sm">
          <Printer className="h-4 w-4" aria-hidden />
          چاپ / ذخیره PDF
        </Button>
      </div>

      <div className="no-print flex items-start gap-2 rounded-lg border border-warning/50 bg-card p-3 text-sm text-card-foreground">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />
        {contract.draftNotice}
      </div>

      <Signatures contract={contract} />
      <ContractActions contract={contract} />
      <ContractDocument contract={contract} />
      {contract.history.length > 0 && <History contract={contract} />}
    </div>
  );
}

function Signatures({ contract }: { contract: Contract }) {
  const bySide = (side: "buyer" | "supplier") =>
    contract.signatures.find((signature) => signature.side === side);
  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>
            قرارداد سفارش <span dir="ltr">PM-{contract.orderNumber}</span> — نسخه‌ی{" "}
            {faNumber(contract.version)}
          </span>
          <Badge variant={contract.status === "signed" ? "success" : "secondary"}>
            {CONTRACT_STATUS_LABELS[contract.status]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <SignatureBox label="کارفرما" signature={bySide("buyer")} />
        <SignatureBox label="مجری (قطعه‌ساز)" signature={bySide("supplier")} />
      </CardContent>
    </Card>
  );
}

function SignatureBox({ label, signature }: { label: string; signature?: ContractSignature }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      {signature ? (
        <>
          <span className="font-semibold">{signature.organizationName}</span>
          <span className="inline-flex items-center gap-1.5 text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            امضا شد — {signature.signerName}
          </span>
          <span className="text-xs text-muted-foreground">{faDateTime(signature.signedAt)}</span>
        </>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-4 w-4" aria-hidden />
          در انتظار امضا
        </span>
      )}
    </div>
  );
}

type DialogName = "sign" | "change" | null;

function ContractActions({ contract }: { contract: Contract }) {
  const action = useContractAction(contract.orderId);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [password, setPassword] = useState("");
  const [read, setRead] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function open(name: DialogName) {
    setPassword("");
    setRead(false);
    setNote("");
    setError(null);
    setFieldErrors({});
    setDialog(name);
  }

  async function confirm() {
    setError(null);
    setFieldErrors({});
    if (dialog === "sign" && !read) {
      setError("ابتدا تأیید کنید که متن این نسخه را خوانده‌اید.");
      return;
    }
    try {
      await action.mutateAsync(() =>
        dialog === "sign"
          ? signContract(contract.orderId, contract.version, password)
          : requestContractChange(contract.orderId, note),
      );
      setDialog(null);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    }
  }

  const waiting =
    contract.isOpen &&
    contract.mySide !== "admin" &&
    contract.signatures.some((signature) => signature.side === contract.mySide);
  const ownerOnly = contract.isOpen && contract.mySide !== "admin" && !contract.canSign && !waiting;
  const closed = !contract.isOpen && contract.status !== "signed";

  return (
    <>
      {contract.canEdit && <TermsForm contract={contract} />}

      {(contract.canSign || contract.canRequestChange || waiting || ownerOnly || closed) && (
        <Card className="no-print">
          <CardContent className="flex flex-col gap-3 p-5 text-sm">
            {waiting && (
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" aria-hidden />
                امضای شما ثبت شد؛ منتظر امضای طرف مقابل هستیم.
              </p>
            )}
            {ownerOnly && (
              <p className="text-muted-foreground">
                قرارداد را مدیر سازمان شما امضا می‌کند؛ شما متن را می‌بینید.
              </p>
            )}
            {closed && (
              <p className="text-muted-foreground">
                این سفارش دیگر در مرحله‌ی قرارداد نیست و قرارداد قابل امضا یا تغییر نیست.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {contract.canSign && (
                <Button onClick={() => open("sign")}>
                  <FileSignature className="h-4 w-4" aria-hidden />
                  امضای قرارداد
                </Button>
              )}
              {contract.canRequestChange && (
                <Button variant="outline" onClick={() => open("change")}>
                  درخواست اصلاح
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={dialog === "sign"}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
        pending={action.isPending}
        error={fieldErrors.password ? null : error}
        title="امضای قرارداد"
        confirmLabel="امضا می‌کنم"
        description={`نسخه‌ی ${faNumber(contract.version)} با اثر انگشت ${contract.contentSha256.slice(0, 16)} از طرف سازمان شما امضا می‌شود. زمان، نشانی IP و مرورگر شما به‌عنوان شاهد ثبت می‌شود.`}
      >
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              checked={read}
              onChange={(e) => setRead(e.target.checked)}
            />
            متن این نسخه را خوانده‌ام و از طرف سازمانم می‌پذیرم.
          </label>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sign-password">رمز عبور حساب شما</Label>
            <Input
              id="sign-password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FieldError message={fieldErrors.password} />
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "change"}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
        pending={action.isPending}
        error={error}
        title="درخواست اصلاح قرارداد"
        confirmLabel="ارسال درخواست"
        description="کارفرما درخواست شما را در تاریخچه‌ی سفارش می‌بیند و در صورت موافقت، نسخه‌ی تازه می‌سازد."
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="change-note">چه چیزی باید اصلاح شود؟</Label>
          <Textarea
            id="change-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            className="min-h-20"
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

function TermsForm({ contract }: { contract: Contract }) {
  const action = useContractAction(contract.orderId);
  const [deliveryDue, setDeliveryDue] = useState(contract.terms.deliveryDue);
  const preset = PREPAYMENT_PRESETS.includes(contract.terms.prepaymentPercent);
  const [prepayment, setPrepayment] = useState(
    preset ? String(contract.terms.prepaymentPercent) : "custom",
  );
  const [custom, setCustom] = useState(preset ? "" : String(contract.terms.prepaymentPercent));
  const [penalty, setPenalty] = useState(String(contract.terms.penaltyPerDayBp));
  const [cap, setCap] = useState(String(contract.terms.penaltyCapPercent));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(false);
    const prepaymentPercent = prepayment === "custom" ? parseInteger(custom) : Number(prepayment);
    if (prepaymentPercent === null || prepaymentPercent < 0 || prepaymentPercent > 100) {
      setFieldErrors({ prepaymentPercent: "درصد پیش‌پرداخت باید عددی بین ۰ و ۱۰۰ باشد." });
      return;
    }
    try {
      await action.mutateAsync(() =>
        updateContract(contract.orderId, {
          deliveryDue,
          prepaymentPercent,
          penaltyPerDayBp: Number(penalty),
          penaltyCapPercent: Number(cap),
          changeNote: note,
        }),
      );
      setNote("");
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    }
  }

  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle>تنظیم شرایط قرارداد</CardTitle>
        <CardDescription>
          با ذخیره، نسخه‌ی تازه‌ای از قرارداد ساخته می‌شود و امضاهای نسخه‌ی قبلی باطل می‌شوند.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-4 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="delivery-due">تاریخ تحویل</Label>
              <Input
                id="delivery-due"
                type="date"
                min={localToday()}
                value={deliveryDue}
                onChange={(e) => setDeliveryDue(e.target.value)}
                required
              />
              <FieldError message={fieldErrors.deliveryDue} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="prepayment">شرایط پرداخت</Label>
              <Select
                id="prepayment"
                value={prepayment}
                onChange={(e) => setPrepayment(e.target.value)}
              >
                <option value="0">کل مبلغ پس از تحویل</option>
                <option value="30">۳۰٪ پیش‌پرداخت، ۷۰٪ پس از تحویل</option>
                <option value="50">۵۰٪ پیش‌پرداخت، ۵۰٪ پس از تحویل</option>
                <option value="custom">درصد پیش‌پرداخت دلخواه</option>
              </Select>
              {prepayment === "custom" && (
                <Input
                  aria-label="درصد پیش‌پرداخت"
                  inputMode="numeric"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="مثلاً ۲۰"
                />
              )}
              <FieldError message={fieldErrors.prepaymentPercent} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="penalty">جریمه‌ی تأخیر</Label>
              <Select id="penalty" value={penalty} onChange={(e) => setPenalty(e.target.value)}>
                {PENALTIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="penalty-cap">سقف جریمه</Label>
              <Select
                id="penalty-cap"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                disabled={penalty === "0"}
              >
                {CAPS.map((value) => (
                  <option key={value} value={value}>
                    {faNumber(value)}٪ مبلغ قرارداد
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="change-reason">توضیح تغییر (اختیاری؛ در تاریخچه ثبت می‌شود)</Label>
            <Input
              id="change-reason"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
          {error && Object.keys(fieldErrors).length === 0 && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              نسخه‌ی تازه‌ی قرارداد ذخیره شد.
            </p>
          )}
          <Button type="submit" variant="outline" disabled={action.isPending} className="self-start">
            {action.isPending ? "در حال ذخیره..." : "ذخیره‌ی شرایط"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ContractDocument({ contract }: { contract: Contract }) {
  return (
    <article className="contract-sheet flex flex-col gap-6 rounded-2xl border bg-card p-6 text-card-foreground shadow-sm sm:p-10">
      <header className="flex flex-col items-center gap-2 text-center">
        <ScrollText className="h-8 w-8 text-gold" aria-hidden />
        <h1 className="text-xl font-bold">قرارداد ساخت و تأمین قطعات صنعتی</h1>
        <p className="text-sm text-muted-foreground">
          سفارش <span dir="ltr">PM-{contract.orderNumber}</span> · نسخه‌ی{" "}
          {faNumber(contract.version)} · تنظیم: {faDate(contract.createdAt)}
        </p>
        <div className="h-1 w-24 rounded-full bg-gold" />
      </header>
      {contract.articles.map((article) => (
        <section key={article.number} className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">
            {article.title.startsWith("پیوست")
              ? article.title
              : `ماده ${faNumber(article.number)} — ${article.title}`}
          </h2>
          {article.paragraphs.length > 1 ? (
            <ul className="mr-5 list-disc space-y-1.5 text-sm leading-7 text-foreground/90">
              {article.paragraphs.map((paragraph, i) => (
                <li key={i}>{paragraph}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-7 text-foreground/90">{article.paragraphs[0]}</p>
          )}
        </section>
      ))}
      <Separator />
      <footer className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>
          اثر انگشت این نسخه (SHA-256):{" "}
          <span dir="ltr" className="break-all font-mono">
            {contract.contentSha256}
          </span>
        </span>
        {contract.signatures.map((signature) => (
          <span key={signature.side}>
            {signature.side === "buyer" ? "کارفرما" : "مجری"}: {signature.organizationName} —
            امضای {signature.signerName} در {faDateTime(signature.signedAt)}
          </span>
        ))}
      </footer>
    </article>
  );
}

function History({ contract }: { contract: Contract }) {
  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle>نسخه‌های قبلی</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y text-sm">
        {contract.history.map((version) => (
          <div key={version.number} className={cn("flex flex-col gap-0.5 py-2.5 first:pt-0")}>
            <span className="font-medium">
              نسخه‌ی {faNumber(version.number)} — {faDateTime(version.createdAt)}
              {version.createdByName ? ` — ${version.createdByName}` : ""}
            </span>
            {version.changeNote && <span>{version.changeNote}</span>}
            <span className="text-xs text-muted-foreground">
              {version.signatures.length > 0
                ? `امضاشده توسط: ${version.signatures.map((s) => s.organizationName).join("، ")} (با نسخه‌ی تازه باطل شد)`
                : "بدون امضا"}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
