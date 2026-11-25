import { BadgeCheck, Clock3, CreditCard, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CheckoutOptions, CheckoutQuote } from '../../services/checkoutService';
import type { PaymentMethod, ShippingMethod } from '../../services/orderService';
import SectionTitle from './CheckoutSection';
import { money } from './checkoutUtils';

const sectionClass = 'rounded-lg border border-[#eceff6] bg-white p-4 shadow-xs sm:p-6';

function MethodOption({ name, value, checked, disabled, onSelect, children }: {
  name: string; value: string; checked: boolean; disabled: boolean; onSelect: () => void; children: ReactNode;
}) {
  const appearance = checked ? 'border-orange-500 bg-orange-50/40 ring-1 ring-orange-500'
    : 'border-slate-100 bg-slate-50 hover:border-orange-200';
  return (
    <label className={`mt-3 flex items-center gap-3 rounded-lg border p-4 transition-colors ${appearance} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onSelect} className="accent-orange-500" />
      {children}
    </label>
  );
}

export function ShippingMethods({ options, quote, value, disabled, onChange, loading, failed, onRetry }: {
  options?: CheckoutOptions; quote?: CheckoutQuote; value: ShippingMethod; disabled: boolean;
  onChange: (value: ShippingMethod) => void; loading: boolean; failed: boolean; onRetry: () => void;
}) {
  return (
    <section className={sectionClass}>
      <SectionTitle icon={<Clock3 size={21} />} title="2. Phương thức vận chuyển">Chọn tốc độ giao hàng phù hợp với bạn</SectionTitle>
      {loading && <p role="status" className="text-sm text-slate-500">Đang tải phương thức vận chuyển…</p>}
      {failed && <p role="alert" className="text-sm text-red-600">Không tải được phương thức vận chuyển. <button type="button" onClick={onRetry} className="underline">Thử lại</button></p>}
      {options?.shipping.map(method => {
        // Show each option's actual price, including free standard shipping after the coupon.
        const free = method.code === 'STANDARD' && quote && quote.subTotal - quote.discountAmount >= options.freeShippingThreshold;
        return (
          <MethodOption key={method.code} name="shipping" value={method.code} checked={value === method.code} disabled={disabled} onSelect={() => onChange(method.code)}>
            <span className="flex-1">
              <strong className="block text-sm">{method.label}</strong>
              <small className="mt-1 block text-xs text-slate-500">{method.description}</small>
              {method.code === 'STANDARD' && <small className="mt-1 block text-xs text-emerald-600">Miễn phí từ {money(options.freeShippingThreshold)} sau giảm giá</small>}
            </span>
            <strong className="text-sm whitespace-nowrap">{free ? 'Miễn phí' : money(method.fee)}</strong>
          </MethodOption>
        );
      })}
      <p className="mt-3 text-xs text-slate-400">Thời gian dự kiến tính từ khi cửa hàng bàn giao đơn cho vận chuyển.</p>
    </section>
  );
}

export function PaymentMethods({ options, value, disabled, onChange }: {
  options?: CheckoutOptions; value: PaymentMethod; disabled: boolean; onChange: (value: PaymentMethod) => void;
}) {
  return (
    <section className={sectionClass}>
      <SectionTitle icon={<Wallet size={21} />} title="3. Phương thức thanh toán">Chọn phương thức thanh toán phù hợp với bạn</SectionTitle>
      {options?.payments.map(method => (
        <MethodOption key={method.code} name="payment" value={method.code} checked={value === method.code} disabled={disabled || !method.enabled} onSelect={() => onChange(method.code)}>
          <span className={`grid size-9 shrink-0 place-items-center rounded-md text-[10px] font-bold ${method.code === 'MOMO' ? 'bg-pink-700 text-white' : 'bg-blue-100 text-blue-800'}`}>
            {method.code === 'COD' ? <CreditCard size={20} /> : method.code === 'MOMO' ? 'momo' : method.code === 'VNPAY' ? 'VNPAY' : method.code === 'CARD' ? 'VISA' : 'QR'}
          </span>
          <span className="min-w-0 flex-1"><strong className="block text-sm">{method.label}</strong><small className="mt-1 block text-xs text-slate-500">{method.enabled ? method.description : 'Phương thức này đang tạm ngưng'}</small></span>
          {value === method.code && <BadgeCheck size={18} className="shrink-0 text-orange-500" />}
        </MethodOption>
      ))}
    </section>
  );
}
