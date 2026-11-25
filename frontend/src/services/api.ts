
import { notify, userMessage } from "../utils/notifications";
import { invalidateBusiness, sessionScope } from "./queryCache";
import { errorDetail } from './apiError';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly detail?: string;
  readonly notificationHandled: boolean;

  constructor(
    message: string,
    status: number,
    detail?: string,
    notificationHandled = false,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.notificationHandled = notificationHandled;
  }
}

export async function apiResponse(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const scope = sessionScope();
  const headers = new Headers(options.headers);

  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const token = localStorage.getItem("accessToken");

  const isPublicAuth =
    path === "/api/auth/login" ||
    path === "/api/auth/register";

  if (token && !isPublicAuth) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    signal: options.signal
      ? AbortSignal.any([
          options.signal,
          AbortSignal.timeout(65000),
        ])
      : AbortSignal.timeout(65000),
  });

  if (!response.ok) {
    if (
      response.status === 401 &&
      !isPublicAuth &&
      token &&
      scope === sessionScope() &&
      localStorage.getItem("accessToken") === token
    ) {
      localStorage.removeItem("accessToken");
      window.dispatchEvent(new Event("auth-changed"));
      notify.sessionExpired();
    }

    const fallback =
      response.status === 429
        ? "Bạn gửi hơi nhanh. Hãy thử lại sau một phút."
        : response.status === 401
          ? path === "/api/auth/login"
            ? "Tên đăng nhập hoặc mật khẩu không đúng."
            : "Vui lòng đăng nhập lại."
          : path === "/api/auth/register" && response.status === 409
            ? "Tên đăng nhập hoặc email đã tồn tại."
            : path === "/api/auth/register" && response.status === 400
              ? "Thông tin đăng ký không hợp lệ. Vui lòng kiểm tra lại."
              : path === "/api/users/me" && response.status === 409
                ? "Email này đã được sử dụng bởi tài khoản khác."
                : path === "/api/users/me" && response.status === 400
                  ? "Thông tin hồ sơ không hợp lệ. Vui lòng kiểm tra lại."
                  : path.startsWith("/api/orders/") &&
                      response.status === 409
                    ? "Trạng thái đơn hàng đã thay đổi. Vui lòng tải lại."
                    : "Không thể kết nối cửa hàng. Vui lòng thử lại.";

    const body: unknown = await response.json().catch(() => null);
    const detail = errorDetail(body);

    throw new ApiError(
      userMessage(body, fallback),
      response.status,
      detail,
      response.status === 401 &&
        !isPublicAuth &&
        Boolean(token),
    );
  }

  if (
    scope !== sessionScope() ||
    localStorage.getItem("accessToken") !== token
  ) {
    throw new DOMException("Session changed", "AbortError");
  }

  if (
    options.method &&
    options.method !== "GET" &&
    options.method !== "HEAD" &&
    !path.startsWith("/api/auth/") &&
    !path.endsWith("/preview")
  ) {
    invalidateBusiness(path, scope);
  }

  return response;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const scope = sessionScope();
  const response = await apiResponse(path, options);

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json()) as T;

  if (scope !== sessionScope()) {
    throw new DOMException("Session changed", "AbortError");
  }

  return data;
}
