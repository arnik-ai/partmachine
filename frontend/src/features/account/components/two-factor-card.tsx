"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/features/auth/store";
import type { TwoFactorSetup } from "@/features/auth/types";
import { ApiError, errorMessage } from "@/lib/api-client";
import { disableTwoFactor, enableTwoFactor, newRecoveryCodes, startTwoFactorSetup } from "../api";

type Step = "idle" | "setup" | "codes" | "disable" | "regenerate";

/** کلید مخفی در گروه‌های چهارتایی، برای وارد کردن دستی در اپ */
function grouped(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * ورود دومرحله‌ای با اپ Authenticator: روشن کردن با QR، کدهای پشتیبان یک‌بارمصرف، و خاموش کردن.
 * برای ادمین اجباری است و خاموش نمی‌شود.
 */
export function TwoFactorCard({ adminRequired }: { adminRequired: boolean }) {
  const user = useAuthStore((s) => s.user);
  const enabled = user?.twoFactorEnabled ?? false;
  const locked = adminRequired && user?.role === "admin";
  const [step, setStep] = useState<Step>("idle");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  function reset(next: Step) {
    setStep(next);
    setCode("");
    setPassword("");
    setFieldErrors({});
    setError(null);
    setCopied(false);
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    setFieldErrors({});
    setPending(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err, fallback));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    } finally {
      setPending(false);
    }
  }

  const begin = () =>
    run(async () => {
      setSetup(await startTwoFactorSetup());
      reset("setup");
    }, "شروع ورود دومرحله‌ای انجام نشد. لطفاً دوباره تلاش کنید.");

  const confirm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!setup) return;
    void run(async () => {
      const fresh = await enableTwoFactor(setup.setupToken, code, password);
      setSetup(null);
      reset("codes");
      setCodes(fresh);
    }, "روشن کردن انجام نشد. لطفاً دوباره تلاش کنید.");
  };

  const verify = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      if (step === "disable") {
        await disableTwoFactor(password, code);
        reset("idle");
      } else {
        const fresh = await newRecoveryCodes(password, code);
        reset("codes");
        setCodes(fresh);
      }
    }, "انجام نشد. لطفاً دوباره تلاش کنید.");
  };

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function downloadCodes() {
    const text = ["کدهای پشتیبان ورود دومرحله‌ای تراشینو", user?.email ?? "", "", ...codes].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "partmachine-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  const errorLine = error && !Object.keys(fieldErrors).length && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );

  return (
    <Card id="two-factor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          ورود دومرحله‌ای
        </CardTitle>
        <CardDescription>
          پس از رمز، کد ۶ رقمی اپ Authenticator روی گوشی‌تان (مثلاً Google Authenticator) هم پرسیده
          می‌شود؛ حتی اگر کسی رمز شما را بداند، بدون گوشی‌تان وارد نمی‌شود.
          {locked && " برای حساب ادمین اجباری است."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step === "setup" && setup ? (
          <form onSubmit={confirm} className="flex max-w-md flex-col gap-4">
            <ol className="flex list-decimal flex-col gap-2 ps-5 text-sm">
              <li>اپ Authenticator را روی گوشی باز کنید و این QR را اسکن کنید.</li>
              <li>کد ۶ رقمی‌ای را که اپ نشان می‌دهد، همراه رمز حساب وارد کنید.</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element -- تصویر data URI از خود سرور */}
            <img
              src={setup.qrCode}
              alt="QR ورود دومرحله‌ای"
              width={200}
              height={200}
              className="rounded-lg bg-white p-2"
            />
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">اگر اسکن نشد، این کلید را دستی در اپ وارد کنید:</span>
              <code dir="ltr" className="font-mono text-base" data-testid="two-factor-secret">
                {grouped(setup.secret)}
              </code>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="two-factor-setup-code">کد ۶ رقمی اپ</Label>
              <Input
                id="two-factor-setup-code"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <FieldError message={fieldErrors.code} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="two-factor-setup-password">رمز عبور حساب</Label>
              <Input
                id="two-factor-setup-password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FieldError message={fieldErrors.password} />
            </div>
            {errorLine}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "در حال بررسی..." : "تأیید و روشن کردن"}
              </Button>
              <Button type="button" variant="outline" onClick={() => reset("idle")}>
                انصراف
              </Button>
            </div>
          </form>
        ) : step === "codes" ? (
          <div className="flex max-w-md flex-col gap-4">
            <p className="text-sm">
              این ۱۰ کد پشتیبان را جایی امن نگه دارید (مثلاً چاپ کنید یا در یک مدیر رمز ذخیره کنید).
              اگر گوشی را گم کنید، با هر کدام <strong>یک بار</strong> می‌توانید وارد شوید.{" "}
              <strong>این کدها دوباره نمایش داده نمی‌شوند.</strong>
            </p>
            <ul dir="ltr" className="grid grid-cols-2 gap-2 font-mono text-sm">
              {codes.map((item) => (
                <li key={item} className="rounded bg-muted px-2 py-1 text-center" data-testid="recovery-code">
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyCodes()}>
                <Copy className="h-4 w-4" aria-hidden />
                {copied ? "کپی شد" : "کپی همه"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={downloadCodes}>
                <Download className="h-4 w-4" aria-hidden />
                دانلود فایل
              </Button>
            </div>
            <Button type="button" className="self-start" onClick={() => reset("idle")}>
              ذخیره کردم
            </Button>
          </div>
        ) : step === "disable" || step === "regenerate" ? (
          <form onSubmit={verify} className="flex max-w-md flex-col gap-4">
            <p className="text-sm">
              {step === "disable"
                ? "برای خاموش کردن، رمز حساب و کد اپ (یا یک کد پشتیبان) را وارد کنید."
                : "برای ساختن کدهای پشتیبان تازه، رمز حساب و کد اپ را وارد کنید. کدهای قبلی دیگر کار نمی‌کنند."}
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="two-factor-verify-code">کد اپ یا کد پشتیبان</Label>
              <Input
                id="two-factor-verify-code"
                dir="ltr"
                autoComplete="one-time-code"
                maxLength={20}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <FieldError message={fieldErrors.code} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="two-factor-verify-password">رمز عبور حساب</Label>
              <Input
                id="two-factor-verify-password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FieldError message={fieldErrors.password} />
            </div>
            {errorLine}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending} variant={step === "disable" ? "destructive" : "default"}>
                {pending ? "در حال بررسی..." : step === "disable" ? "خاموش کردن" : "ساختن کدهای تازه"}
              </Button>
              <Button type="button" variant="outline" onClick={() => reset("idle")}>
                انصراف
              </Button>
            </div>
          </form>
        ) : enabled ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              ورود دومرحله‌ای روشن است.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => reset("regenerate")}>
                کدهای پشتیبان تازه
              </Button>
              {!locked && (
                <Button type="button" variant="outline" size="sm" onClick={() => reset("disable")}>
                  خاموش کردن
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {errorLine}
            <Button type="button" className="self-start" disabled={pending} onClick={() => void begin()}>
              {pending ? "در حال آماده‌سازی..." : "روشن کردن ورود دومرحله‌ای"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
