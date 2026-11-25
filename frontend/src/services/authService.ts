import { api } from "./api";
import { mergeGuestCart } from "./cartService";
import { clearGuestCart } from "../utils/guestCart";
import { notify } from "../utils/notifications";
import { sessionScope } from './queryCache';

export type LoginRequest = {
  username: string;
  password: string;
};

export type RegisterRequest = LoginRequest & {
  email: string;
  fullName?: string;
  phoneNumber?: string;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
  user: UserInfoResponse;
};

export function register(body: RegisterRequest): Promise<UserInfoResponse> {
  return api<UserInfoResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function login(username: string, password: string) {
  const body: LoginRequest = { username, password };
  const data = await api<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  localStorage.setItem("accessToken", data.accessToken);
  window.dispatchEvent(new Event("auth-changed"));
  let cartSynced = true;
  try {
    await mergeGuestCart(data.accessToken);
    clearGuestCart();
  } catch {
    cartSynced = false;
  }
  return { ...data, cartSynced };
}

export type UserInfoResponse = {
  userID: number;
  username: string;
  email: string;
  fullName: string | null;
  phoneNumber: string | null;
  role: string;
  avatarUrl?: string; // Bổ sung ảnh đại diện nếu có từ API
};

export async function getCurrentUser(
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<UserInfoResponse | null> {
  const scope = sessionScope();
  const token = localStorage.getItem("accessToken");
  if (!token) return null;

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/auth/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const currentSession = scope === sessionScope() && localStorage.getItem("accessToken") === token;
      if (currentSession) {
        localStorage.removeItem("accessToken");
        window.dispatchEvent(new Event("auth-changed"));
        notify.sessionExpired();
      }
    }
    return null;
  }
  const data = await response.json() as UserInfoResponse;
  if (scope !== sessionScope()) throw new DOMException('Session changed', 'AbortError');
  return data;
}
