"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthOptions } from "@/features/account/api";
import { ApiError, errorMessage } from "@/lib/api-client";
import { useHydrated } from "@/lib/use-hydrated";
import { DEMO_MODE } from "@/lib/config";
import { isTwoFactorChallenge, login, startDemoSession } from "../api";
import { safeNextPath } from "../next-path";
import { TwoFactorStep } from "./two-factor-step";

export function LoginForm() {
  // تا آماده شدن صفحه قفل است؛ انتخاب زودهنگام گم نمی‌شود و رمز هرگز در آدرس صفحه نمی‌رود
  const hydrated = useHydrated();
  const router = useRouter();
  const canReset = useAuthOptions().data?.passwordReset ?? false;
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  // حسابی که ورود دومرحله‌ای دارد: پس از رمز، کد اپ
  const [challenge, setChallenge] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (DEMO_MODE) {
      // نسخه‌ی نمایشی: بدون سرور، فقط برای دیدن محیط
      startDemoSession({ email, fullName: "کاربر دمو", role: "buyer" });
      router.push("/dashboard");
      return;
    }

    setLoading(true);
    try {
      const result = await login({ email, password });
      if (isTwoFactorChallenge(result)) {
        setChallenge(result.challenge);
        return;
      }
      router.push(safeNextPath(window.location.search));
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">ورود به تراشینو</CardTitle>
        <CardDescription>به بازار صنعتی قطعه‌سازی خوش آمدید</CardDescription>
      </CardHeader>
      <CardContent>
        {challenge ? (
          <TwoFactorStep
            challenge={challenge}
            onDone={() => router.push(safeNextPath(window.location.search))}
            onCancel={() => setChallenge(null)}
          />
        ) : (
          <form onSubmit={handleSubmit} method="post">
            <fieldset disabled={!hydrated} className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">ایمیل</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  dir="ltr"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                />
                <FieldError message={fieldErrors.email} />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="password">رمز عبور</Label>
                  {canReset && (
                    <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                      رمز را فراموش کرده‌اید؟
                    </Link>
                  )}
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  dir="ltr"
                  required
                  autoComplete="current-password"
                />
                <FieldError message={fieldErrors.password} />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {DEMO_MODE && (
                <p className="text-sm text-warning">
                  این نسخه‌ی نمایشی است؛ هر ایمیل و رمزی پذیرفته می‌شود و چیزی ذخیره نمی‌شود.
                </p>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? "در حال ورود..." : "ورود"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                حساب ندارید؟{" "}
                <Link href="/register" className="text-primary hover:underline">
                  ثبت‌نام کنید
                </Link>
              </p>
            </fieldset>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
