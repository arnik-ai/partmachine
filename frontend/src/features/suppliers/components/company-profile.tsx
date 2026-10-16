"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/features/auth/store";
import { VerificationPanel } from "@/features/verification/components/verification-panel";
import { useMySupplier } from "../hooks";
import type { MySupplier } from "../types";
import { LogoUploader } from "./logo-uploader";
import { PortfolioManager } from "./portfolio-manager";
import { ProfileForm } from "./profile-form";

/** صفحه‌ی «پروفایل شرکت» قطعه‌ساز: اطلاعات، گالری و تأیید هویت در یک جا، به ترتیب قدم‌ها. */
export function CompanyProfile() {
  const role = useAuthStore((s) => s.user?.role);
  const isSupplier = role === "supplier";
  const { data: supplier, isLoading, isError, error, refetch } = useMySupplier(isSupplier);

  if (!isSupplier) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        این صفحه برای قطعه‌سازهاست. برای دیدن قطعه‌سازها به{" "}
        <Link href="/suppliers" className="underline">
          فهرست قطعه‌سازان
        </Link>{" "}
        بروید.
      </p>
    );
  }
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (isError || !supplier) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader supplier={supplier} />
      {/* key: پس از ذخیره با داده‌ی سرور از نو مقداردهی شود */}
      <ProfileForm key={supplier.id} supplier={supplier} />
      <PortfolioManager supplier={supplier} />
      <VerificationPanel supplier={supplier} />
    </div>
  );
}

function ProfileHeader({ supplier }: { supplier: MySupplier }) {
  const steps = [
    {
      done: supplier.listed,
      label: supplier.listed
        ? "اطلاعات شرکت کامل است و در فهرست قطعه‌سازها دیده می‌شوید"
        : "شهر و حداقل یک خدمت را وارد و ذخیره کنید تا در فهرست قطعه‌سازها دیده شوید",
    },
    {
      done: supplier.verified,
      label: supplier.verified ? "شرکت شما تأییدشده است" : "مدارک را برای تأیید هویت بفرستید",
    },
  ];
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 text-card-foreground">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold">پروفایل شرکت</h1>
          <p className="text-sm text-muted-foreground">{supplier.companyName}</p>
        </div>
        {supplier.listed && (
          <Link
            href={`/suppliers/${supplier.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            مشاهده‌ی پروفایل عمومی
          </Link>
        )}
      </div>
      <LogoUploader supplier={supplier} />
      <ul className="flex flex-col gap-2 text-sm">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2">
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 text-success" aria-label="انجام شد" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" aria-label="انجام نشده" />
            )}
            {step.label}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        {supplier.canEdit
          ? "این صفحه را فقط شما به‌عنوان مدیر سازمان ویرایش می‌کنید؛ همکاران دعوت‌شده آن را فقط می‌بینند."
          : "فقط مدیر سازمان می‌تواند پروفایل شرکت را ویرایش کند؛ شما آن را می‌بینید."}
      </p>
    </div>
  );
}
