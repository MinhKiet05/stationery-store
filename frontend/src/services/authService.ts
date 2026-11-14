import { api } from "./api";
import { mergeGuestCart } from "./cartService";
import { clearGuestCart } from "../utils/guestCart";

export async function login(username: string, password: string) {
  const data = await api<{ accessToken: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
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
  return { cartSynced };
}

export type UserInfoResponse = {
  userID: number;
  username: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: string;
  avatarUrl?: string; // Bổ sung ảnh đại diện nếu có từ API
};

export async function getCurrentUser(
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<UserInfoResponse | null> {
  const token = localStorage.getItem("accessToken");
  if (!token) return null;

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/auth/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("accessToken");
    }
    return null;
  }
  return response.json() as Promise<UserInfoResponse>;
}
