import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  ChevronRight,
  Gift,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Trash2,
  Truck,
} from "lucide-react";
import { useCart } from "../../services/storeQueries";
import { useCartMutation } from "../../services/useCartMutation";
import { getProduct, getProducts } from "../../services/productService";
import { queryKeys, sessionScope } from "../../services/queryCache";
import useSessionScope from "../../services/useSessionScope";
import { getGuestCart } from "../../utils/guestCart";
import {
  isFavoriteProduct,
  toggleFavoriteProduct,
} from "../../utils/favoriteStorage";
import { userMessage } from "../../utils/notifications";
import type { Cart } from "../../services/cartService";
import { useCheckout } from '../../hooks/useCheckout';
import { money } from './checkoutUtils';

type Item = Cart["items"][number];
const shell =
  "mx-auto w-[calc(100%_-_32px)] max-w-[1240px] md:w-[calc(100%_-_64px)]";
const card = "rounded-xl border border-[#eceff7] bg-white";

function CartRow({
  item,
  checked,
  busy,
  onSelect,
  onQuantity,
  onRemove,
}: {
  item: Item;
  checked: boolean;
  busy: boolean;
  onSelect: () => void;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const product = useQuery({
    queryKey: queryKeys.public("productDetail", {
      handle: String(item.productID),
    }),
    queryFn: ({ signal }) => getProduct(String(item.productID), signal),
    enabled: !!item.productID,
    staleTime: 120000,
  });
  const [saved, setSaved] = useState(
    () => !!item.productID && isFavoriteProduct(item.productID),
  );
  const price = item.lineTotal / item.quantity;
  const oldPrice = product.data?.compareAtPrice ?? 0;
  const discount =
    oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;
  const url = `/products/${encodeURIComponent(product.data?.handle || String(item.productID ?? ""))}`;
  return (
    <article className="grid grid-cols-[18px_76px_1fr] items-start gap-x-3 gap-y-4 border-b border-[#edf0f8] py-6 last:border-0 lg:grid-cols-[18px_minmax(0,1fr)_105px_105px_110px] lg:items-center lg:gap-3 lg:py-7">
      <input
        type="checkbox"
        aria-label={`Chọn ${item.productTitle}`}
        checked={checked}
        onChange={onSelect}
        disabled={busy}
        className="mt-1 size-4 cursor-pointer accent-[#ff791c] lg:mt-0"
      />
      <div className="contents lg:flex lg:min-w-0 lg:items-start lg:gap-4">
        <Link
          to={url}
          className="grid aspect-square w-[76px] shrink-0 place-items-center overflow-hidden rounded-lg bg-[#f5f3ee] text-slate-400 lg:w-[88px]"
        >
          {product.data?.images?.[0] ? (
            <img
              src={product.data.images[0]}
              alt={item.productTitle}
              className="size-full object-cover"
            />
          ) : (
            <Package size={30} />
          )}
        </Link>
        <div className="min-w-0">
          {discount > 0 && (
            <span className="mb-1.5 inline-block rounded bg-[#fff0e5] px-1.5 py-0.5 text-[10px] font-semibold text-[#f4752c]">
              Giá tốt mỗi ngày
            </span>
          )}
          <Link
            to={url}
            className="block text-sm leading-[1.5] font-semibold text-[#152039] hover:text-orange-500"
          >
            {item.productTitle}
          </Link>
          <p className="mt-1 text-xs text-[#9295a0]">
            Phân loại: {item.variantTitle}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {item.productID && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setSaved(toggleFavoriteProduct(item.productID!))}
                className={`inline-flex items-center gap-1 ${saved ? "text-orange-500" : "text-[#9295a0] hover:text-orange-500"}`}
              >
                <Bookmark size={12} fill={saved ? "currentColor" : "none"} />
                {saved ? "Đã lưu" : "Lưu mua sau"}
              </button>
            )}
            <span className="text-slate-200">·</span>
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              aria-label={`Xóa ${item.productTitle}`}
              className="inline-flex items-center gap-1 text-[#ef674b] hover:text-red-700"
            >
              <Trash2 size={12} />
              Xóa
            </button>
          </div>
          {(item.available === false ||
            (item.stockQuantity !== undefined &&
              item.stockQuantity < item.quantity)) && (
            <p className="mt-2 text-xs text-red-600">
              Sản phẩm không còn đủ số lượng hoặc đã ngừng bán.
            </p>
          )}
        </div>
      </div>
      <div className="col-start-2 text-sm lg:col-auto lg:text-center">
        <span className="font-semibold text-[#14213b]">{money(price)}</span>
        {discount > 0 && (
          <div className="mt-1 flex items-center gap-1 lg:justify-center">
            <del className="text-[11px] text-[#a1a4af]">{money(oldPrice)}</del>
            <span className="rounded bg-[#ffddc8] px-1 py-0.5 text-[10px] text-[#db681d]">
              -{discount}%
            </span>
          </div>
        )}
      </div>
      <div className="col-start-3 flex items-center gap-2 lg:col-auto lg:justify-center">
        <div className="inline-flex h-8 items-center rounded-md bg-[#e8efff] text-[#203457]">
          <button
            type="button"
            disabled={busy || item.quantity <= 1}
            aria-label={`Giảm số lượng ${item.productTitle}`}
            onClick={() => onQuantity(item.quantity - 1)}
            className="grid size-8 place-items-center disabled:opacity-30"
          >
            <Minus size={13} />
          </button>
          <span className="min-w-6 text-center text-xs font-bold">
            {item.quantity}
          </span>
          <button
            type="button"
            disabled={
              busy ||
              (item.stockQuantity !== undefined &&
                item.quantity >= item.stockQuantity)
            }
            aria-label={`Tăng số lượng ${item.productTitle}`}
            onClick={() => onQuantity(item.quantity + 1)}
            className="grid size-8 place-items-center disabled:opacity-30"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
      <strong className="col-start-3 text-right text-base whitespace-nowrap text-[#ff791c] lg:col-auto">
        {money(item.lineTotal)}
      </strong>
    </article>
  );
}

