import { apiFetch } from "@/lib/api-client";
import { API_URL } from "@/lib/config";

export function deleteFile(id: string): Promise<void> {
  return apiFetch<void>(`/files/${id}`, { method: "DELETE" });
}

/**
 * لینک دانلود کوتاه‌عمر می‌گیرد (سرور دسترسی و NDA را بررسی و دانلود را ثبت می‌کند)
 * و مرورگر فایل را به‌صورت پیوست دانلود می‌کند؛ صفحه عوض نمی‌شود.
 */
export async function downloadFile(id: string): Promise<void> {
  const link = await apiFetch<{ url: string; expiresAt: string }>(`/files/${id}/link`, {
    method: "POST",
  });
  const anchor = document.createElement("a");
  anchor.href = link.url.startsWith("http") ? link.url : `${API_URL}${link.url}`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
