"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-client";
import { cn, faDateTime, faNumber } from "@/lib/utils";
import { NOTIFICATIONS_PAGE_SIZE, useMarkNotifications, useNotifications } from "../api";
import type { AppNotification } from "../types";

/** فهرست اعلان‌های کاربر؛ با زدن هر اعلان، خوانده‌شده می‌شود و صفحه‌ی مربوط باز می‌شود */
export function NotificationsView() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading, isError, error, refetch, isFetching } = useNotifications(
    page,
    unreadOnly,
  );
  const mark = useMarkNotifications();
  const [actionError, setActionError] = useState<string | null>(null);
  const pages = data ? Math.max(1, Math.ceil(data.total / NOTIFICATIONS_PAGE_SIZE)) : 1;

  async function open(notification: AppNotification) {
    setActionError(null);
    try {
      if (!notification.readAt) await mark.mutateAsync(notification.id);
    } catch (err) {
      setActionError(errorMessage(err));
      return;
    }
    if (notification.link) router.push(notification.link);
  }

  async function readAll() {
    setActionError(null);
    try {
      await mark.mutateAsync("all");
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  function filter(next: boolean) {
    setUnreadOnly(next);
    setPage(0);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bell className="h-6 w-6" aria-hidden />
          اعلان‌ها
        </h1>
        {data && data.unread > 0 && (
          <Button variant="outline" size="sm" onClick={readAll} disabled={mark.isPending}>
            <CheckCheck className="h-4 w-4" aria-hidden />
            همه را خوانده‌شده کن
          </Button>
        )}
      </div>

      <div className="flex gap-2" role="group" aria-label="نمایش اعلان‌ها">
        <Button
          size="sm"
          variant={unreadOnly ? "outline" : "default"}
          aria-pressed={!unreadOnly}
          onClick={() => filter(false)}
        >
          همه
        </Button>
        <Button
          size="sm"
          variant={unreadOnly ? "default" : "outline"}
          aria-pressed={unreadOnly}
          onClick={() => filter(true)}
        >
          خوانده‌نشده{data && data.unread > 0 ? ` (${faNumber(data.unread)})` : ""}
        </Button>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} title="اعلان‌ها بارگذاری نشد" />
      ) : !data || data.items.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          {unreadOnly ? "اعلان خوانده‌نشده‌ای ندارید." : "هنوز اعلانی ندارید."}
        </p>
      ) : (
        <>
          <Card style={{ opacity: isFetching ? 0.7 : 1 }}>
            <CardContent className="flex flex-col divide-y p-0">
              {data.items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => open(notification)}
                  className={cn(
                    "flex items-start gap-3 p-4 text-right transition-colors hover:bg-muted/50",
                    !notification.readAt && "bg-gold-soft/30",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      notification.readAt ? "bg-transparent" : "bg-gold",
                    )}
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className={cn("text-sm", !notification.readAt && "font-semibold")}>
                      {notification.title}
                      {!notification.readAt && <span className="sr-only"> (خوانده‌نشده)</span>}
                    </span>
                    {notification.body && (
                      <span className="text-sm text-muted-foreground">{notification.body}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {faDateTime(notification.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                صفحه‌ی قبل
              </Button>
              <span>
                صفحه‌ی {faNumber(page + 1)} از {faNumber(pages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                صفحه‌ی بعد
              </Button>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        اعلان‌های خوانده‌شده پس از ۶ ماه پاک می‌شوند. تاریخچه‌ی کامل هر سفارش در صفحه‌ی همان سفارش
        می‌ماند.
      </p>
    </div>
  );
}
