"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { AppNotification, NotificationPage, UnreadCount } from "./types";

export const NOTIFICATIONS_PAGE_SIZE = 20;
/** شمارنده‌ی زنگوله هر دقیقه (و با برگشتن به برگه) تازه می‌شود */
const UNREAD_REFRESH_MS = 60_000;

export function listNotifications(
  page: number,
  unreadOnly: boolean,
  limit = NOTIFICATIONS_PAGE_SIZE,
): Promise<NotificationPage> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(page * limit),
  });
  if (unreadOnly) params.set("unread", "true");
  return apiFetch<NotificationPage>(`/notifications?${params.toString()}`);
}

export function getUnreadCount(): Promise<UnreadCount> {
  return apiFetch<UnreadCount>("/notifications/unread-count");
}

export function markRead(id: string): Promise<AppNotification> {
  return apiFetch<AppNotification>(`/notifications/${id}/read`, { method: "POST" });
}

export function markAllRead(): Promise<UnreadCount> {
  return apiFetch<UnreadCount>("/notifications/read-all", { method: "POST" });
}

export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: getUnreadCount,
    enabled,
    refetchInterval: UNREAD_REFRESH_MS,
    refetchOnWindowFocus: true,
  });
}

export function useNotifications(page: number, unreadOnly: boolean, limit?: number) {
  return useQuery({
    queryKey: ["notifications", "list", page, unreadOnly, limit],
    queryFn: () => listNotifications(page, unreadOnly, limit),
    placeholderData: keepPreviousData,
  });
}

/** «خوانده شد» برای یک اعلان یا همه؛ فهرست و شمارنده دوباره خوانده می‌شوند */
export function useMarkNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | "all"): Promise<void> => {
      if (id === "all") await markAllRead();
      else await markRead(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
