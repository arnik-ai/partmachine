"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { faDigits } from "@/lib/jalali";
import { normalizeDigits } from "@/lib/money";
import { DEMO_OTP, signInWorker, useWorkers } from "../api";
import { isValidMobile } from "../rules";
import { Chip, LINK_BUTTON, SUB } from "./parts";

const onlyDigits = (value: string, length: number) =>
  normalizeDigits(value).replace(/\D/g, "").slice(0, length);

/**
 * ورود کارگر با موبایل و کد پیامکی، همان چیزی که بعد از اتصال سرویس پیامک واقعی می‌شود.
 * در نسخه‌ی نمونه پیامکی فرستاده نمی‌شود و کد روی صفحه نوشته شده است.
 */
export function WorkerLoginView() {
  const workers = useWorkers();
  const [mobile, setMobile] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const worker = workers.find((item) => item.mobile === mobile);

  if (!codeSent) {
    return (
      <Card className="grid w-full max-w-sm gap-4 p-5">
        <div>
          <h1 className="text-xl font-bold">ورود کارکنان</h1>
          <p className={SUB}>شماره موبایلی را بنویسید که مدیرعامل برای شما ثبت کرده است.</p>
        </div>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (worker) {
              setError(null);
              setCodeSent(true);
            } else {
              setError("این شماره در شرکت ثبت نشده است. از مدیرعامل بخواهید شما را اضافه کند.");
            }
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="worker-login-mobile">شماره موبایل</Label>
            <Input
              id="worker-login-mobile"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              value={faDigits(mobile)}
              onChange={(event) => {
                setError(null);
                setMobile(onlyDigits(event.target.value, 11));
              }}
            />
          </div>
          {error && (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={!isValidMobile(mobile)}>
            دریافت کد
          </Button>
        </form>
        <div className="grid gap-2 rounded-xl bg-muted p-3">
          <p className={SUB}>نسخه‌ی نمونه: روی نام یک کارگر بزنید تا شماره‌اش نوشته شود.</p>
          <div className="flex flex-wrap gap-2">
            {workers
              .filter((item) => item.mobile)
              .map((item) => (
                <Chip
                  key={item.id}
                  onClick={() => {
                    setError(null);
                    setMobile(item.mobile ?? "");
                  }}
                >
                  {item.name}
                </Chip>
              ))}
          </div>
        </div>
        <Link href="/production" className={LINK_BUTTON}>
          مدیرعامل هستید؟ ورود به پنل مدیرعامل
        </Link>
      </Card>
    );
  }

  return (
    <Card className="grid w-full max-w-sm gap-4 p-5">
      <div>
        <h1 className="text-xl font-bold">کد پیامک‌شده</h1>
        <p className={SUB}>کد ۶ رقمی فرستاده‌شده به {faDigits(mobile)} را بنویسید.</p>
      </div>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (code === DEMO_OTP && worker) signInWorker(worker.id);
          else setError("کد درست نیست.");
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor="worker-login-code">کد</Label>
          <Input
            id="worker-login-code"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            value={faDigits(code)}
            onChange={(event) => {
              setError(null);
              setCode(onlyDigits(event.target.value, DEMO_OTP.length));
            }}
          />
        </div>
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={code.length !== DEMO_OTP.length}>
          ورود
        </Button>
      </form>
      <p className="rounded-xl bg-muted p-3 text-[13px] text-muted-foreground">
        نسخه‌ی نمونه: پیامکی فرستاده نمی‌شود. کد {faDigits(DEMO_OTP)} را بنویسید.
      </p>
      <button
        type="button"
        className={LINK_BUTTON}
        onClick={() => {
          setError(null);
          setCode("");
          setCodeSent(false);
        }}
      >
        تغییر شماره
      </button>
    </Card>
  );
}
