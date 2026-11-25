import { useState, useEffect } from "react";
import { getCart, type CartResponse } from "../services/cartService";

export default function useCart() {
    const [cart, setCart] = useState<CartResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);

    useEffect(() => {
        const fetchCart = async () => {
            setLoading(true);
            try {
                const cartData = await getCart();
                setCart(cartData);
            } catch (err) {
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        fetchCart();
    }, []);

    return { cart, loading, error };
}
