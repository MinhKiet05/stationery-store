import { getGuestCart } from "../utils/guestCart";
import { api, API_BASE } from "./api";

export type Cart = {
    items: {
        cartItemID: number;
        productTitle: string;
        variantTitle: string;
        quantity: number;
        lineTotal: number;
    }[];
    subtotal: number;
};

export function addCartItem(variantID: number, quantity: number) {
    return api<Cart>("/api/cart/items", {
        method: "POST",
        body: JSON.stringify({ variantID, quantity }),
    });
}

const BASE_URL = API_BASE;

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
