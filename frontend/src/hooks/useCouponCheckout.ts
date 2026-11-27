import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { checkoutQuoteKey, useCheckout } from './useCheckout';
import { previewCheckout } from '../services/checkoutService';
import type { Cart } from '../services/cartService';
import type { ShippingMethod } from '../services/orderService';
import useSessionScope from '../services/useSessionScope';
import { sessionScope } from '../services/queryCache';
import { errorName } from '../services/apiError';
import { notify, userMessage } from '../utils/notifications';

/** Draft text and a requested quote never imply that a coupon has been accepted. */
export function useCouponCheckout(items: Cart['items'], shippingMethod: ShippingMethod = 'STANDARD', initialCoupon = '', enabled = true) {
  const scope = useSessionScope(), client = useQueryClient();
  const [coupon, updateDraft] = useState(initialCoupon);
  const [requestedCode, setRequestedCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [couponError, setCouponError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const initialChecked = useRef(false);
  const context = JSON.stringify([scope, shippingMethod, items.map(item => [item.cartItemID, item.quantity, item.lineTotal])]);
  const { options, quote } = useCheckout({ items, shippingMethod, couponCode: requestedCode, enabled });
  useEffect(() => () => controller.current?.abort(), [context]);

  const applyCoupon = useCallback(async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code || !items.length || !enabled) return;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setChecking(true); setCouponError('');
    try {
      const result = await previewCheckout(shippingMethod, code, current.signal);
      if (current.signal.aborted || scope !== sessionScope()) return;
      if (result.couponCode !== code) throw new Error('Coupon was not confirmed');
      client.setQueryData(checkoutQuoteKey(items, code, shippingMethod, scope), result);
      setRequestedCode(code);
      notify.success('Áp dụng mã giảm giá thành công.');
    } catch (error) {
      if (current.signal.aborted || errorName(error) === 'AbortError' || scope !== sessionScope()) return;
      const message = userMessage(error, 'Chưa kiểm tra được mã giảm giá. Vui lòng thử lại.');
      setCouponError(message); notify.error(error, message);
    } finally { if (controller.current === current) setChecking(false); }
  }, [client, enabled, items, scope, shippingMethod]);

  useEffect(() => {
    if (!enabled || !initialCoupon || initialChecked.current || !items.length) return;
    const timer = window.setTimeout(() => { initialChecked.current = true; void applyCoupon(initialCoupon); }, 0);
    return () => window.clearTimeout(timer);
  }, [applyCoupon, enabled, initialCoupon, items.length]);

  function setCoupon(value: string) {
    controller.current?.abort(); controller.current = null;
    initialChecked.current = true;
    updateDraft(value); setChecking(false); setCouponError('');
  }

  function removeCoupon() {
    controller.current?.abort(); controller.current = null;
    setChecking(false); setRequestedCode(''); updateDraft(''); setCouponError('');
    notify.info('Đã xóa mã giảm giá.');
  }
  const data = !quote.isError && !quote.isFetching ? quote.data : undefined;
  const couponCode = data?.couponCode ?? '';
  return { options, quote, data, coupon, setCoupon, couponCode, couponError, checking,
    hasCoupon: !!(requestedCode || couponError), applyCoupon: () => applyCoupon(coupon), removeCoupon,
    ready: enabled && !!data && !checking && Number.isFinite(data.totalAmount) && Number.isFinite(data.shippingFee) };
}
