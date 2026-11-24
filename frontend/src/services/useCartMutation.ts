import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { queryKeys, sessionScope } from './queryCache';
import useSessionScope from './useSessionScope';
import { addCartItem, type Cart } from './cartService';
import type { Variant } from './productService';
// A cart response represents the whole cart: serialize all writes, including different rows.
const locks = new Set<string>();
type Change = { kind: 'add'; variant: Variant; quantity: number; productTitle: string } |
  { kind: 'quantity'; itemID: number; quantity: number } | { kind: 'remove'; itemID: number };
export function useCartMutation() {
  const scope = useSessionScope(), client = useQueryClient(), key = queryKeys.private('cart', {}, scope);
  return useMutation({
    mutationKey: ['cart-write', scope],
    mutationFn: (change: Change) => change.kind === 'add' ? addCartItem(change.variant.variantID, change.quantity) :
      api<Cart>(`/api/cart/items/${change.itemID}`, { method: change.kind === 'remove' ? 'DELETE' : 'PUT',
        ...(change.kind === 'quantity' ? { body: JSON.stringify({ quantity: change.quantity }) } : {}) }),
    onMutate: async (change: Change) => {
      if (scope !== sessionScope() || locks.has(scope)) throw new Error('Giỏ hàng đang cập nhật. Vui lòng chờ.');
      locks.add(scope);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Cart>(key);
      if (previous && scope === sessionScope()) {
        const items = previous.items.map(item => ({ ...item }));
        if (change.kind === 'add') {
          const existing = items.find(item => item.variantID === change.variant.variantID);
          if (existing) { existing.quantity += change.quantity; existing.lineTotal = existing.quantity * change.variant.price; }
          else items.push({ cartItemID: -change.variant.variantID, variantID: change.variant.variantID, productTitle: change.productTitle,
            variantTitle: change.variant.title, quantity: change.quantity, lineTotal: change.quantity * change.variant.price });
        } else {
          const index = items.findIndex(item => item.cartItemID === change.itemID);
          if (index >= 0 && change.kind === 'remove') items.splice(index, 1);
          else if (index >= 0 && change.kind === 'quantity') {
            const item = items[index]; item.lineTotal = item.lineTotal / item.quantity * change.quantity; item.quantity = change.quantity;
          }
        }
        client.setQueryData<Cart>(key, { items, subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0) });
      }
      return { previous, scope };
    },
    onSuccess: (data, _change, context) => { if (context?.scope === sessionScope()) client.setQueryData(key, data); },
    onError: (_error, _change, context) => {
      if (context?.scope === sessionScope() && context.previous) client.setQueryData(key, context.previous);
    },
    onSettled: async (_data, _error, _change, context) => {
      if (!context) return; // A rejected duplicate never releases someone else's lock.
      try { if (context.scope === sessionScope()) await client.invalidateQueries({ queryKey: key }); }
      finally { locks.delete(context.scope); }
    },
  });
}
