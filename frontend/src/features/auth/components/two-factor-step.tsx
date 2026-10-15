"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, errorMessage } from "@/lib/api-client";
import { loginSecondStep } from "../api";
import type { AuthSession } from "../types";

/** مرحله‌ی دوم ورود: کد ۶ رقمی اپ Authenticator، یا اگر گوشی در دسترس نیست، یکی از کدهای پشتیبان */
export function TwoFactorStep({
  challenge,
  notice,
  onDone,
  onCancel,
}: {
  challenge: string;
  /** پیام اضافه بالای فرم، مثلاً «رمز تازه ذخیره شد» */
  notice?: string;
  onDone: (session: AuthSession) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(undefined);
    setPending(true);
    try {
      onDone(await loginSecondStep(challenge, code));
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.code) setFieldError(err.fieldErrors.code);
      else setError(errorMessage(err, "ورود انجام نشد. لطفاً دوباره تلاش کنید."));
    } finally {
      setPending(false);
    }
  }

  function switchMode() {
    setRecovery((value) => !value);
    setCode("");
    setFieldError(undefined);
    setError(null);
  }

  return (
    <form onSubmit={handleSubmit} method="post" className="flex flex-col gap-4">
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
      <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p>
          {recovery
            ? "یکی از کدهای پشتیبانی را که هنگام روشن کردن ورود دومرحله‌ای ذخیره کردید وارد کنید. هر کد فقط یک بار کار می‌کند."
            : "کد ۶ رقمی اپ Authenticator (مثلاً Google Authenticator) را وارد کنید."}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="two-factor-code">{recovery ? "کد پشتیبان" : "کد ورود"}</Label>
        <Input
          id="two-factor-code"
          name="code"
          dir="ltr"
          required
          inputMode={recovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          maxLength={recovery ? 20 : 6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <FieldError message={fieldError} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "در حال بررسی..." : "تأیید و ورود"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" className="text-primary hover:underline" onClick={switchMode}>
          {recovery ? "کد اپ را وارد می‌کنم" : "به گوشی دسترسی ندارم"}
        </button>
        <button type="button" className="text-muted-foreground hover:underline" onClick={onCancel}>
          بازگشت
        </button>
      </div>
    </form>
  );
}
