import { api } from "./api";
import type { Product } from "../components/productCard/ProductCard";
export type RecommendationResponse = { products: Product[]; source: "PERSONALIZED" | "FALLBACK" };
export type ChatResponse = { reply: string; products: Product[]; source: "AI_RAG" | "CATALOG_FALLBACK" | "UNAVAILABLE" };
export function getRecommendations(signal: AbortSignal) {
  const path = localStorage.getItem("accessToken") ? "me" : "popular";
  return api<RecommendationResponse>(`/api/recommendations/${path}?limit=3`, { signal });
}
export function sendChat(message: string, signal: AbortSignal) {
  return api<ChatResponse>("/api/ai/chat", { method: "POST", body: JSON.stringify({ message }), signal });
}
export async function trackProductView(productID: number) {
  const token = localStorage.getItem("accessToken");
  if (!token) return;
  const key = `product-view:${token.slice(-16)}:${productID}`;
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 300000) return;
    sessionStorage.setItem(key, String(Date.now()));
    await api("/api/tracking/events", { method: "POST", body: JSON.stringify({ productID, eventType: "VIEW_PRODUCT" }) });
  } catch { sessionStorage.removeItem(key); }
}
