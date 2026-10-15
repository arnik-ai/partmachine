"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { JalaliDateInput } from "@/components/ui/jalali-date-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { faDate, faDateTime, faNumber } from "@/lib/utils";
import { useAuditEvents } from "../api";
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTION_LABELS,
  type AuditEvent,
  type AuditFilters,
} from "../types";
import { Pager } from "./admin-shell";

const EMPTY: AuditFilters = {};

/** رویدادهای مهم کسب‌وکار و امنیت؛ فقط خواندنی. فیلترها با دکمه‌ی «اعمال» ارسال می‌شوند. */
export function AuditLog() {
  const [draft, setDraft] = useState<AuditFilters>(EMPTY);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY);
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, error, refetch, isFetching } = useAuditEvents(filters, page);

  function apply(next: AuditFilters) {
    setFilters(next);
    setPage(0);
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="grid gap-3 rounded-2xl bg-card p-4 text-card-foreground sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          apply({
            action: draft.action || undefined,
            actor: draft.actor?.trim() || undefined,
            since: draft.since || undefined,
            until: draft.until || undefined,
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-action">نوع رویداد</Label>
          <Select
            id="audit-action"
            value={draft.action ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value || undefined }))}
          >
            <option value="">همه</option>
            {AUDIT_ACTION_GROUPS.map((group) => (
              <option key={group.value} value={group.value}>
                {group.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-actor">ایمیل انجام‌دهنده</Label>
          <Input
            id="audit-actor"
            dir="ltr"
            type="email"
            value={draft.actor ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, actor: e.target.value }))}
          />
        </div>
        <JalaliDateInput
          id="audit-since"
          label="از تاریخ"
          summary={false}
          yearsAhead={0}
          max={draft.until || undefined}
          value={draft.since ?? ""}
          onChange={(since) => setDraft((d) => ({ ...d, since }))}
        />
        <JalaliDateInput
          id="audit-until"
          label="تا تاریخ"
          summary={false}
          yearsAhead={0}
          min={draft.since || undefined}
          value={draft.until ?? ""}
          onChange={(until) => setDraft((d) => ({ ...d, until }))}
        />
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1">
          <Button type="submit">اعمال فیلتر</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY);
              apply(EMPTY);
            }}
          >
            پاک کردن
          </Button>
        </div>
      </form>

      {isLoading ? (
        <Skeleton className="h-60" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <p className="py-8 text-center text-white/70">رویدادی پیدا نشد.</p>
      ) : (
        <>
          <Card style={{ opacity: isFetching ? 0.6 : 1 }}>
            <CardContent className="flex flex-col divide-y p-0">
              {data.items.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </CardContent>
          </Card>
          <Pager
            page={page}
            hasMore={data.hasMore}
            onChange={setPage}
            label={`صفحه‌ی ${faNumber(page + 1)}`}
          />
        </>
      )}
    </div>
  );
}

const ISO_DATE_OR_TIME = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;

/** تاریخ‌های ISO داخل جزئیات رویداد (حتی در مقدارهای تودرتو) شمسی نمایش داده می‌شوند */
function detailText(value: unknown): string {
  const shown = (v: unknown) =>
    typeof v === "string" && ISO_DATE_OR_TIME.test(v)
      ? v.length === 10
        ? faDate(v)
        : faDateTime(v)
      : v;
  const top = shown(value);
  return typeof top === "string" ? top : JSON.stringify(value, (_key, v: unknown) => shown(v));
}

function EventRow({ event }: { event: AuditEvent }) {
  const details = Object.entries(event.data);
  return (
    <div className="flex flex-col gap-1 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{AUDIT_ACTION_LABELS[event.action] ?? event.action}</span>
        <span className="text-xs text-muted-foreground">{faDateTime(event.createdAt)}</span>
      </div>
      <span className="text-xs text-muted-foreground">
        {event.actorName ? (
          <>
            {event.actorName} (<span dir="ltr">{event.actorEmail}</span>)
          </>
        ) : (
          "سیستم"
        )}
        {event.organizationName ? ` — ${event.organizationName}` : ""}
      </span>
      {details.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs" dir="ltr">
          {details.map(([key, value]) => (
            <div key={key} className="flex gap-1">
              <dt className="text-muted-foreground">{key}:</dt>
              <dd className="break-all" dir="auto">
                {detailText(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <span className="text-[11px] text-muted-foreground" dir="ltr">
        {event.action} · {event.entityType}
        {event.entityId ? ` ${event.entityId}` : ""}
        {event.requestId ? ` · req ${event.requestId}` : ""}
      </span>
    </div>
  );
}
