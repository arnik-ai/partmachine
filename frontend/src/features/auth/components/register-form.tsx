"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROLES } from "@/lib/constants";
import { signupTermsForRole } from "@/features/agreements/terms";
import {
  TermsChecklist,
  allTermsAccepted,
} from "@/features/agreements/components/terms-checklist";
import { buildDemoSession, isBackendDown, register } from "../api";
import { useAuthStore } from "../store";
import type { RegisterInput } from "../types";

export function RegisterForm() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<RegisterInput["role"]>("buyer");
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  const needsCompany = role === "supplier" || role === "qc";
  const terms = signupTermsForRole(role);
  const termsOk = allTermsAccepted(terms, accepted);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const input: RegisterInput = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      fullName: String(form.get("fullName") ?? ""),
      role,
      companyName: String(form.get("companyName") ?? "") || undefined,
    };

    try {
      const { user, tokens } = await register(input);
      setSession(user, tokens);
      router.push("/dashboard");
    } catch (err) {
      if (isBackendDown(err)) {
        const demo = buildDemoSession(input);
        setSession(demo.user, demo.tokens, true);
        router.push("/dashboard");
      } else {
        setError(err instanceof Error ? err.message : "خطا در ثبت‌نام");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">ثبت‌نام در پارت‌ماشین</CardTitle>
        <CardDescription>نقش خود را انتخاب کنید و شروع کنید</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="role">نقش شما</Label>
            <Select
              id="role"
              name="role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as RegisterInput["role"]);
                // با تغییر نقش، قوانین عوض می‌شود و باید دوباره تیک بخورد
                setAccepted({});
              }}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">نام و نام خانوادگی</Label>
            <Input id="fullName" name="fullName" required />
          </div>
          {needsCompany && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="companyName">
                {role === "qc" ? "نام آزمایشگاه" : "نام شرکت / کارگاه"}
              </Label>
              <Input id="companyName" name="companyName" required />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">ایمیل</Label>
            <Input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              required
              placeholder="you@company.com"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">رمز عبور</Label>
            <Input
              id="password"
              name="password"
              type="password"
              dir="ltr"
              required
              minLength={8}
            />
          </div>
          <TermsChecklist
            title={
              role === "supplier"
                ? "تعهدات قطعه‌ساز (شامل عدم افشا)"
                : role === "qc"
                  ? "تعهدات آزمایشگاه کنترل کیفیت"
                  : role === "agent"
                    ? "تعهدات مأمور خرید"
                    : "قوانین پلتفرم"
            }
            terms={terms}
            accepted={accepted}
            onChange={setAccepted}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={loading || !termsOk}
            title={!termsOk ? "ابتدا همه‌ی قوانین را تیک بزنید" : undefined}
          >
            {loading ? "در حال ثبت‌نام..." : "ایجاد حساب"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            قبلاً ثبت‌نام کرده‌اید؟{" "}
            <Link href="/login" className="text-primary hover:underline">
              وارد شوید
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