export default function CartPage() {
  const scope = useSessionScope();
  const query = useCart();
  const mutation = useCartMutation();
  const navigate = useNavigate();
  const [excluded, setExcluded] = useState<number[]>([]);
  const [coupon, setCoupon] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const items = query.data?.items ?? [];
  const subtotal = query.data?.subtotal ?? 0;
  const { options, quote } = useCheckout({ items, couponCode });
  const selected = items.filter((item) => !excluded.includes(item.cartItemID));
  const allSelected = !!items.length && selected.length === items.length;
  const busy = mutation.isPending || deleting;
  const freeThreshold = options.data?.freeShippingThreshold ?? 200000;
  const merchandise = subtotal - (quote.data?.discountAmount ?? 0);
  const remaining = Math.max(0, freeThreshold - merchandise);
  const progress = freeThreshold > 0 ? Math.min(100, Math.round(merchandise / freeThreshold * 100)) : 100;
  const suggestions = useQuery({
    queryKey: queryKeys.public("products", { cartSuggestions: true }),
    queryFn: ({ signal }) => getProducts(signal, 0, 8),
    staleTime: 180000,
  });
  const recommended =
    suggestions.data?.content
      .filter(
        (product) =>
          product.available &&
          product.isActive &&
          !items.some((item) => item.productID === product.productID),
      )
      .slice(0, 4) ?? [];
  useEffect(() => {
    setExcluded([]);
    setCoupon("");
    setCouponCode("");
    setError("");
  }, [scope]);

  async function change(itemID: number, quantity?: number) {
    setError("");
    const current = scope;
    try {
      await mutation.mutateAsync(
        quantity === undefined
          ? { kind: "remove", itemID }
          : { kind: "quantity", itemID, quantity },
      );
      if (current === sessionScope())
        window.dispatchEvent(new Event("cart-changed"));
    } catch (reason) {
      if (current === sessionScope())
        setError(userMessage(reason, "Không thể cập nhật giỏ hàng."));
    }
  }
  async function removeSelected() {
    if (busy) return;
    const current = scope;
    setDeleting(true);
    setError("");
    try {
      for (const item of selected) {
        if (current !== sessionScope()) break;
        await mutation.mutateAsync({ kind: "remove", itemID: item.cartItemID });
      }
      if (current === sessionScope())
        window.dispatchEvent(new Event("cart-changed"));
    } catch (reason) {
      if (current === sessionScope())
        setError(userMessage(reason, "Chưa xóa được các sản phẩm đã chọn."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-[65vh] bg-[#f7f8fd] pb-12 font-sans text-sm text-[#14213b] [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-40 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-orange-400 [&_input]:accent-[#ff791c]">
      <div className={shell}>
        <nav
          aria-label="Đường dẫn"
          className="flex items-center gap-1.5 pt-7 pb-5 text-xs text-[#8d92a2]"
        >
          <Link to="/" className="hover:text-orange-500">
            Trang chủ
          </Link>
          <ChevronRight size={11} />
          <span className="font-medium text-[#273249]">Giỏ hàng của bạn</span>
        </nav>
        <h1 className="sr-only">Giỏ hàng của bạn</h1>
        <section
          className={`${card} px-5 py-7 md:px-12 md:py-8`}
          aria-label="Tiến trình mua hàng"
        >
          <ol className="mx-auto grid max-w-[860px] grid-cols-3 text-center">
            {[
              {
                icon: <ShoppingCart size={19} />,
                title: "1. Giỏ hàng",
                sub: "Đang chọn",
              },
              {
                icon: <Truck size={19} />,
                title: "2. Thanh toán & Giao hàng",
                sub: "Bước kế tiếp",
              },
              {
                icon: <BadgeCheck size={19} />,
                title: "3. Hoàn tất đơn",
                sub: "Xác nhận",
              },
            ].map((step, index) => (
              <li
                key={step.title}
                aria-current={index === 0 ? "step" : undefined}
                className="relative before:absolute before:top-[19px] before:left-[-50%] before:h-[3px] before:w-full before:bg-[#e4ebff] first:before:hidden"
              >
                <span
                  className={`relative z-10 mx-auto grid size-10 place-items-center rounded-full ${index === 0 ? "bg-[#ff791c] text-white" : "bg-[#e9efff] text-[#9aabc3]"}`}
                >
                  {step.icon}
                </span>
                <p className="relative mt-2 text-xs font-semibold sm:text-sm">
                  {step.title}
                </p>
                <p
                  className={`mt-1 text-[11px] ${index === 0 ? "text-[#ff791c]" : "text-[#9a9fac]"}`}
                >
                  {step.sub}
                </p>
              </li>
            ))}
          </ol>
          <div className="mx-auto mt-6 flex max-w-[760px] flex-wrap items-center gap-3 rounded-lg bg-[#f0f4ff] px-4 py-3 text-xs sm:flex-nowrap">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#ffe5d4] text-orange-500">
              <Truck size={18} />
            </span>
            <p className="flex-1">
              {remaining > 0 ? (
                <>
                  Bạn còn thiếu{" "}
                  <strong className="text-[#ff791c]">{money(remaining)}</strong>{" "}
                  nữa để được miễn phí giao hàng tiêu chuẩn từ <strong>{money(freeThreshold)}</strong>!
                </>
              ) : (
                <>
                  <strong className="text-emerald-600">Thật tuyệt!</strong> Giỏ
                  hàng của bạn được miễn phí giao hàng tiêu chuẩn.
                </>
              )}
            </p>
            <div className="ml-11 flex w-36 items-center gap-2 sm:ml-0">
              <div
                role="progressbar"
                aria-label="Tiến độ giỏ hàng đến 200.000 đồng"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 flex-1 overflow-hidden rounded-full bg-[#dce6ff]"
              >
                <div
                  className="h-full rounded-full bg-[#ff791c] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold">
                {progress}%
              </span>
            </div>
          </div>
        </section>

        {!localStorage.getItem("accessToken") ? (
          <section className={`${card} mt-6 px-6 py-16 text-center`}>
            <ShoppingBag size={44} className="mx-auto mb-4 text-orange-500" />
            <h2 className="text-xl font-bold">Giỏ hàng của bạn</h2>
            <p className="mt-3 text-slate-500">
              {getGuestCart().length
                ? "Đăng nhập để đồng bộ sản phẩm trong giỏ và tiếp tục mua sắm."
                : "Đăng nhập để xem giỏ hàng của bạn."}
            </p>
            <Link
              to="/login"
              className="mt-6 inline-block rounded-lg bg-[#ff791c] px-7 py-3 font-semibold text-white"
            >
              Đăng nhập để tiếp tục
            </Link>
          </section>
        ) : query.isPending ? (
          <div
            role="status"
            className={`${card} mt-6 p-14 text-center text-slate-500`}
          >
            Đang tải giỏ hàng của bạn…
          </div>
        ) : query.isError ? (
          <div role="alert" className={`${card} mt-6 p-10 text-center`}>
            <p>{userMessage(query.error, "Chưa tải được giỏ hàng.")}</p>
            <button
              onClick={() => void query.refetch()}
              className="mt-4 text-orange-500 underline"
            >
              Thử lại
            </button>
          </div>
        ) : !items.length ? (
          <section className={`${card} mt-6 p-14 text-center`}>
            <ShoppingBag size={48} className="mx-auto text-orange-500" />
            <h2 className="mt-4 text-xl font-bold">Giỏ hàng đang trống</h2>
            <p className="mt-2 text-slate-500">
              Tìm một chút cảm hứng mới cho góc học tập của bạn.
            </p>
            <Link
              to="/search"
              className="mt-6 inline-block rounded-lg bg-[#ff791c] px-6 py-3 font-semibold text-white"
            >
              Khám phá sản phẩm
            </Link>
          </section>
        ) : (
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="min-w-0">
              <div
                className={`${card} mb-5 grid grid-cols-[1fr_105px_105px_110px] items-center gap-3 px-6 py-4 text-xs`}
              >
                <label className="col-span-full flex items-center gap-2 font-semibold lg:col-span-1">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={busy}
                    onChange={() =>
                      setExcluded(
                        allSelected ? items.map((item) => item.cartItemID) : [],
                      )
                    }
                    className="size-4"
                  />
                  Chọn tất cả ({items.length} sản phẩm)
                </label>
                <span className="hidden text-center text-[#8f94a2] lg:block">
                  Đơn giá
                </span>
                <span className="hidden text-center text-[#8f94a2] lg:block">
                  Số lượng
                </span>
                <span className="hidden text-right text-[#8f94a2] lg:block">
                  Số tiền
                </span>
              </div>
              <section
                className={`${card} px-5 md:px-6`}
                aria-label="Sản phẩm trong giỏ"
              >
                {items.map((item) => (
                  <CartRow
                    key={item.cartItemID}
                    item={item}
                    checked={!excluded.includes(item.cartItemID)}
                    busy={busy}
                    onSelect={() =>
                      setExcluded((previous) =>
                        previous.includes(item.cartItemID)
                          ? previous.filter((id) => id !== item.cartItemID)
                          : [...previous, item.cartItemID],
                      )
                    }
                    onQuantity={(quantity) =>
                      void change(item.cartItemID, quantity)
                    }
                    onRemove={() => void change(item.cartItemID)}
                  />
                ))}
              </section>
              <div className="my-7 flex flex-wrap items-center justify-between gap-4 px-2 text-xs">
                <Link
                  to="/search"
                  className="inline-flex items-center gap-2 font-semibold hover:text-orange-500"
                >
                  <ArrowLeft size={15} />
                  Tiếp tục mua sắm văn phòng phẩm
                </Link>
                <button
                  type="button"
                  disabled={busy || !selected.length}
                  onClick={() => void removeSelected()}
                  className="inline-flex items-center gap-1.5 text-[#9599a5] hover:text-red-500"
                >
                  <Trash2 size={13} />
                  Xóa các mục đã chọn
                </button>
              </div>
              <section className={`${card} p-6`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    disabled
                    aria-label="Đóng gói làm quà sắp có"
                    className="mt-1 size-4"
                  />
                  <div>
                    <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                      <Gift size={18} className="text-orange-500" />
                      Đóng gói làm quà tặng văn phòng phẩm{" "}
                      <span className="rounded bg-orange-50 px-2 py-0.5 text-[10px] font-normal text-orange-500">
                        Sắp có
                      </span>
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-[#9196a2]">
                      Gói quà chỉn chu trong hộp giấy Kraft tái chế phong cách
                      Nhật Bản, kèm lời chúc dành riêng cho người nhận.
                    </p>
                    <label className="mt-5 block text-xs font-medium text-[#7f8797]">
                      Lời chúc học đường cho StationeryStore
                      <textarea
                        disabled
                        rows={2}
                        placeholder="Ví dụ: Xin hãy gói riêng từng món và đính kèm thiệp giúp mình…"
                        className="mt-2 w-full resize-none rounded-md border-0 bg-[#f0f4ff] p-3 text-xs placeholder:text-[#a2abc0]"
                      />
                    </label>
                  </div>
                </div>
              </section>
            </div>
            <aside className={`${card} p-6 lg:sticky lg:top-6`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Tóm tắt đơn hàng</h2>
                <span className="text-xs text-[#9297a3]">
                  {items.length} sản phẩm
                </span>
              </div>
              <label
                htmlFor="cart-coupon"
                className="mt-7 mb-2 block text-xs font-semibold"
              >
                Mã ưu đãi / Voucher
              </label>
              <div className="flex gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <Tag
                    size={15}
                    className="absolute top-3.5 left-3 text-[#9b9fac]"
                  />
                  <input
                    id="cart-coupon"
                    value={coupon}
                    onChange={(event) => setCoupon(event.target.value)}
                    maxLength={50}
                    placeholder="Nhập mã ưu đãi"
                    className="w-full rounded-md border-0 bg-[#f0f4ff] py-3 pr-2 pl-9 text-xs uppercase placeholder:normal-case focus:outline-orange-400"
                  />
                </div>
                <button
                  type="button"
                  disabled={!coupon.trim()}
                  onClick={() => setCouponCode(coupon.trim().toUpperCase())}
                  className="shrink-0 rounded-md bg-[#111c30] px-4 text-xs font-medium text-white"
                >
                  Áp dụng
                </button>
              </div>
              {couponCode && (
                <div className="mt-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0e4] px-2 py-1 text-[10px] font-semibold text-orange-500">
                    <Tag size={10} />
                    {couponCode}
                    <button
                      onClick={() => {
                        setCoupon("");
                        setCouponCode("");
                      }}
                      aria-label="Bỏ mã giảm giá"
                      className="ml-1"
                    >
                      ×
                    </button>
                  </span>
                  <p className="mt-2 text-[11px] text-[#969aa7]">
                    {quote.isFetching ? 'Đang kiểm tra mã…' : quote.isError ? userMessage(quote.error, 'Mã không áp dụng được.') : 'Giảm giá đã được tính vào tổng đơn.'}
                  </p>
                </div>
              )}
              <dl className="mt-7 grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[#8d929e]">
                    Tạm tính ({items.length} món)
                  </dt>
                  <dd className="font-semibold">{money(subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#8d929e]">Phí vận chuyển dự kiến</dt>
                  <dd className="text-xs text-[#8d929e]">{quote.data ? quote.data.shippingFee === 0 ? 'Miễn phí' : money(quote.data.shippingFee) : 'Đang tính…'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#8d929e]">Đóng gói hộp quà</dt>
                  <dd className="text-xs text-[#8d929e]">Không chọn</dd>
                </div>
              </dl>
              <div className="mt-5 border-t border-[#edf0f8] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold">Tổng thanh toán</h3>
                  <strong className="text-[32px] leading-tight font-bold tracking-tight text-[#ff791c]">
                    {quote.data ? money(quote.data.totalAmount) : money(subtotal)}
                  </strong>
                </div>
                <p className="mt-1 text-[10px] text-[#a0a4af]">
                  {couponCode
                    ? `Giảm giá: ${money(quote.data?.discountAmount ?? 0)}`
                    : "Đã gồm vận chuyển tiêu chuẩn. Có thể đổi ở checkout."}
                </p>
              </div>
              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-600"
                >
                  {error}
                </p>
              )}
              {!allSelected && (
                <p className="mt-4 text-xs text-orange-600">
                  Chọn tất cả sản phẩm để tiếp tục thanh toán.
                </p>
              )}
              <button
                type="button"
                disabled={
                  busy ||
                  quote.isFetching || quote.isError || !quote.data || options.isError ||
                  !allSelected ||
                  items.some(
                    (item) =>
                      item.available === false ||
                      (item.stockQuantity !== undefined &&
                        item.stockQuantity < item.quantity),
                  )
                }
                onClick={() => navigate("/checkout", { state: { couponCode } })}
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-[#ff791c] py-4 text-base font-semibold text-white shadow-[0_5px_15px_#ff791c15] transition-colors hover:bg-orange-600"
              >

                Tiến hành thanh toán
              </button>
              <ul className="mt-6 grid list-none gap-3 rounded-lg bg-[#f0f4ff] p-4 text-xs leading-relaxed text-[#7d879b]">
                <li className="flex gap-2">
                  <ShieldCheck size={16} className="shrink-0 text-orange-500" />
                  Thông tin đơn hàng của bạn được bảo mật
                </li>
                <li className="flex gap-2">
                  <BadgeCheck size={16} className="shrink-0 text-orange-500" />
                  Hỗ trợ đổi trả theo chính sách cửa hàng
                </li>
                <li className="flex gap-2">
                  <Gift size={16} className="shrink-0 text-orange-500" />
                  Đồng hành cùng góc học tập đầy cảm hứng
                </li>
              </ul>
            </aside>
          </div>
        )}

        {recommended.length > 0 && (
          <section
            className="mt-14 pt-4 md:mt-16"
            aria-labelledby="cart-recommendations"
          >
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="mb-1 text-[10px] font-bold tracking-wider text-[#ff791c] uppercase">
                  Thêm một chút cảm hứng
                </p>
                <h2
                  id="cart-recommendations"
                  className="text-2xl font-bold tracking-tight md:text-[30px]"
                >
                  Thường được mua cùng
                </h2>
              </div>
              <p className="max-w-md text-xs leading-relaxed text-[#9296a2]">
                Những món phụ kiện nhỏ xinh cho góc học tập và làm việc của bạn.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
              {recommended.map((product) => (
                <Link
                  key={product.productID}
                  to={`/products/${encodeURIComponent(product.handle || String(product.productID))}`}
                  className={`${card} group block overflow-hidden p-3 transition-shadow hover:shadow-md`}
                >
                  <div className="aspect-square overflow-hidden rounded-lg bg-[#f4f4f0]">
                    {product.images?.[0] ? (
                      <img
                        src={product.images[0]}
                        loading="lazy"
                        alt={product.title}
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid size-full place-items-center text-slate-300">
                        <Package size={40} />
                      </div>
                    )}
                  </div>
                  <h3 className="mt-3 line-clamp-2 min-h-10 text-sm leading-snug font-semibold">
                    {product.title}
                  </h3>
                  <p className="mt-1 truncate text-xs text-[#969ba7]">
                    {product.vendorName || "Văn phòng phẩm"}
                  </p>
                  <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <strong className="text-sm text-[#ff791c]">
                        {money(product.price)}
                      </strong>
                      {product.compareAtPrice > product.price && (
                        <del className="mt-0.5 block text-[10px] text-[#a1a6b0]">
                          {money(product.compareAtPrice)}
                        </del>
                      )}
                    </div>
                    <span className="flex items-center gap-1 rounded-md bg-[#e7eeff] px-2 py-1.5 text-[10px] font-semibold">
                      <ShoppingCart size={12} />
                      Xem thêm
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
