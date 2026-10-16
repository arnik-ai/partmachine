"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-client";
import { ROLES, roleLabel, type RoleValue } from "@/lib/constants";
import { faDate, faNumber } from "@/lib/utils";
import { ADMIN_PAGE_SIZE, useAdminUsers, useChangeUser, type UserAction } from "../api";
import type { AdminUser, AdminUserFilters } from "../types";
import { Pager } from "./admin-shell";

const SEARCH_DELAY_MS = 350;
const MANUALLY_VERIFIED: readonly string[] = ["agent", "qc"];

export function UsersTable() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AdminUserFilters>({});
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, error, refetch, isFetching } = useAdminUsers(filters, page);
  const change = useChangeUser();
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // جستجو با کمی تأخیر ارسال می‌شود تا با هر حرف یک درخواست نرود
  useEffect(() => {
    if (query === (filters.q ?? "")) return;
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, q: query || undefined }));
      setPage(0);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, filters.q]);

  async function run(user: AdminUser, action: UserAction, why = "") {
    setActionError(null);
    setBusyId(user.id);
    try {
      await change.mutateAsync({ id: user.id, action, reason: why });
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDeactivate() {
    if (deactivating && (await run(deactivating, "deactivate", reason))) setDeactivating(null);
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / ADMIN_PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_200px_160px]">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-9"
            aria-label="جستجوی کاربر"
            placeholder="نام، ایمیل یا نام سازمان..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select
          aria-label="نقش"
          value={filters.role ?? ""}
          onChange={(e) => {
            setFilters((prev) => ({ ...prev, role: (e.target.value || undefined) as RoleValue }));
            setPage(0);
          }}
        >
          <option value="">همه‌ی نقش‌ها</option>
          {ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
          <option value="admin">{roleLabel("admin")}</option>
        </Select>
        <Select
          aria-label="وضعیت حساب"
          value={filters.active === undefined ? "" : String(filters.active)}
          onChange={(e) => {
            const value = e.target.value;
            setFilters((prev) => ({ ...prev, active: value === "" ? undefined : value === "true" }));
            setPage(0);
          }}
        >
          <option value="">همه‌ی حساب‌ها</option>
          <option value="true">فعال</option>
          <option value="false">غیرفعال</option>
        </Select>
      </div>

      {actionError && !deactivating && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">کاربری پیدا نشد.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{faNumber(data.total)} کاربر</p>
          <Card style={{ opacity: isFetching ? 0.6 : 1 }}>
            <CardContent className="flex flex-col divide-y p-0">
              {data.items.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  busy={busyId === user.id}
                  onDeactivate={() => {
                    setReason("");
                    setActionError(null);
                    setDeactivating(user);
                  }}
                  onAction={(action) => void run(user, action)}
                />
              ))}
            </CardContent>
          </Card>
          <Pager
            page={page}
            hasMore={page + 1 < pages}
            onChange={setPage}
            label={`صفحه‌ی ${faNumber(page + 1)} از ${faNumber(pages)}`}
          />
        </>
      )}

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={confirmDeactivate}
        pending={change.isPending}
        error={actionError}
        destructive
        title="غیرفعال‌سازی حساب"
        confirmLabel="بله، غیرفعال کن"
        description={
          deactivating &&
          `دسترسی «${deactivating.fullName}» بلافاصله قطع می‌شود و تا فعال‌سازی دوباره نمی‌تواند وارد شود. داده‌های او و سازمانش باقی می‌ماند.`
        }
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="deactivate-reason">دلیل (اختیاری؛ در رویدادها ثبت می‌شود)</Label>
          <Textarea
            id="deactivate-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="min-h-16"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}

function UserRow({
  user,
  busy,
  onDeactivate,
  onAction,
}: {
  user: AdminUser;
  busy: boolean;
  onDeactivate: () => void;
  onAction: (action: UserAction) => void;
}) {
  const manual = MANUALLY_VERIFIED.includes(user.role);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {user.fullName}
          <Badge variant="secondary">{roleLabel(user.role)}</Badge>
          {user.orgRole === "owner" && user.role !== "admin" && (
            <Badge variant="outline">مدیر سازمان</Badge>
          )}
          {!user.isActive && <Badge variant="destructive">غیرفعال</Badge>}
          {manual && (
            <Badge variant={user.verified ? "success" : "warning"}>
              {user.verified ? "حساب تأییدشده" : "حساب تأییدنشده"}
            </Badge>
          )}
          {user.role === "supplier" && (
            <Badge variant={user.supplierVerified ? "success" : "warning"}>
              {user.supplierVerified ? "شرکت تأییدشده" : "شرکت تأییدنشده"}
            </Badge>
          )}
        </span>
        <span className="text-xs text-muted-foreground" dir="ltr">
          {user.email}
        </span>
        <span className="text-xs text-muted-foreground">
          {user.organizationName} — عضو از {faDate(user.createdAt)}
        </span>
        {user.role === "qc" && (
          <span className="text-xs text-muted-foreground">
            {user.orgRole !== "owner"
              ? "آزمایشگاه با تأیید حساب مدیرش تأیید می‌شود، نه حساب اعضا."
              : user.verified
                ? "این آزمایشگاه در فهرست انتخاب کارفرماها برای بازرسی کیفیت است."
                : "با تأیید این حساب، آزمایشگاه در فهرست انتخاب کارفرماها برای بازرسی کیفیت قرار می‌گیرد."}
          </span>
        )}
      </div>
      {user.role !== "admin" && (
        <div className="flex flex-wrap gap-2">
          {manual && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onAction(user.verified ? "unverify" : "verify")}
              aria-label={`${user.verified ? "لغو تأیید" : "تأیید"} حساب ${user.fullName}`}
            >
              {user.verified ? "لغو تأیید" : "تأیید حساب"}
            </Button>
          )}
          {user.isActive ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onDeactivate}
              aria-label={`غیرفعال‌سازی ${user.fullName}`}
            >
              غیرفعال‌سازی
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onAction("activate")}
              aria-label={`فعال‌سازی ${user.fullName}`}
            >
              فعال‌سازی
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
