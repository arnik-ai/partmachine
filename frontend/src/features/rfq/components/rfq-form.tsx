"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { CAPABILITIES, CITIES, MATERIALS } from "@/lib/constants";
import type { CapabilityValue } from "@/lib/constants";
import { BUYER_ORDER_TERMS } from "@/features/agreements/terms";
import {
  TermsChecklist,
  allTermsAccepted,
} from "@/features/agreements/components/terms-checklist";
import { useCreateRfq } from "../hooks";
import type { RfqFile } from "../types";
import { RfqFileUpload } from "./file-upload";

export function RfqForm() {
  const router = useRouter();
  const createRfq = useCreateRfq();
  const [files, setFiles] = useState<RfqFile[]>([]);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const termsOk = allTermsAccepted(BUYER_ORDER_TERMS, accepted);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    try {
      await createRfq.mutateAsync({
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        capability: String(form.get("capability")) as CapabilityValue,
        material: String(form.get("material") ?? ""),
        quantity: Number(form.get("quantity") ?? 0),
        deliveryCity: String(form.get("deliveryCity") ?? ""),
        deadline: String(form.get("deadline") ?? ""),
        files,
      });
      router.push("/rfqs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ثبت درخواست");
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
              placeholder="مثلاً: ساخت ۵۰۰ عدد فلنج استیل طبق نقشه"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">شرح فنی</Label>
            <Textarea
              id="description"
              name="description"
              required
              placeholder="تلرانس‌ها، استاندارد، پرداخت سطح، بسته‌بندی و سایر الزامات..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="capability">نوع خدمت تولیدی</Label>
              <Select id="capability" name="capability" required>
                {CAPABILITIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="material">متریال</Label>
              <Select id="material" name="material" required>
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
              />
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
              <Label htmlFor="deadline">مهلت تحویل</Label>
              <Input id="deadline" name="deadline" type="date" required />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>فایل‌های فنی (نقشه، CAD، PDF)</Label>
            <RfqFileUpload files={files} onChange={setFiles} />
          </div>

          <TermsChecklist
            title="قوانین و تعهدات کارفرما"
            terms={BUYER_ORDER_TERMS}
            accepted={accepted}
            onChange={setAccepted}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

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
              disabled={createRfq.isPending || !termsOk}
              title={!termsOk ? "ابتدا همه‌ی قوانین را تیک بزنید" : undefined}
            >
              {createRfq.isPending ? "در حال ثبت..." : "انتشار درخواست"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
