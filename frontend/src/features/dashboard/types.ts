export type StatKey =
  | "open_rfqs"
  | "quotes_received"
  | "open_market_rfqs"
  | "active_quotes"
  | "active_orders"
  | "completed_orders"
  | "inspections_waiting"
  | "inspections_ready"
  | "inspections_passed"
  | "pending_verifications"
  | "unverified_accounts"
  | "active_users";

export interface DashboardStat {
  key: StatKey;
  value: number;
}

/** آمار واقعی داشبورد برای نقش کاربر جاری (برچسب‌ها در فرانت) */
export interface Dashboard {
  stats: DashboardStat[];
}
