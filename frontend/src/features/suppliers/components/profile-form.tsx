"use client";

import { useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api-client";
import { CAPABILITIES, CITIES, type CapabilityValue } from "@/lib/constants";
import { useUpdateMySupplier } from "../hooks";
import {
  initialState,
  mapRowErrors,
  newKey,
  toInput,
  type FormState,
} from "../profile-input";
import type { MySupplier } from "../types";

const CITY_OPTIONS = CITIES.filter((city) => city !== "سایر");

export function ProfileForm({ supplier }: { supplier: MySupplier }) {
  const update = useUpdateMySupplier();
  const [form, setForm] = useState<FormState>(() => initialState(supplier));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const disabled = !supplier.canEdit;
  const nameLocked = supplier.verified;

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setSaved(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleCapability(value: CapabilityValue) {
    set(
      "capabilities",
      form.capabilities.includes(value)
        ? form.capabilities.filter((c) => c !== value)
        : [...form.capabilities, value],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(null);
    const { input, errors, machineKeys, certificationKeys } = toInput(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("لطفاً موارد مشخص‌شده را اصلاح کنید.");
      return;
    }
    const wasListed = supplier.listed;
    try {
      const result = await update.mutateAsync(input);
      setForm(initialState(result));
      setSaved(
        result.listed && !wasListed
          ? "پروفایل ذخیره شد و حالا در فهرست قطعه‌سازها نمایش داده می‌شود."
          : "تغییرات ذخیره شد.",
      );
    } catch (err) {
      setError(errorMessage(err, "ذخیره انجام نشد. لطفاً دوباره تلاش کنید."));
      if (err instanceof ApiError) {
        setFieldErrors(mapRowErrors(err.fieldErrors, machineKeys, certificationKeys));
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>۱. اطلاعات شرکت</CardTitle>
        <CardDescription>
          این اطلاعات در پروفایل عمومی شما به کارفرماها نمایش داده می‌شود. فیلدهای ستاره‌دار لازم‌اند؛
          بقیه اختیاری‌اند ولی اعتماد کارفرما را بیشتر می‌کنند. شرکت شما وقتی در فهرست قطعه‌سازها
          نمایش داده می‌شود که شهر و حداقل یک خدمت ذخیره شده باشد.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate>
          <fieldset disabled={disabled} className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="companyName">نام شرکت / کارگاه *</Label>
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={(e) => set("companyName", e.target.value)}
                  disabled={disabled || nameLocked}
                  maxLength={200}
                  aria-describedby="companyName-hint"
                />
                <p id="companyName-hint" className="text-xs text-muted-foreground">
                  {nameLocked
                    ? "نام شرکت پس از تأیید هویت قفل شده است؛ برای تغییر با پشتیبانی تماس بگیرید."
                    : "همان نامی که در مدارک رسمی شرکت آمده است. پس از تأیید هویت قفل می‌شود."}
                </p>
                <FieldError message={fieldErrors.companyName} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="city">شهر *</Label>
                <Input
                  id="city"
                  list="profile-cities"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  placeholder="مثلاً اصفهان"
                  maxLength={100}
                />
                <datalist id="profile-cities">
                  {CITY_OPTIONS.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
                <FieldError message={fieldErrors.city} />
              </div>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">خدماتی که ارائه می‌دهید *</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CAPABILITIES.map((capability) => (
                  <label
                    key={capability.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={form.capabilities.includes(capability.value)}
                      onChange={() => toggleCapability(capability.value)}
                    />
                    {capability.label}
                  </label>
                ))}
              </div>
              <FieldError message={fieldErrors.capabilities ?? fieldErrors["capabilities.0"]} />
            </fieldset>

            <div className="flex flex-col gap-2">
              <Label htmlFor="description">معرفی کوتاه</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="تخصص، نوع قطعات، صنایعی که با آن‌ها کار می‌کنید..."
                maxLength={2000}
              />
              <FieldError message={fieldErrors.description} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                id="leadTimeDays"
                label="زمان معمول تحویل (روز) *"
                value={form.leadTimeDays}
                onChange={(v) => set("leadTimeDays", v)}
                error={fieldErrors.leadTimeDays}
                placeholder="۱۴"
              />
              <NumberField
                id="foundedYear"
                label="سال تأسیس (شمسی)"
                value={form.foundedYear}
                onChange={(v) => set("foundedYear", v)}
                error={fieldErrors.foundedYear}
                placeholder="۱۳۸۵"
              />
              <NumberField
                id="employeeCount"
                label="تعداد کارکنان"
                value={form.employeeCount}
                onChange={(v) => set("employeeCount", v)}
                error={fieldErrors.employeeCount}
              />
              <NumberField
                id="productionCapacityPerMonth"
                label="ظرفیت تولید در ماه (عدد قطعه)"
                value={form.productionCapacityPerMonth}
                onChange={(v) => set("productionCapacityPerMonth", v)}
                error={fieldErrors.productionCapacityPerMonth}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">تلفن تماس</Label>
                <Input
                  id="phone"
                  dir="ltr"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="021-12345678"
                  maxLength={50}
                />
                <FieldError message={fieldErrors.phone} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="website">وب‌سایت</Label>
                <Input
                  id="website"
                  dir="ltr"
                  inputMode="url"
                  value={form.website}
                  onChange={(e) => set("website", e.target.value)}
                  placeholder="example.ir"
                  maxLength={255}
                />
                <FieldError message={fieldErrors.website} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="address">نشانی کارگاه</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                maxLength={500}
              />
              <FieldError message={fieldErrors.address} />
            </div>

            <RowsSection
              title="ماشین‌آلات"
              addLabel="افزودن دستگاه"
              empty="هنوز دستگاهی ثبت نشده است."
              error={fieldErrors.machines}
              onAdd={() =>
                set("machines", [
                  ...form.machines,
                  { key: newKey(), name: "", model: "", count: "1" },
                ])
              }
            >
              {form.machines.map((row, index) => (
                <div key={row.key} className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label={`نام دستگاه ${index + 1}`}
                      placeholder="مثلاً تراش CNC"
                      value={row.name}
                      onChange={(e) =>
                        set(
                          "machines",
                          form.machines.map((m) =>
                            m.key === row.key ? { ...m, name: e.target.value } : m,
                          ),
                        )
                      }
                    />
                    <FieldError message={fieldErrors[`${row.key}.name`]} />
                  </div>
                  <Input
                    aria-label={`مدل دستگاه ${index + 1}`}
                    placeholder="مدل / سازنده"
                    value={row.model}
                    onChange={(e) =>
                      set(
                        "machines",
                        form.machines.map((m) =>
                          m.key === row.key ? { ...m, model: e.target.value } : m,
                        ),
                      )
                    }
                  />
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label={`تعداد دستگاه ${index + 1}`}
                      inputMode="numeric"
                      value={row.count}
                      onChange={(e) =>
                        set(
                          "machines",
                          form.machines.map((m) =>
                            m.key === row.key ? { ...m, count: e.target.value } : m,
                          ),
                        )
                      }
                    />
                    <FieldError message={fieldErrors[`${row.key}.count`]} />
                  </div>
                  <RemoveButton
                    label={`حذف دستگاه ${index + 1}`}
                    onClick={() =>
                      set(
                        "machines",
                        form.machines.filter((m) => m.key !== row.key),
                      )
                    }
                  />
                </div>
              ))}
            </RowsSection>

            <RowsSection
              title="گواهی‌نامه‌ها"
              addLabel="افزودن گواهی‌نامه"
              empty="هنوز گواهی‌نامه‌ای ثبت نشده است."
              error={fieldErrors.certifications}
              onAdd={() =>
                set("certifications", [
                  ...form.certifications,
                  { key: newKey(), title: "", issuer: "", validUntil: "" },
                ])
              }
            >
              {form.certifications.map((row, index) => (
                <div key={row.key} className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label={`عنوان گواهی‌نامه ${index + 1}`}
                      placeholder="مثلاً ISO 9001"
                      value={row.title}
                      onChange={(e) =>
                        set(
                          "certifications",
                          form.certifications.map((c) =>
                            c.key === row.key ? { ...c, title: e.target.value } : c,
                          ),
                        )
                      }
                    />
                    <FieldError message={fieldErrors[`${row.key}.title`]} />
                  </div>
                  <Input
                    aria-label={`صادرکننده‌ی گواهی‌نامه ${index + 1}`}
                    placeholder="صادرکننده"
                    value={row.issuer}
                    onChange={(e) =>
                      set(
                        "certifications",
                        form.certifications.map((c) =>
                          c.key === row.key ? { ...c, issuer: e.target.value } : c,
                        ),
                      )
                    }
                  />
                  <div className="flex flex-col gap-1">
                    <Input
                      type="date"
                      aria-label={`اعتبار گواهی‌نامه ${index + 1} تا`}
                      value={row.validUntil}
                      onChange={(e) =>
                        set(
                          "certifications",
                          form.certifications.map((c) =>
                            c.key === row.key ? { ...c, validUntil: e.target.value } : c,
                          ),
                        )
                      }
                    />
                    <FieldError message={fieldErrors[`${row.key}.validUntil`]} />
                  </div>
                  <RemoveButton
                    label={`حذف گواهی‌نامه ${index + 1}`}
                    onClick={() =>
                      set(
                        "certifications",
                        form.certifications.filter((c) => c.key !== row.key),
                      )
                    }
                  />
                </div>
              ))}
            </RowsSection>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {saved && (
              <p role="status" className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {saved}
              </p>
            )}

            {!disabled && (
              <Button type="submit" disabled={update.isPending} className="self-start">
                {update.isPending ? "در حال ذخیره..." : "ذخیره‌ی پروفایل"}
              </Button>
            )}
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={12}
      />
      <FieldError message={error} />
    </div>
  );
}

function RowsSection({
  title,
  addLabel,
  empty,
  error,
  onAdd,
  children,
}: {
  title: string;
  addLabel: string;
  empty: string;
  error?: string;
  onAdd: () => void;
  children: React.ReactNode[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden />
          {addLabel}
        </Button>
      </div>
      {children.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
      <FieldError message={error} />
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick}>
      <Trash2 className="h-4 w-4" aria-hidden />
    </Button>
  );
}
