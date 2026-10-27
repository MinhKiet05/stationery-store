export interface GuestCartItem {
    variantID: number;
    quantity: number;
}

const CART_KEY = "stationery_guest_cart";

export function getGuestCart(): GuestCartItem[] {
    try {
        const data = localStorage.getItem(CART_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

export function saveGuestCart(items: GuestCartItem[]) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function addToGuestCart(
    variantID: number,
    quantity: number = 1
) {
    if (quantity <= 0) {
        throw new Error("Quantity must be positive");
    }

    const cart = getGuestCart();

    const existing = cart.find(
        item => item.variantID === variantID
    );

    if (existing) {
        existing.quantity += quantity;
    } else {
        cart.push({ variantID, quantity });
    }

    saveGuestCart(cart);
}

export function removeFromGuestCart(variantID: number) {
    const cart = getGuestCart().filter(
        item => item.variantID !== variantID
    );

    saveGuestCart(cart);
}

export function clearGuestCart() {
    localStorage.removeItem(CART_KEY);
}