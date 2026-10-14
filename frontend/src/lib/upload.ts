/**
 * آپلود فایل با XMLHttpRequest تا پیشرفت نمایش داده شود (fetch پیشرفت آپلود ندارد).
 * بدنه‌ی درخواست خود فایل است؛ سرور نوع واقعی را از روی محتوا بررسی می‌کند.
 */

import {
  NetworkError,
  currentAccessToken,
  refreshAccessToken,
  toApiError,
} from "./api-client";
import { API_URL } from "./config";

export type FilePurpose =
  | "rfq_attachment"
  | "verification_document"
  | "portfolio_image"
  | "order_document";

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  kind: "pdf" | "cad" | "drawing" | "image";
  purpose: FilePurpose;
  createdAt: string;
}

export interface UploadHandle {
  promise: Promise<UploadedFile>;
  abort: () => void;
}

export class UploadAborted extends Error {
  constructor() {
    super("upload aborted");
    this.name = "UploadAborted";
  }
}

interface RawResponse {
  status: number;
  body: string;
}

export function uploadFile(
  file: File,
  purpose: FilePurpose,
  onProgress: (fraction: number) => void,
): UploadHandle {
  let current: XMLHttpRequest | null = null;
  let aborted = false;

  const attempt = (token: string | null) =>
    new Promise<RawResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      current = xhr;
      const params = new URLSearchParams({ purpose, name: file.name });
      xhr.open("POST", `${API_URL}/files?${params.toString()}`);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => reject(new NetworkError());
      xhr.onabort = () => reject(new UploadAborted());
      xhr.send(file);
    });

  const promise = (async () => {
    let response = await attempt(currentAccessToken());
    if (response.status === 401 && !aborted) {
      const fresh = await refreshAccessToken();
      if (fresh) response = await attempt(fresh);
    }
    if (response.status >= 200 && response.status < 300) {
      return JSON.parse(response.body) as UploadedFile;
    }
    throw await toApiError(new Response(response.body, { status: response.status }));
  })();

  return {
    promise,
    abort: () => {
      aborted = true;
      current?.abort();
    },
  };
}
