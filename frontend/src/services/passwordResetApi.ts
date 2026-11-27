import { API_BASE } from "./api";
import { userMessage } from "../utils/notifications";
import { errorCode, errorDetail, httpMessages } from './apiError';

export class PasswordResetError extends Error {
  readonly status: number;
  readonly retryAfter: number;
  constructor(message: string, status: number, retryAfter: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// One-shot public mutations: no bearer token, query cache, retries or optimistic update.
export async function passwordResetRequest(
  action: "forgot-password" | "reset-password",
  body: object,
) {
  const response = await fetch(`${API_BASE}/api/auth/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(65000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const seconds = Number(response.headers.get("Retry-After"));
    const fallback =
      response.status === 429
        ? "Bạn gửi hơi nhanh. Hãy thử lại sau một phút."
        : action === "reset-password" && response.status === 400
          ? "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."
          : httpMessages[response.status] ?? "Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.";
    throw new PasswordResetError(
      userMessage({ code: errorCode(data), detail: errorDetail(data) }, fallback),
      response.status,
      Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60,
    );
  }
  return data;
}
