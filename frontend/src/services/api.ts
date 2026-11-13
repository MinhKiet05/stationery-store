export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const token = localStorage.getItem("accessToken");
  if (token && path !== "/api/auth/login") headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers,
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(65000)]) : AbortSignal.timeout(65000) });
  if (!response.ok) {
    if (response.status === 401 && token && localStorage.getItem("accessToken") === token) {
      localStorage.removeItem("accessToken");
      window.dispatchEvent(new Event("auth-changed"));
    }
    throw new Error(response.status === 429 ? "Bạn gửi hơi nhanh. Hãy thử lại sau một phút."
      : response.status === 401 ? (path === "/api/auth/login" ? "Tên đăng nhập hoặc mật khẩu không đúng." : "Vui lòng đăng nhập lại.")
      : "Không thể kết nối cửa hàng. Vui lòng thử lại.");
  }
  return response.json() as Promise<T>;
}
