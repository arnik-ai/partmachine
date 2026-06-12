import { apiFetch, NetworkError } from "@/lib/api-client";
import type { AuthResponse, LoginInput, RegisterInput } from "./types";

export async function login(input: LoginInput): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: input,
  });
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: input,
  });
}

/**
 * سشن دموی محلی برای زمانی که بک‌اند هنوز بالا نیست.
 * فقط در صورت NetworkError استفاده می‌شود.
 */
export function buildDemoSession(
  input: Pick<RegisterInput, "email" | "fullName" | "role"> & {
    companyName?: string;
  },
): AuthResponse {
  return {
    user: {
      id: `demo-${input.email}`,
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      companyName: input.companyName,
    },
    tokens: { accessToken: "demo", refreshToken: "demo" },
  };
}

export function isBackendDown(error: unknown): boolean {
  return error instanceof NetworkError;
}
