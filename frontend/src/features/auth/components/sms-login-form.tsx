"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, errorMessage } from "@/lib/api-client";
import { confirmSmsLogin, isTwoFactorChallenge, requestSmsLoginCode } from "../api";
import { safeNextPath } from "../next-path";
import { TwoFactorStep } from "./two-factor-step";

/**
 * ورود با کد پیامکی در دو قدم: شماره ← کد ۶ رقمی.
 *
 * فقط شماره‌ای کار می‌کند که کاربر قبلاً در حسابش تأیید کرده است. سرور برای شماره‌ی ناشناس هم
 * همین پیام را می‌دهد تا فهرست شماره‌ها لو نرود، پس این‌جا هم پیام یکسان نشان داده می‌شود.
 */
export function SmsLoginForm({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    setFieldErrors({});
    setPending(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    } finally {
      setPending(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      const result = await requestSmsLoginCode(phone);
      setInfo(result.detail);
      setStep("code");
    });

  const signIn = () =>
    run(async () => {
      const result = await confirmSmsLogin(phone, code);
      if (isTwoFactorChallenge(result)) {
        setChallenge(result.challenge);
        return;
      }
      router.push(safeNextPath(window.location.search));
    });

  if (challenge) {
    return (
      <TwoFactorStep
        challenge={challenge}
        onDone={() => router.push(safeNextPath(window.location.search))}
        onCancel={() => setChallenge(null)}
      />
    );
  }

  return (
    <form
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        void (step === "phone" ? sendCode() : signIn());
      }}
    >
      <fieldset disabled={disabled || pending} className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sms-phone">شماره موبایل</Label>
          <Input
            id="sms-phone"
            name="phone"
            type="tel"
            dir="ltr"
            inputMode="numeric"
            autoComplete="tel"
            required
            readOnly={step === "code"}
            placeholder="۰۹۱۲۳۴۵۶۷۸۹"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <FieldError message={fieldErrors.phone} />
        </div>

        {step === "code" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-code">کد پیامک‌شده</Label>
            <Input
              id="sms-code"
              name="code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              placeholder="۱۲۳۴۵۶"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <FieldError message={fieldErrors.code} />
          </div>
        )}

        {info && <p className="text-sm text-muted-foreground">{info}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending
            ? step === "phone"
              ? "در حال ارسال کد..."
              : "در حال ورود..."
            : step === "phone"
              ? "ارسال کد"
              : "ورود"}
        </Button>

        {step === "code" && (
          <button
            type="button"
            className="text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setStep("phone");
              setCode("");
              setInfo(null);
            }}
          >
            شماره را اشتباه زدم
          </button>
        )}
      </fieldset>
    </form>
  );
}
