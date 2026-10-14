"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, Smartphone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError, errorMessage } from "@/lib/api-client";
import { roleLabel } from "@/lib/constants";
import { requestPhoneCode, useAuthOptions, verifyPhone } from "../api";

/** «+989121234567» ⇒ «۰۹۱۲ ۱۲۳ ۴۵۶۷» برای نمایش */
function displayPhone(phone: string): string {
  const local = `0${phone.slice(3)}`;
  const grouped = `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  return grouped.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function AccountView() {
  const user = useAuthStore((s) => s.user);
  const options = useAuthOptions().data;
  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">حساب کاربری</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-primary" aria-hidden />
            اطلاعات حساب
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Item label="نام">{user.fullName}</Item>
            <Item label="ایمیل">
              <span dir="ltr">{user.email}</span>
            </Item>
            <Item label="نقش">{roleLabel(user.role)}</Item>
            {user.companyName && <Item label="سازمان">{user.companyName}</Item>}
          </dl>
        </CardContent>
      </Card>

      <ChangePasswordCard />
      {user.role !== "admin" && (
        <PhoneCard phone={user.phone ?? null} enabled={options?.phoneVerification ?? false} />
      )}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (next !== repeat) {
      setFieldErrors({ repeat: "تکرار رمز با رمز جدید یکی نیست." });
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setRepeat("");
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "تغییر رمز انجام نشد. لطفاً دوباره تلاش کنید."));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" aria-hidden />
          تغییر رمز عبور
        </CardTitle>
        <CardDescription>
          پس از تغییر رمز، همه‌ی دستگاه‌های دیگر از حساب شما خارج می‌شوند؛ این مرورگر وارد می‌ماند.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">رمز فعلی</Label>
            <Input
              id="current-password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <FieldError message={fieldErrors.currentPassword} />
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
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">حداقل ۸ کاراکتر.</p>
            <FieldError message={fieldErrors.newPassword} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="repeat-password">تکرار رمز جدید</Label>
            <Input
              id="repeat-password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              required
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
            <FieldError message={fieldErrors.repeat} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {done && (
            <p role="status" className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              رمز عوض شد و دستگاه‌های دیگر از حساب خارج شدند.
            </p>
          )}
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "در حال ذخیره..." : "تغییر رمز"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PhoneCard({ phone, enabled }: { phone: string | null; enabled: boolean }) {
  const [editing, setEditing] = useState(phone === null);
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      const result = await requestPhoneCode(number);
      setCodeSent(true);
      setCode("");
      setInfo(result.detail);
    });

  const confirm = () =>
    run(async () => {
      await verifyPhone(number, code);
      setEditing(false);
      setCodeSent(false);
      setInfo(null);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" aria-hidden />
          شماره‌ی موبایل
        </CardTitle>
        <CardDescription>
          شماره‌ی تأییدشده برای پیگیری سفارش‌ها و پیام‌های مهم استفاده می‌شود و عمومی نیست.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {phone && !editing && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              <span dir="ltr">{displayPhone(phone)}</span>
              <span className="text-muted-foreground">تأییدشده</span>
            </span>
            {enabled && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                تغییر شماره
              </Button>
            )}
          </div>
        )}

        {editing && !enabled && (
          <p className="text-sm text-muted-foreground">
            تأیید شماره با پیامک به‌زودی فعال می‌شود.
          </p>
        )}

        {editing && enabled && (
          <form
            className="flex max-w-md flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void (codeSent ? confirm() : sendCode());
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">شماره‌ی موبایل</Label>
              <Input
                id="phone"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0912 123 4567"
                required
                value={number}
                disabled={codeSent}
                onChange={(e) => setNumber(e.target.value)}
              />
              <FieldError message={fieldErrors.phone} />
            </div>
            {codeSent && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone-code">کد ۶ رقمی پیامک‌شده</Label>
                <Input
                  id="phone-code"
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
            )}
            {info && (
              <p role="status" className="text-sm text-muted-foreground">
                {info}
              </p>
            )}
            {error && !fieldErrors.phone && !fieldErrors.code && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "لطفاً صبر کنید..." : codeSent ? "تأیید شماره" : "ارسال کد"}
              </Button>
              {codeSent && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setCodeSent(false);
                    setInfo(null);
                  }}
                >
                  ویرایش شماره
                </Button>
              )}
              {phone && (
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  انصراف
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
