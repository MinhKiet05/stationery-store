import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { completeDemoPayment } from "../../services/checkoutService";
import { sessionScope } from "../../services/queryCache";
import { userMessage } from "../../utils/notifications";
import type { Order, PaymentMethod } from "../../services/orderService";
import { money, paymentLabels } from "./checkoutUtils";

type PaymentStep = "processing" | "success" | "error";
type PaymentModalProps = {
  order: Order;
  onPaid: (order: Order) => void;
  onClose: () => void;
};

function SuccessCheck() {
  return (
    <div className="grid size-24 place-items-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50">
      <svg
        viewBox="0 0 64 64"
        className="size-16 text-emerald-500"
        fill="none"
        aria-label="Thành công"
      >
        <circle cx="32" cy="32" r="27" stroke="currentColor" strokeWidth="3" />
        <path
          d="m18 33 9 9 20-21"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="48"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="48"
            to="0"
            dur="0.45s"
            fill="freeze"
          />
        </path>
      </svg>
    </div>
  );
}

export default function PaymentModal({
  order,
  onPaid,
  onClose,
}: PaymentModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const onPaidRef = useRef(onPaid);
  const [step, setStep] = useState<PaymentStep>("processing");
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  onPaidRef.current = onPaid;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    let active = true;
    const scope = sessionScope();
    setStep("processing");
    setReceipt(null);

    // Delay only drives the animation. Success requires a persisted response from the server.
    // Retrying uses the same order ID, and the backend makes confirmation idempotent.
    const timer = window.setTimeout(async () => {
      if (!active || scope !== sessionScope()) return;
      try {
        const result = await completeDemoPayment(order.orderID);
        if (!active || scope !== sessionScope()) return;
        if (!result.isPaid)
          throw new Error(
            "Chưa ghi nhận kết quả thanh toán. Vui lòng thử lại.",
          );
        setReceipt(result);
        onPaidRef.current(result);
        setStep("success");
      } catch (reason) {
        if (!active || scope !== sessionScope()) return;
        setError(
          userMessage(
            reason,
            "Chưa xác định được kết quả. Bạn có thể kiểm tra hoặc thử lại cho cùng đơn hàng.",
          ),
        );
        setStep("error");
      }
    }, 2100);

    // An unmount or account switch must not update another customer's receipt.
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [order.orderID, attempt]);

  const title =
    step === "processing"
      ? "Đang xử lý thanh toán…"
      : step === "success"
        ? "Thanh toán thành công!"
        : "Chưa hoàn tất thanh toán";
  const description =
    step === "processing"
      ? "Vui lòng chờ trong giây lát. Giao dịch của bạn đang được xác nhận."
      : step === "success"
        ? "Thanh toán đã được ghi nhận. Cảm ơn bạn đã mua sắm tại StationeryStore."
        : error;

  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      aria-labelledby="payment-title"
      aria-describedby="payment-description"
      onCancel={(event) => {
        event.preventDefault();
        if (step !== "processing") onClose();
      }}
      className="fixed inset-0 m-auto w-[calc(100%_-_32px)] max-w-[440px] overflow-hidden rounded-3xl border-0 bg-white p-0 text-center text-slate-800 shadow-2xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-sm"
    >
      <div className="px-7 pt-8 pb-7 sm:px-9">
        <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold tracking-wider text-orange-600 uppercase">
          Thanh toán an toàn
        </span>
        <div
          className="mt-8 mb-6 flex justify-center"
          aria-live="polite"
          role="status"
        >
          {step === "processing" ? (
            <div className="relative grid size-24 place-items-center rounded-full bg-orange-50">
              <span className="absolute inset-0 rounded-full border-4 border-orange-100" />
              <LoaderCircle
                size={58}
                strokeWidth={1.7}
                className="animate-spin text-orange-500 motion-reduce:animate-none"
              />
              <LockKeyhole size={20} className="absolute text-orange-500" />
            </div>
          ) : step === "success" ? (
            <SuccessCheck />
          ) : (
            <AlertCircle size={76} className="text-amber-500" />
          )}
        </div>
        <h2 id="payment-title" className="text-2xl font-bold tracking-tight">
          {title}
        </h2>
        <p
          id="payment-description"
          className="mt-3 text-sm leading-relaxed text-slate-500"
        >
          {description}
        </p>
        <div className="my-6 rounded-xl bg-slate-50 p-4">
          <p className="text-xs text-slate-400">
            Đơn hàng #ST-{order.orderID} ·{" "}
            {paymentLabels[order.paymentMethod as PaymentMethod] ??
              order.paymentMethod}
          </p>
          <strong
            className={`mt-1 block text-3xl font-bold ${step === "success" ? "text-emerald-600" : "text-slate-800"}`}
          >
            {money(receipt?.totalAmount ?? order.totalAmount)}
          </strong>
          {receipt?.paymentReference && (
            <p className="mt-3 break-all text-[11px] text-slate-400">
              Mã giao dịch: {receipt.paymentReference}
            </p>
          )}
        </div>
        {step === "success" && (
          <button
            autoFocus
            className="w-full rounded-xl bg-emerald-500 py-3.5 font-semibold text-white transition hover:bg-emerald-600"
            onClick={onClose}
          >
            Hoàn tất
          </button>
        )}
        {step === "error" && (
          <>
            <button
              className="w-full rounded-xl bg-orange-500 py-3.5 font-semibold text-white"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Kiểm tra / thử lại thanh toán
            </button>
            <button
              className="mt-3 text-sm text-slate-500 underline"
              onClick={onClose}
            >
              Để sau
            </button>
          </>
        )}
        {step !== "processing" && (
          <Link
            to="/my-profile/orders"
            onClick={onClose}
            className="mt-4 block text-sm text-slate-500"
          >
            Xem lịch sử đơn hàng
          </Link>
        )}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck size={13} />
          Thông tin giao dịch của bạn được bảo mật
        </p>
      </div>
    </dialog>
  );
}
