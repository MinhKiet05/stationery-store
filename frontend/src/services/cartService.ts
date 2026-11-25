import { getGuestCart } from "../utils/guestCart";
import { queryClient, queryKeys, sessionScope } from "./queryCache";
import { api } from "./api";

export type Cart = {
    items: {
        cartItemID: number;
        variantID?: number;
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

export async function mergeGuestCart(accessToken: string) {
    const items = getGuestCart();
    if (!items.length) return null;
    const scope = sessionScope();
    if (localStorage.getItem('accessToken') !== accessToken) throw new DOMException('Session changed', 'AbortError');
    const result = await api<Cart>('/api/cart/merge', { method: 'POST', body: JSON.stringify({ items }) });
    if (scope === sessionScope()) {
        const key = queryKeys.private('cart', {}, scope);
        await queryClient.cancelQueries({ queryKey: key });
        queryClient.setQueryData(key, result);
    }
    return result;
}
