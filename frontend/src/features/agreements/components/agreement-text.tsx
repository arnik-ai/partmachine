"use client";

import { ShieldAlert } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAgreement } from "../api";
import type { Term } from "../terms";

/** متن نسخه‌دار یک توافق، همان‌طور که کاربران در سامانه می‌پذیرند؛ مرجع متن سرور است. */
export function AgreementBlock({
  agreementKey,
  note,
}: {
  agreementKey: string;
  note: string;
}) {
  const query = useAgreement(agreementKey);

  if (query.isLoading) return <Skeleton className="h-40" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        title="متن این بخش بارگذاری نشد"
      />
    );
  }

  const agreement = query.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{agreement.title}</CardTitle>
        <CardDescription>
          نسخه‌ی {agreement.version} — {note}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2.5">
          {agreement.items.map((term: Term) => (
            <li key={term.id} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                aria-hidden
              />
              <span>
                {term.critical && (
                  <span className="ml-1 inline-flex translate-y-0.5 items-center gap-0.5 rounded bg-gold-soft px-1.5 py-0.5 text-[11px] font-bold text-gold">
                    <ShieldAlert className="h-3 w-3" aria-hidden />
                    بند حیاتی
                  </span>
                )}
                {term.text}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * یادآوری بازبینی حقوقی.
 *
 * متن حقوقی نهایی را وکیل می‌نویسد (تصمیم باز مالک). تا آن زمان این صفحه‌ها همان بندهایی را
 * نشان می‌دهند که واقعاً در سامانه پذیرفته می‌شوند، به‌علاوه‌ی شرح کارکرد سامانه.
 */
export function LegalReviewNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed">{children}</p>
  );
}
