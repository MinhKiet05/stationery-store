import { api } from "./api";
import { mergeGuestCart } from "./cartService";
import { clearGuestCart } from "../utils/guestCart";

export async function login(username: string, password: string) {
  const data = await api<{ accessToken: string }>("/api/auth/login", {
    method: "POST", body: JSON.stringify({ username, password }),
  });
  localStorage.setItem("accessToken", data.accessToken);
  window.dispatchEvent(new Event("auth-changed"));
  let cartSynced = true;
  try {
    await mergeGuestCart(data.accessToken);
    clearGuestCart();
  } catch { cartSynced = false; }
  return { cartSynced };
}
