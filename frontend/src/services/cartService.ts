import { getGuestCart } from "../utils/guestCart";

const BASE_URL = "http://localhost:8080";

export async function mergeGuestCart(accessToken: string) {
    const items = getGuestCart();

    if (items.length === 0) {
        return null;
    }

    const response = await fetch(`${BASE_URL}/api/cart/merge`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ items })
    });

    if (!response.ok) {
        throw new Error(
            `Merge cart failed: ${response.status}`
        );
    }

    return response.json();
}