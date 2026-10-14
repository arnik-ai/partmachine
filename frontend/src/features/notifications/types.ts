/** اعلان داخل سایت (نام «Notification» برای API مرورگر رزرو است) */
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** مسیر داخلی سایت؛ خالی یعنی بدون لینک */
  link: string;
  createdAt: string;
  readAt?: string | null;
}

export interface NotificationPage {
  items: AppNotification[];
  total: number;
  unread: number;
  limit: number;
  offset: number;
}

export interface UnreadCount {
  unread: number;
}
