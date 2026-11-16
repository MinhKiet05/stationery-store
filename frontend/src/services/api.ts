export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const token = localStorage.getItem("accessToken");
  const isPublicAuth =
    path === "/api/auth/login" || path === "/api/auth/register";
  if (token && !isPublicAuth)
    headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(65000)])
      : AbortSignal.timeout(65000),
  });
  if (!response.ok) {
    if (
      response.status === 401 &&
      !isPublicAuth &&
      token &&
      localStorage.getItem("accessToken") === token
    ) {
      localStorage.removeItem("accessToken");
      window.dispatchEvent(new Event("auth-changed"));
    }
    throw new Error(
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
                  : path.startsWith("/api/orders/") && response.status === 409
                    ? "Trạng thái đơn hàng đã thay đổi hoặc đơn đã thanh toán nên không thể hủy. Vui lòng tải lại."
                    : "Không thể kết nối cửa hàng. Vui lòng thử lại.",
    );
  }
  return response.json() as Promise<T>;
}
