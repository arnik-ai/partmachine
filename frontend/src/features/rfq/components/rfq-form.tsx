"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { JalaliDateInput } from "@/components/ui/jalali-date-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError, errorMessage } from "@/lib/api-client";
import { DEMO_MODE } from "@/lib/config";
import { useHydrated } from "@/lib/use-hydrated";
import { CAPABILITIES, CITIES, MATERIALS } from "@/lib/constants";
import type { CapabilityValue } from "@/lib/constants";
import { acceptanceOf, useAgreement } from "@/features/agreements/api";
import { AgreementChecklist } from "@/features/agreements/components/agreement-checklist";
import { allTermsAccepted } from "@/features/agreements/components/terms-checklist";
import { useCreateRfq } from "../hooks";
import { RfqFileUpload, type UploadState } from "./file-upload";

/** تاریخ امروز به وقت محلی مرورگر، به قالب YYYY-MM-DD */
function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function RfqForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const createRfq = useCreateRfq();
  const agreement = useAgreement("buyer_order").data;
  const [uploads, setUploads] = useState<UploadState>({
    fileIds: [],
    busy: false,
    failed: false,
  });
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // کمینه‌ی تاریخ مهلت = امروز به وقت مرورگر؛ بعد از hydration محاسبه می‌شود تا با HTML سرور یکی بماند
  const hydrated = useHydrated();
  const today = hydrated ? localToday() : undefined;

  // فیلدهای مؤثر بر برآورد قیمت — کنترل‌شده تا برآورد زنده به‌روز شود
  const [capability, setCapability] = useState<CapabilityValue>(
    CAPABILITIES[0].value,
  );
  // پیکربندی صفحه‌ی اول فرم را با همان مشخصات پر می‌کند (?title=&material=&quantity=&spec=)
  const params = useSearchParams();
  const presetMaterial = params.get("material");
  const presetQuantity = Number(params.get("quantity"));
  const [material, setMaterial] = useState<string>(
    presetMaterial && (MATERIALS as readonly string[]).includes(presetMaterial) ? presetMaterial : MATERIALS[0],
  );
  const [quantity, setQuantity] = useState<number>(
    Number.isInteger(presetQuantity) && presetQuantity > 0 && presetQuantity <= 100_000 ? presetQuantity : 0,
  );
  const [deadline, setDeadline] = useState("");
  // اختیاری: اگر خالی بماند سرور ۷ روز بعد (و نه دیرتر از مهلت تحویل) را می‌گذارد
  const [quotesDue, setQuotesDue] = useState("");

  const terms = agreement?.items ?? [];
  const termsOk = terms.length > 0 && allTermsAccepted(terms, accepted);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    try {
      const rfq = await createRfq.mutateAsync({
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        capability,
        material,
        quantity,
        deliveryCity: String(form.get("deliveryCity") ?? ""),
        deadline,
        quotesDue: quotesDue || undefined,
        fileIds: uploads.fileIds,
        acceptedAgreements: acceptanceOf(agreement),
      });
      // موفقیت فقط پس از تأیید سرور نمایش داده می‌شود
      router.push(DEMO_MODE ? "/rfqs" : `/rfqs/${rfq.id}?created=1`);
    } catch (err) {
      setError(errorMessage(err, "ثبت درخواست انجام نشد. لطفاً دوباره تلاش کنید."));
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        if (err.fieldErrors.acceptedAgreements) {
          setAccepted({});
          void queryClient.invalidateQueries({ queryKey: ["agreements"] });
        }
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ثبت درخواست استعلام قیمت (RFQ)</CardTitle>
        <CardDescription>
          مشخصات قطعه و فایل‌های فنی را ثبت کنید تا قطعه‌سازانِ منطبق، قیمت
          پیشنهادی بدهند.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">عنوان درخواست</Label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={params.get("title")?.slice(0, 200) ?? undefined}
              placeholder="مثلاً: ساخت ۵۰۰ عدد فلنج استیل طبق نقشه"
            />
            <FieldError message={fieldErrors.title} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">شرح فنی</Label>
            <Textarea
              id="description"
              name="description"
              required
              defaultValue={params.get("spec")?.slice(0, 2000) ?? undefined}
              placeholder="تلرانس‌ها، استاندارد، پرداخت سطح، بسته‌بندی و سایر الزامات..."
            />
            <FieldError message={fieldErrors.description} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="capability">نوع خدمت تولیدی</Label>
              <Select
                id="capability"
                name="capability"
                required
                value={capability}
                onChange={(e) =>
                  setCapability(e.target.value as CapabilityValue)
                }
              >
                {CAPABILITIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="material">متریال</Label>
              <Select
                id="material"
                name="material"
                required
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              >
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="quantity">تعداد</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                required
                placeholder="500"
                value={quantity || ""}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
              <FieldError message={fieldErrors.quantity} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="deliveryCity">محل تحویل</Label>
              <Select id="deliveryCity" name="deliveryCity" required>
                {CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <JalaliDateInput
                id="deadline"
                name="deadline"
                label="مهلت تحویل"
                required
                min={today}
                value={deadline}
                onChange={setDeadline}
              />
              <FieldError message={fieldErrors.deadline} />
            </div>
            <div className="flex flex-col gap-2">
              <JalaliDateInput
                id="quotesDue"
                name="quotesDue"
                label="مهلت دریافت پیشنهاد (اختیاری)"
                min={today}
                max={deadline || undefined}
                value={quotesDue}
                onChange={setQuotesDue}
              />
              <p className="text-xs text-muted-foreground">
                تا این روز قطعه‌سازها می‌توانند قیمت بدهند. اگر خالی بماند، ۷ روز بعد در نظر گرفته می‌شود.
              </p>
              <FieldError message={fieldErrors.quotesDue} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>فایل‌های فنی (نقشه، CAD، PDF)</Label>
            <RfqFileUpload onChange={setUploads} />
            <p className="text-xs text-muted-foreground">
              فایل‌ها خصوصی‌اند: فقط سازمان شما و قطعه‌سازهایی که تعهد عدم افشا را بپذیرند
              می‌توانند آن‌ها را دانلود کنند.
            </p>
            <FieldError message={fieldErrors.fileIds} />
          </div>

          <AgreementChecklist
            agreementKey="buyer_order"
            accepted={accepted}
            onChange={setAccepted}
          />
          <FieldError message={fieldErrors.acceptedAgreements} />

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              انصراف
            </Button>
            <Button
              type="submit"
              disabled={createRfq.isPending || !termsOk || uploads.busy || uploads.failed}
              title={
                uploads.busy
                  ? "صبر کنید تا بارگذاری فایل‌ها تمام شود"
                  : uploads.failed
                    ? "فایل‌های ناموفق را حذف کنید یا دوباره بارگذاری کنید"
                    : !termsOk
                      ? "ابتدا همه‌ی قوانین را تیک بزنید"
                      : undefined
              }
            >
              {createRfq.isPending ? "در حال ثبت..." : "انتشار درخواست"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
