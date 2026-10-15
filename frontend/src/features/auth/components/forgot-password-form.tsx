"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthOptions } from "@/features/account/api";
import { ApiError, errorMessage } from "@/lib/api-client";
import { useHydrated } from "@/lib/use-hydrated";
import { confirmPasswordReset, isTwoFactorChallenge, requestPasswordReset } from "../api";
import { TwoFactorStep } from "./two-factor-step";

/**
 * بازیابی رمز در دو قدم: ایمیل ← کد ۶ رقمی و رمز تازه. پس از موفقیت کاربر مستقیم وارد می‌شود.
 */
export function ForgotPasswordForm() {
  // تا آماده شدن صفحه قفل است؛ انتخاب زودهنگام گم نمی‌شود و رمز هرگز در آدرس صفحه نمی‌رود
  const hydrated = useHydrated();
  const router = useRouter();
  const options = useAuthOptions();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  // رمز عوض شد ولی حساب ورود دومرحله‌ای دارد: نشست فقط پس از کد اپ
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
      const result = await requestPasswordReset(email);
      setInfo(result.detail);
      setStep("code");
    });

  const reset = () =>
    run(async () => {
      const result = await confirmPasswordReset({ email, code, newPassword: password });
      if (isTwoFactorChallenge(result)) {
        setChallenge(result.challenge);
        return;
      }
      router.push("/dashboard");
    });

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">بازیابی رمز عبور</CardTitle>
        <CardDescription>
          {step === "email"
            ? "ایمیل حساب‌تان را وارد کنید تا کد بازیابی برایتان فرستاده شود."
            : "کد ۶ رقمی را وارد کنید و رمز تازه بگذارید."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {options.isLoading ? (
          <Skeleton className="h-32" />
        ) : !options.data?.passwordReset ? (
          <div className="flex flex-col gap-4 text-center text-sm">
            <p className="text-muted-foreground">
              بازیابی خودکار رمز هنوز فعال نشده است. برای بازیابی با پشتیبانی تراشینو تماس بگیرید.
            </p>
            <Link href="/login" className="text-primary hover:underline">
              بازگشت به ورود
            </Link>
          </div>
        ) : challenge ? (
          <TwoFactorStep
            challenge={challenge}
            notice="رمز تازه ذخیره شد. برای ورود، کد اپ Authenticator را هم وارد کنید."
            onDone={() => router.push("/dashboard")}
            onCancel={() => router.push("/login")}
          />
        ) : (
          <form
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              void (step === "email" ? sendCode() : reset());
            }}
          >
            <fieldset disabled={!hydrated} className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">ایمیل</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  required
                  value={email}
                  disabled={step === "code"}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <FieldError message={fieldErrors.email} />
              </div>

              {step === "code" && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="code">کد بازیابی</Label>
                    <Input
                      id="code"
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
                    <Label htmlFor="new-password">رمز جدید</Label>
                    <Input
                      id="new-password"
                      type="password"
                      dir="ltr"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">حداقل ۸ کاراکتر.</p>
                    <FieldError message={fieldErrors.newPassword} />
                  </div>
                </>
              )}

              {info && (
                <p role="status" className="text-sm text-muted-foreground">
                  {info}
                </p>
              )}
              {error && Object.keys(fieldErrors).length === 0 && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={pending}>
                {pending
                  ? "لطفاً صبر کنید..."
                  : step === "email"
                    ? "ارسال کد بازیابی"
                    : "ذخیره‌ی رمز تازه و ورود"}
              </Button>
              {step === "code" && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => void sendCode()}
                >
                  ارسال دوباره‌ی کد
                </Button>
              )}
              <p className="text-center text-sm text-muted-foreground">
                رمز را به یاد آوردید؟{" "}
                <Link href="/login" className="text-primary hover:underline">
                  ورود
                </Link>
              </p>
            </fieldset>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
