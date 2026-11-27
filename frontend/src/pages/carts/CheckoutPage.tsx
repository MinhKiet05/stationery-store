import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Gift,
  Home,
  LockKeyhole,
  Mail,
  MapPin,
  Minus,
  Package,
  Pencil,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Tag,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";
import { useCart, useCurrentUser } from "../../services/storeQueries";
import { useCartMutation } from "../../services/useCartMutation";
import { createOrder } from "../../services/orderService";
import { getProduct } from "../../services/productService";
import { queryKeys, sessionScope } from "../../services/queryCache";
import useSessionScope from "../../services/useSessionScope";
import { getGuestCart } from "../../utils/guestCart";
import { userMessage } from "../../utils/notifications";
import type { Order, PaymentMethod, ShippingMethod } from '../../services/orderService';
import { useCheckout } from '../../hooks/useCheckout';
import SectionTitle from './CheckoutSection';
import { ShippingMethods, PaymentMethods } from './CheckoutMethods';
import { money } from './checkoutUtils';
import PaymentModal from './PaymentModal';
import type { Cart } from "../../services/cartService";

const emptyFields = {
  name: "",
  phone: "",
  city: "",
  district: "",
  ward: "",
  address: "",
};

function ItemImage({ item }: { item: Cart["items"][number] }) {
  const product = useQuery({
    queryKey: queryKeys.public("productDetail", {
      handle: String(item.productID),
    }),
    queryFn: ({ signal }) => getProduct(String(item.productID), signal),
    enabled: !!item.productID,
    staleTime: 120000,
  });
  const src = product.data?.images?.[0];
  return (
    <div className="relative grid h-14 w-12 shrink-0 place-items-center rounded bg-slate-100 text-slate-400 sm:w-14 [&>img]:size-full [&>img]:rounded [&>img]:object-contain [&>span]:absolute [&>span]:-top-1 [&>span]:-right-1 [&>span]:min-w-4 [&>span]:rounded [&>span]:bg-slate-800 [&>span]:px-1 [&>span]:text-center [&>span]:text-[10px] [&>span]:text-white">
      {src ? <img src={src} alt={item.productTitle} /> : <Package size={25} />}
      <span>{item.quantity}</span>
    </div>
  );
}

export default function CheckoutPage() {
  const location = useLocation();
  const initialCoupon =
    typeof location.state?.couponCode === "string"
      ? location.state.couponCode.slice(0, 50)
      : "";
  const scope = useSessionScope();
  return <CheckoutContent key={`${scope}:${initialCoupon}`} initialCoupon={initialCoupon} />;
}

