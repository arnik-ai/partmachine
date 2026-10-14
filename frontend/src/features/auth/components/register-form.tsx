"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/error-state";
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
import { ApiError, errorMessage } from "@/lib/api-client";
import { DEMO_MODE } from "@/lib/config";
import { ROLES, roleLabel } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { useInviteInfo } from "@/features/organization/api";
import { logout } from "../api";
import { useAuthStore } from "../store";
import { acceptanceOf, signupAgreementKey, useAgreement } from "@/features/agreements/api";
import { AgreementChecklist } from "@/features/agreements/components/agreement-checklist";
import { allTermsAccepted } from "@/features/agreements/components/terms-checklist";
import { register, startDemoSession } from "../api";
import type { RegisterInput } from "../types";

export function RegisterForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<RegisterInput["role"]>("buyer");
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  // ثبت‌نام با لینک دعوت: نقش و سازمان از دعوت می‌آید و کاربر فقط اطلاعات خودش را وارد می‌کند
  const inviteToken = useSearchParams().get("invite");
  const invite = useInviteInfo(inviteToken);
  const status = useAuthStore((s) => s.status);
  const invited = invite.data;
  const effectiveRole = invited?.role ?? role;

  const needsCompany = !invited && (role === "supplier" || role === "qc");
  const agreement = useAgreement(signupAgreementKey(effectiveRole)).data;
  const terms = agreement?.items ?? [];
  const termsOk = terms.length > 0 && allTermsAccepted(terms, accepted);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const input: RegisterInput = {
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      fullName: String(form.get("fullName") ?? "").trim(),
      role: effectiveRole,
      companyName: invited
        ? undefined
        : String(form.get("companyName") ?? "").trim() || undefined,
      acceptedAgreements: acceptanceOf(agreement),
      inviteToken: invited && inviteToken ? inviteToken : undefined,
    };

    if (DEMO_MODE) {
      startDemoSession(input);
      router.push("/dashboard");
      return;
    }

    setLoading(true);
    try {
      await register(input);
      router.push("/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        if (err.fieldErrors.acceptedAgreements) {
          // متن قوانین در سرور تغییر کرده است: متن تازه را بگیر و دوباره تأیید بخواه
          setAccepted({});
          void queryClient.invalidateQueries({ queryKey: ["agreements"] });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  if (inviteToken && status === "authenticated") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">پذیرفتن دعوت</CardTitle>
          <CardDescription>
            شما با حساب دیگری وارد شده‌اید. هر حساب فقط عضو یک سازمان است؛ برای ساخت حساب تازه با
            این دعوت، ابتدا خارج شوید.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={() => void logout().then(() => router.refresh())}>خروج از حساب فعلی</Button>
        </CardContent>
      </Card>
    );
  }

  if (inviteToken && invite.isLoading) {
    return <Skeleton className="h-96 w-full max-w-md" />;
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">ثبت‌نام در پارت‌ماشین</CardTitle>
        <CardDescription>
          {invited
            ? `${invited.inviterName} شما را به سازمان «${invited.organizationName}» دعوت کرده است.`
            : "نقش خود را انتخاب کنید و شروع کنید"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {inviteToken && invite.isError && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              این لینک دعوت معتبر نیست، استفاده شده یا منقضی شده است. می‌توانید به‌صورت عادی
              ثبت‌نام کنید یا از مدیر سازمان لینک تازه بخواهید.
            </p>
          )}
          <FieldError message={fieldErrors.inviteToken} />
          {invited ? (
            <p className="rounded-lg border p-3 text-sm">
              نقش شما در پارت‌ماشین: <strong>{roleLabel(invited.role)}</strong>
            </p>
          ) : (
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
              <FieldError message={fieldErrors.role} />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">نام و نام خانوادگی</Label>
            <Input id="fullName" name="fullName" required autoComplete="name" />
            <FieldError message={fieldErrors.fullName} />
          </div>
          {needsCompany && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="companyName">
                {role === "qc" ? "نام آزمایشگاه" : "نام شرکت / کارگاه"}
              </Label>
              <Input
                id="companyName"
                name="companyName"
                required
                autoComplete="organization"
              />
              <FieldError message={fieldErrors.companyName} />
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
              autoComplete="email"
              placeholder="you@company.com"
            />
            <FieldError message={fieldErrors.email} />
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
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">حداقل ۸ کاراکتر</p>
            <FieldError message={fieldErrors.password} />
          </div>
          <AgreementChecklist
            agreementKey={signupAgreementKey(effectiveRole)}
            accepted={accepted}
            onChange={setAccepted}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
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
