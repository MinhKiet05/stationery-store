import { useQuery } from '@tanstack/react-query';
import { getCheckoutOptions, previewCheckout } from '../services/checkoutService';
import { queryKeys } from '../services/queryCache';
import useSessionScope from '../services/useSessionScope';
import type { Cart } from '../services/cartService';
import type { ShippingMethod } from '../services/orderService';
import type { SessionScope } from '../services/queryCache';

export const checkoutQuoteKey = (items: Cart['items'], couponCode: string, shippingMethod: ShippingMethod, scope: SessionScope) =>
  queryKeys.private('checkoutQuote', { shippingMethod, couponCode, cart: items.map(item => [item.cartItemID, item.quantity, item.lineTotal]) }, scope);

type CheckoutInput = {
  items: Cart['items'];
  couponCode: string;
  shippingMethod?: ShippingMethod;
  enabled?: boolean;
};

/** Share the same server quote between cart and checkout; changing a row creates a new cache key. */
export function useCheckout({ items, couponCode, shippingMethod = 'STANDARD', enabled = true }: CheckoutInput) {
  const scope = useSessionScope();
  const signedIn = !!localStorage.getItem('accessToken');
  const options = useQuery({
    queryKey: queryKeys.private('checkoutOptions', {}, scope),
    queryFn: ({ signal }) => getCheckoutOptions(signal),
    enabled: signedIn,
    staleTime: 0,
  });
  const quote = useQuery({
    queryKey: checkoutQuoteKey(items, couponCode, shippingMethod, scope),
    queryFn: ({ signal }) => previewCheckout(shippingMethod, couponCode, signal),
    enabled: signedIn && enabled && items.length > 0,
    staleTime: 15000,
    retry: false,
  });
  return { options, quote };
}