function CheckoutContent({ initialCoupon }: { initialCoupon: string }) {
  const scope = useSessionScope();
  const signedIn = !!localStorage.getItem("accessToken");
  const cartQuery = useCart();
  const userQuery = useCurrentUser();
  const cartWrite = useCartMutation();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [coupon, setCoupon] = useState(initialCoupon);
  const [couponCode, setCouponCode] = useState(initialCoupon);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [fields, setFields] = useState(() => ({ ...emptyFields, name: userQuery.data?.fullName || "", phone: userQuery.data?.phoneNumber || "" }));
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('STANDARD');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [savedOrder, setSavedOrder] = useState<Order | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const busy = useRef(false);
  const items = cartQuery.data?.items ?? [];
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const orderWrite = useMutation({ mutationFn: createOrder });
  const { options, quote } = useCheckout({ items, couponCode, shippingMethod, enabled: !orderId });

  const [profileDefaults, setProfileDefaults] = useState(userQuery.data);
  if (profileDefaults !== userQuery.data) {
    setProfileDefaults(userQuery.data);
    if (userQuery.data) {
      const user = userQuery.data;
      setFields(previous => ({
        ...previous,
        name: previous.name || user.fullName || "",
        phone: previous.phone || user.phoneNumber || "",
      }));
    }
  }

  function field(name: keyof typeof fields) {
    return {
      value: fields[name],
      onChange: (event: ChangeEvent<HTMLInputElement>) =>
        setFields((previous) => ({ ...previous, [name]: event.target.value })),
    };
  }

  async function updateItem(itemID: number, next?: number) {
    setError("");
    const requestScope = scope;
    try {
      await cartWrite.mutateAsync(
        next === undefined
          ? { kind: "remove", itemID }
          : { kind: "quantity", itemID, quantity: next },
      );
      if (requestScope === sessionScope())
        window.dispatchEvent(new Event("cart-changed"));
    } catch (reason) {
      if (requestScope === sessionScope())
        setError(
          userMessage(reason, "Không thể cập nhật giỏ hàng. Vui lòng thử lại."),
        );
    }
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || cartWrite.isPending || uncertain || !items.length || !quote.data || quote.isFetching || quote.isError || options.isError)
      return;
    busy.current = true;
    setError("");
    const requestScope = scope;
    if (
      [
        fields.name,
        fields.phone,
        fields.address,
        fields.ward,
        fields.city,
      ].some((value) => !value.trim())
    ) {
      setError("Vui lòng điền đầy đủ thông tin người nhận.");
      busy.current = false;
      return;
    }
    try {
      const result = await orderWrite.mutateAsync({
        shippingAddress: `${fields.name.trim()} - ${[
          fields.address,
          fields.ward,
          fields.district,
          fields.city,
        ]
          .map((value) => value.trim())
          .filter(Boolean)
          .join(", ")}`,
        contactPhone: fields.phone.trim(),
        paymentMethod, shippingMethod, expectedTotalAmount: quote.data.totalAmount,
        ...(couponCode ? { couponCode } : {}),
      });
      if (requestScope !== sessionScope()) return;
      setOrderId(result.orderID);
      // The order is committed first; payment retries must never submit this cart again.
      setSavedOrder(result);
      if (result.paymentMode === 'DEMO' && !result.isPaid) setPaymentOpen(true);
      window.dispatchEvent(new Event("cart-changed"));
      void client.invalidateQueries({
        queryKey: queryKeys.private("cart", {}, requestScope),
      });
      void client.invalidateQueries({
        queryKey: ["session", requestScope, "orders"],
      });
    } catch (reason) {
      if (requestScope !== sessionScope()) return;
      const status = (reason as { status?: number }).status;
      if (status === 409) void quote.refetch();
      if (!status || status >= 500) {
        setUncertain(true);
        setError(
          "Chưa xác định được kết quả đặt hàng. Vui lòng kiểm tra lịch sử đơn hàng trước khi đặt lại.",
        );
      } else
        setError(
          userMessage(
            reason,
            "Không thể đặt hàng. Vui lòng kiểm tra và thử lại.",
          ),
        );
    } finally {
      busy.current = false;
    }
  }

  const disabled = orderWrite.isPending || cartWrite.isPending;
  const unavailable = items.some(
    (item) =>
      item.available === false ||
      (item.stockQuantity !== undefined && item.stockQuantity < item.quantity),
  );

  return (
    <main className="min-h-[65vh] bg-[#f7f8fd] font-sans text-base leading-relaxed text-[#132039] [&_*]:box-border [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 [&_a]:no-underline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-orange-400 [&_input:focus-visible]:outline-orange-400">
      <div className="border-b border-[#edf0f8] bg-[#eff3ff] py-5 pb-7">
        <div className="mx-auto w-[calc(100%-28px)] md:w-[calc(100%-40px)] xl:w-[calc(100%-64px)] max-w-[1240px]">
          <nav
            className="flex flex-wrap items-center gap-2 text-xs text-slate-500 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1.5 [&_strong]:font-semibold [&_strong]:text-slate-800"
            aria-label="Đường dẫn"
          >
            <Link to="/">
              <Home size={14} /> Trang chủ
            </Link>
            <ChevronRight size={12} />
            <span>Giỏ hàng ({quantity})</span>
            <ChevronRight size={12} />
            <strong>Thanh toán & Giao nhận</strong>
          </nav>
          <ol
            className="mx-auto mt-7 flex max-w-[800px] list-none [&>li]:relative [&>li]:flex-1 [&>li]:text-center [&>li]:text-xs [&>li]:text-slate-400 [&>li]:before:absolute [&>li]:before:top-5 [&>li]:before:-left-1/2 [&>li]:before:h-[3px] [&>li]:before:w-full [&>li]:before:bg-[#dce5fa] [&>li:first-child]:before:hidden [&>li>span]:relative [&>li>span]:z-10 [&>li>span]:mx-auto [&>li>span]:grid [&>li>span]:size-10 [&>li>span]:place-items-center [&>li>span]:rounded-full [&>li>span]:text-xl [&>li>p]:mt-2"
            aria-label="Tiến trình đặt hàng"
          >
            <li className="before:bg-orange-500! [&>span]:bg-[#101c30] [&>span]:text-white [&>p]:font-semibold [&>p]:text-slate-800">
              <span>
                <Check size={20} />
              </span>
              <p>1. Giỏ hàng</p>
            </li>
            <li
              className={
                orderId
                  ? "before:bg-orange-500! [&>span]:bg-[#101c30] [&>span]:text-white [&>p]:font-semibold [&>p]:text-slate-800"
                  : "before:bg-orange-500! [&>span]:bg-[#ff7b20] [&>span]:text-white [&>span]:ring-4 [&>span]:ring-orange-200 [&>p]:font-semibold [&>p]:text-orange-600"
              }
              aria-current={orderId ? undefined : "step"}
            >
              <span>{orderId ? <Check size={20} /> : "2"}</span>
              <p>2. Thanh toán & Giao nhận</p>
            </li>
            <li
              className={
                orderId
                  ? "before:bg-orange-500! [&>span]:bg-[#ff7b20] [&>span]:text-white [&>span]:ring-4 [&>span]:ring-orange-200 [&>p]:font-semibold [&>p]:text-orange-600"
                  : ""
              }
              aria-current={orderId ? "step" : undefined}
            >
              <span className={orderId ? "" : "bg-[#e7edfc]"}>3</span>
              <p>3. Hoàn tất đơn</p>
            </li>
          </ol>
        </div>
      </div>

      <div
        className={`mx-auto w-[calc(100%-28px)] md:w-[calc(100%-40px)] xl:w-[calc(100%-64px)] max-w-[1240px] pt-6 pb-10 md:pt-9 md:pb-12`}
      >
        {orderId ? (
          <section
            className={`rounded-lg border border-[#eceff6] bg-white p-4 shadow-xs sm:p-6 mx-auto my-4 flex max-w-[680px] flex-col items-center gap-5 px-6 py-14 text-center [&>svg]:text-orange-500 [&_h1]:text-2xl [&_h1]:font-bold [&_p]:text-slate-500 [&>a]:max-w-[300px]`}
          >
            <BadgeCheck size={60} className="text-emerald-600!" />
            <h1>Đặt hàng thành công!</h1>
            {savedOrder && <p className="font-semibold">Tổng đơn: {money(savedOrder.totalAmount)} · Phí giao hàng: {money(savedOrder.shippingFee ?? 0)}</p>}
            {savedOrder?.paymentMode === 'DEMO' && !savedOrder.isPaid && <button type="button" className="rounded-lg bg-orange-500 px-5 py-3 font-semibold text-white" onClick={() => setPaymentOpen(true)}>Tiếp tục thanh toán</button>}
            <p>
              Đơn hàng <strong>#ST-{orderId}</strong> đã được tiếp nhận.
            </p>
            <p>
              {savedOrder?.paymentMode === 'DEMO' ? savedOrder.isPaid ? 'Đơn hàng đã được thanh toán thành công. Cảm ơn bạn đã mua sắm!' : 'Đơn hàng đang chờ thanh toán.' : 'Bạn sẽ thanh toán khi nhận hàng. Cảm ơn bạn đã chọn StationeryStore.'}
            </p>
            <Link
              className="flex w-full items-center justify-center gap-2 rounded-md border-0 bg-[#ff791c] px-5 py-3.5 text-base font-semibold text-white! transition-colors hover:enabled:bg-orange-600"
              to="/my-profile/orders"
            >
              Xem đơn hàng của tôi
            </Link>
            <Link to="/search">Tiếp tục mua sắm</Link>
          </section>
        ) : !signedIn ? (
          <section
            className={`rounded-lg border border-[#eceff6] bg-white p-4 shadow-xs sm:p-6 mx-auto my-4 flex max-w-[680px] flex-col items-center gap-5 px-6 py-14 text-center [&>svg]:text-orange-500 [&_h1]:text-2xl [&_h1]:font-bold [&_p]:text-slate-500 [&>a]:max-w-[300px]`}
          >
            <ShoppingBag size={52} />
            <h1>Giỏ hàng của bạn</h1>
            <p>
              {getGuestCart().length
                ? `Bạn có ${getGuestCart().reduce((sum, item) => sum + item.quantity, 0)} sản phẩm trong giỏ khách. Đăng nhập để đồng bộ giỏ và tiếp tục thanh toán.`
                : "Đăng nhập để xem giỏ hàng và tiếp tục mua sắm."}
            </p>
            <Link
              to="/login"
              className="flex w-full items-center justify-center gap-2 rounded-md border-0 bg-[#ff791c] px-5 py-3.5 text-base font-semibold text-white! transition-colors hover:enabled:bg-orange-600"
            >
              Đăng nhập để tiếp tục
            </Link>
            <Link to="/search">Khám phá sản phẩm</Link>
          </section>
        ) : cartQuery.isPending ? (
          <section
            className={`rounded-lg border border-[#eceff6] bg-white p-4 shadow-xs sm:p-6 mx-auto my-4 flex max-w-[680px] flex-col items-center gap-5 px-6 py-14 text-center [&>svg]:text-orange-500 [&_h1]:text-2xl [&_h1]:font-bold [&_p]:text-slate-500 [&>a]:max-w-[300px]`}
            role="status"
          >
            <ShoppingBag size={44} />
            <h1>Đang tải giỏ hàng…</h1>
            <p>Đang chuẩn bị đơn hàng của bạn.</p>
          </section>
        ) : cartQuery.isError ? (
          <section
            className={`rounded-lg border border-[#eceff6] bg-white p-4 shadow-xs sm:p-6 mx-auto my-4 flex max-w-[680px] flex-col items-center gap-5 px-6 py-14 text-center [&>svg]:text-orange-500 [&_h1]:text-2xl [&_h1]:font-bold [&_p]:text-slate-500 [&>a]:max-w-[300px]`}
            role="alert"
          >
            <h1>Chưa tải được giỏ hàng</h1>
            <p>{userMessage(cartQuery.error, "Vui lòng thử lại sau.")}</p>
            <button
              className="flex w-full items-center justify-center gap-2 rounded-md border-0 bg-[#ff791c] px-5 py-3.5 text-base font-semibold text-white! transition-colors hover:enabled:bg-orange-600"
              onClick={() => void cartQuery.refetch()}
            >
              Thử lại
            </button>
          </section>
        ) : uncertain && !items.length ? (
          <section
            className="mx-auto my-4 max-w-xl rounded-lg border border-orange-200 bg-white p-8 text-center"
            role="alert"
          >
            <h1 className="text-2xl font-bold">Kiểm tra kết quả đặt hàng</h1>
            <p className="my-5 text-slate-600">{error}</p>
            <Link
              className="font-semibold text-orange-600 underline"
              to="/my-profile/orders"
            >
              Kiểm tra lịch sử đơn hàng
            </Link>
          </section>
        ) : !items.length ? (
          <section
            className={`rounded-lg border border-[#eceff6] bg-white p-4 shadow-xs sm:p-6 mx-auto my-4 flex max-w-[680px] flex-col items-center gap-5 px-6 py-14 text-center [&>svg]:text-orange-500 [&_h1]:text-2xl [&_h1]:font-bold [&_p]:text-slate-500 [&>a]:max-w-[300px]`}
          >
            <ShoppingBag size={56} />
            <h1>Giỏ hàng đang trống</h1>
            <p>Thêm một chút cảm hứng cho góc học tập và làm việc của bạn.</p>
            <Link
              to="/search"
              className="flex w-full items-center justify-center gap-2 rounded-md border-0 bg-[#ff791c] px-5 py-3.5 text-base font-semibold text-white! transition-colors hover:enabled:bg-orange-600"
            >
              Khám phá sản phẩm
            </Link>
          </section>
        ) : (
          <form
            id="checkout-form"
            className="grid items-start gap-6 md:grid-cols-[minmax(0,1.42fr)_minmax(310px,1fr)]"
            onSubmit={placeOrder}
          >
            <h1 className="sr-only">Thanh toán và giao nhận</h1>
            <div className="grid gap-5">
              <section className="rounded-lg border border-[#eceff6] bg-white p-4 shadow-xs sm:p-6">
                <SectionTitle
                  icon={<Truck size={21} />}
                  title="1. Thông tin giao nhận"
                >
                  Địa chỉ nhận hàng an toàn và chuẩn xác
                </SectionTitle>
                <div className="mb-5 flex flex-wrap items-center gap-2 rounded-md bg-[#eff3ff] p-3 text-sm [&>svg]:text-orange-500 [&>span]:text-slate-500 [&>small]:ml-auto [&>small]:rounded [&>small]:bg-blue-100 [&>small]:px-1.5 [&>small]:py-0.5 [&>small]:text-xs [&>small]:text-slate-600">
                  <UserRound size={19} />
                  <strong>
                    {fields.name ||
                      userQuery.data?.username ||
                      "Thông tin người nhận"}
                  </strong>
                  <span>{fields.phone}</span>
                  <small>Tài khoản của bạn</small>
                </div>
                <fieldset
                  disabled={disabled}
                  className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-5 border-0 min-[421px]:grid-cols-2 [&_label]:block [&_label]:min-w-0 [&_label]:text-sm [&_label]:font-semibold [&_b]:text-red-500 [&_input]:mt-2 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-transparent [&_input]:bg-[#eff3ff] [&_input]:p-3 [&_input]:text-base [&_input]:font-normal [&_input]:text-slate-700 [&_input]:placeholder:text-slate-400 [&_input:focus]:border-orange-400 [&_input:focus]:bg-white [&_input:focus]:outline-none [&_input:focus]:ring-2 [&_input:focus]:ring-orange-100 [&_input:read-only]:text-slate-500"
                >
                  <label className="col-span-full">
                    Họ và tên người nhận <b>*</b>
                    <div className="relative [&_input]:pr-9 [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:top-6 [&>svg]:right-3 [&>svg]:text-slate-400">
                      <input
                        required
                        maxLength={100}
                        autoComplete="name"
                        placeholder="Nhập họ và tên"
                        {...field("name")}
                      />
                      <UserRound size={16} />
                    </div>
                  </label>
                  <label>
                    Số điện thoại liên hệ <b>*</b>
                    <div className="relative [&_input]:pr-9 [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:top-6 [&>svg]:right-3 [&>svg]:text-slate-400">
                      <input
                        required
                        type="tel"
                        pattern="[+]?[0-9]{8,15}"
                        maxLength={30}
                        autoComplete="tel"
                        placeholder="Số điện thoại nhận hàng"
                        {...field("phone")}
                      />
                      <Smartphone size={16} />
                    </div>
                  </label>
                  <label>
                    Địa chỉ email
                    <div className="relative [&_input]:pr-9 [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:top-6 [&>svg]:right-3 [&>svg]:text-slate-400">
                      <input
                        type="email"
                        autoComplete="email"
                        placeholder="Email tài khoản của bạn"
                        readOnly
                        value={userQuery.data?.email ?? ""}
                      />
                      <Mail size={16} />
                    </div>
                  </label>
                  <div className="col-span-full grid grid-cols-1 gap-3 min-[421px]:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
                    <label>
                      Tỉnh / Thành phố <b>*</b>
                      <input
                        required
                        maxLength={60}
                        autoComplete="address-level1"
                        placeholder="Tỉnh / Thành phố"
                        {...field("city")}
                      />
                    </label>
                    <label>
                      Quận / Huyện
                      <input
                        maxLength={60}
                        autoComplete="address-level2"
                        placeholder="Quận / Huyện (nếu có)"
                        {...field("district")}
                      />
                    </label>
                    <label>
                      Phường / Xã <b>*</b>
                      <input
                        required
                        maxLength={60}
                        autoComplete="address-level3"
                        placeholder="Phường / Xã"
                        {...field("ward")}
                      />
                    </label>
                  </div>
                  <label className="col-span-full">
                    Địa chỉ cụ thể (Số nhà, tòa nhà, tên đường) <b>*</b>
                    <input
                      required
                      maxLength={180}
                      autoComplete="street-address"
                      placeholder="Ví dụ: 123 Nguyễn Huệ, tòa nhà A"
                      {...field("address")}
                    />
                  </label>
                </fieldset>
                <div className="mt-5 flex gap-2 text-xs text-slate-500 [&>svg]:mt-0.5 [&>svg]:shrink-0">
                  <MapPin size={15} />
                  <span>
                    Vui lòng kiểm tra kỹ địa chỉ và số điện thoại trước khi đặt
                    hàng.
                  </span>
                </div>
              </section>
              <ShippingMethods options={options.data} quote={quote.data} value={shippingMethod} disabled={disabled} onChange={setShippingMethod} loading={options.isPending} failed={options.isError} onRetry={() => void options.refetch()} />
              <PaymentMethods options={options.data} value={paymentMethod} disabled={disabled} onChange={setPaymentMethod} />
              <div className="flex items-center gap-3 rounded-md bg-[#edf2ff] p-4 text-xs text-slate-500 [&>svg]:shrink-0 [&>svg]:text-orange-500 [&_a]:underline!">
                <LockKeyhole size={22} />
                <p>
                  Thông tin nhận hàng chỉ được sử dụng để xử lý và giao đơn hàng
                  của bạn. <Link to="/policy">Xem chính sách bảo mật</Link>.
                </p>
              </div>
            </div>
            <aside className="md:sticky md:top-5">
              <section className="rounded-lg border border-[#eceff6] bg-white p-4 shadow-xs sm:p-6">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4 [&_h2]:text-lg [&_h2]:font-bold [&_p]:mt-1 [&_p]:text-xs [&_p]:text-slate-500 [&>button]:flex [&>button]:shrink-0 [&>button]:items-center [&>button]:gap-1 [&>button]:border-0 [&>button]:bg-transparent [&>button]:text-xs [&>button]:text-orange-600">
                  <div>
                    <h2>Đơn hàng của bạn</h2>
                    <p>
                      {items.length} mặt hàng ({quantity} sản phẩm)
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setEditing(!editing)}
                  >
                    <Pencil size={13} />
                    {editing ? "Hoàn tất" : "Sửa giỏ hàng"}
                  </button>
                </div>
                <div className="pt-1 pb-4">
                  {items.map((item) => (
                    <div
                      className="mt-5 flex items-start gap-3"
                      key={item.cartItemID}
                    >
                      <ItemImage item={item} />
                      <div className="min-w-0 flex-1 [&>strong]:block [&>strong]:text-sm [&>strong]:leading-snug [&>strong]:font-semibold [&>small]:block [&>small]:text-xs [&>small]:text-slate-500">
                        <strong>{item.productTitle}</strong>
                        <small>Phân loại: {item.variantTitle}</small>
                        <small>Số lượng: {item.quantity}</small>
                        {item.available === false && (
                          <small className="text-red-600!">
                            Sản phẩm ngừng bán
                          </small>
                        )}
                        {item.stockQuantity !== undefined &&
                          item.stockQuantity < item.quantity && (
                            <small className="text-red-600!">
                              Không đủ tồn kho
                            </small>
                          )}
                        {editing && (
                          <div className="mt-2 flex items-center gap-2 text-sm [&>button]:grid [&>button]:size-7 [&>button]:place-items-center [&>button]:rounded [&>button]:border [&>button]:border-slate-200 [&>button]:bg-white">
                            <button
                              type="button"
                              disabled={disabled || item.quantity <= 1}
                              aria-label={`Giảm số lượng ${item.productTitle}`}
                              onClick={() =>
                                void updateItem(
                                  item.cartItemID,
                                  item.quantity - 1,
                                )
                              }
                            >
                              <Minus size={13} />
                            </button>
                            <span>{item.quantity}</span>
                            <button
                              type="button"
                              disabled={
                                disabled ||
                                (item.stockQuantity !== undefined &&
                                  item.quantity >= item.stockQuantity)
                              }
                              aria-label={`Tăng số lượng ${item.productTitle}`}
                              onClick={() =>
                                void updateItem(
                                  item.cartItemID,
                                  item.quantity + 1,
                                )
                              }
                            >
                              <Plus size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={disabled}
                              className="border-0! text-red-500"
                              aria-label={`Xóa ${item.productTitle}`}
                              onClick={() => void updateItem(item.cartItemID)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      <strong className="text-xs font-semibold whitespace-nowrap sm:text-sm">
                        {money(item.lineTotal)}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="mt-1 mb-5 flex items-center gap-3 rounded-md bg-[#eff3ff] p-3 [&>svg]:shrink-0 [&>svg]:text-orange-500 [&_strong]:text-sm [&_p]:text-xs [&_p]:text-slate-500">
                  <Gift size={23} />
                  <div>
                    <strong>Một món quà, thêm niềm vui</strong>
                    <p>Dịch vụ gói quà sẽ sớm được ra mắt.</p>
                  </div>
                </div>
                <label className="text-sm font-semibold" htmlFor="coupon">
                  Mã ưu đãi / Phiếu quà tặng
                </label>
                <div className="relative mt-2 flex items-center gap-2 [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:left-3 [&>svg]:text-orange-500 [&>input]:w-full [&>input]:min-w-0 [&>input]:rounded-md [&>input]:border-0 [&>input]:bg-[#eff3ff] [&>input]:py-3 [&>input]:pr-2 [&>input]:pl-9 [&>input]:text-sm [&>input]:uppercase [&>input]:placeholder:normal-case [&>input]:placeholder:text-slate-400 [&>button]:shrink-0 [&>button]:rounded-md [&>button]:border-0 [&>button]:bg-slate-900 [&>button]:p-3 [&>button]:text-xs [&>button]:text-white">
                  <Tag size={17} />
                  <input
                    id="coupon"
                    maxLength={50}
                    placeholder="Nhập mã giảm giá"
                    value={coupon}
                    disabled={disabled}
                    onChange={(event) => setCoupon(event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!coupon.trim() || disabled}
                    onClick={() => setCouponCode(coupon.trim().toUpperCase())}
                  >
                    Sử dụng
                  </button>
                </div>
                {couponCode && (
                  <div className="mt-3 text-xs text-slate-500 [&>span]:rounded [&>span]:bg-orange-50 [&>span]:px-2 [&>span]:py-1 [&>span]:text-orange-600 [&>button]:ml-2 [&>button]:border-0 [&>button]:bg-transparent [&>button]:underline [&>p]:mt-2">
                    <span>{couponCode}</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setCouponCode("");
                        setCoupon("");
                      }}
                    >
                      Xóa mã
                    </button>
                    <p>Mã được kiểm tra trực tiếp và tính vào tổng thanh toán.</p>
                  </div>
                )}
                <dl className="mt-5 grid gap-2 border-t border-dashed border-slate-200 pt-4 text-sm [&>div]:flex [&>div]:justify-between [&>div]:gap-3 [&_dt]:text-slate-500 [&_dd]:text-right [&_dd]:font-medium [&_dd]:wrap-anywhere">
                  <div>
                    <dt>Tạm tính tiền hàng ({quantity} sản phẩm)</dt>
                    <dd>{money(cartQuery.data?.subtotal ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>Phí giao hàng</dt>
                    <dd>{quote.data ? quote.data.shippingFee === 0 ? "Miễn phí" : money(quote.data.shippingFee) : "Đang tính…"}</dd>
                  </div>
                  {couponCode && (
                    <div>
                      <dt>Mã giảm giá</dt>
                      <dd>{couponCode}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-4 mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 [&_h3]:text-lg [&_h3]:font-bold [&_small]:block [&_small]:text-xs [&_small]:text-slate-500 [&>strong]:text-3xl [&>strong]:leading-tight [&>strong]:font-bold [&>strong]:whitespace-nowrap [&>strong]:text-orange-500">
                  <div>
                    <h3>
                      Tổng thanh toán:
                    </h3>
                    <small>{paymentMethod === "COD" ? "Thanh toán khi nhận hàng" : "Thanh toán trực tuyến"}</small>
                  </div>
                  <strong>{quote.data ? money(quote.data.totalAmount) : "Đang tính…"}</strong>
                </div>
                {quote.isFetching && <p role="status" className="mb-3 text-xs text-slate-500">Đang cập nhật phí và ưu đãi…</p>}
                {quote.isError && <p role="alert" className="mb-3 rounded bg-red-50 p-3 text-sm text-red-600">{userMessage(quote.error, 'Không tính được tổng đơn.')} <button type="button" onClick={() => void quote.refetch()} className="underline">Thử lại</button></p>}
                {quote.data && quote.data.discountAmount > 0 && <p className="mb-3 text-sm text-emerald-600">Giảm giá: -{money(quote.data.discountAmount)}</p>}
                {error && (
                  <p
                    role="alert"
                    className="mb-3 rounded bg-red-50 p-3 text-sm text-red-700"
                  >
                    {error}
                  </p>
                )}
                {unavailable && (
                  <p
                    role="alert"
                    className="mb-3 rounded bg-red-50 p-3 text-sm text-red-700"
                  >
                    Vui lòng sửa giỏ hàng: một số sản phẩm không còn đủ số lượng
                    hoặc đã ngừng bán.
                  </p>
                )}
                {uncertain && (
                  <Link
                    className="mb-4 block text-orange-700! underline!"
                    to="/my-profile/orders"
                  >
                    Kiểm tra lịch sử đơn hàng
                  </Link>
                )}
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-md border-0 bg-[#ff791c] px-5 py-3.5 text-base font-semibold text-white! transition-colors hover:enabled:bg-orange-600"
                  type="submit"
                  disabled={disabled || uncertain || unavailable || quote.isFetching || !quote.data || quote.isError || options.isError || options.isPending || !options.data?.payments.some(method => method.code === paymentMethod && method.enabled)}
                >

                  {orderWrite.isPending
                    ? "Đang đặt hàng…"
                    : cartWrite.isPending
                      ? "Đang cập nhật giỏ…"
                      : "ĐẶT HÀNG NGAY"}
                </button>
                <p className="mt-3 mb-5 text-center text-xs leading-relaxed text-slate-500 [&_a]:text-slate-700 [&_a]:underline!">
                  Nhấn “Đặt hàng ngay” đồng nghĩa bạn đồng ý với{" "}
                  <Link to="/policy">Điều khoản sử dụng</Link> của
                  StationeryStore
                </p>
                <ul className="grid list-none gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 [&>li]:flex [&>li]:items-center [&>li]:gap-2 [&_svg]:shrink-0 [&_svg]:text-emerald-600">
                  <li>
                    <ShieldCheck size={16} />
                    Kiểm tra hàng trước khi thanh toán
                  </li>
                  <li>
                    <BadgeCheck size={16} />
                    Hỗ trợ đổi trả theo chính sách cửa hàng
                  </li>
                  <li>
                    <LockKeyhole size={16} />
                    Thông tin đơn hàng được bảo mật
                  </li>
                </ul>
              </section>
              <p className="mt-4 text-center text-xs text-slate-400 [&_a]:text-orange-600">
                Cần hỗ trợ? <Link to="/contact">Liên hệ với chúng tôi</Link>
              </p>
            </aside>
          </form>
        )}
      </div>
      {paymentOpen && savedOrder && <PaymentModal key={savedOrder.orderID} order={savedOrder} onClose={() => setPaymentOpen(false)} onPaid={updated => { setSavedOrder(updated); void client.invalidateQueries({ queryKey: ['session', scope, 'orders'] }); }} />}
    </main>
  );
}
