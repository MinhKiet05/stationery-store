package com.example.backend.services;

import com.example.backend.model.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

@Service
public class CheckoutPolicy {
    @Value("${app.shipping.standard-fee:25000}")
    private BigDecimal standardFee;
    @Value("${app.shipping.express-fee:40000}")
    private BigDecimal expressFee;
    @Value("${app.shipping.free-threshold:200000}")
    private BigDecimal freeThreshold;
    @Value("${app.payments.demo-enabled:false}")
    private boolean demoEnabled;

    public record ShippingOption(ShippingMethod code, String label, String description, BigDecimal fee) {
    }

    public record PaymentOption(PaymentMethod code, String label, String description, boolean enabled, boolean demo) {
    }

    public record Options(List<ShippingOption> shipping, List<PaymentOption> payments,
            BigDecimal freeShippingThreshold) {
    }

    public Options options() {
        return new Options(List.of(
                new ShippingOption(ShippingMethod.STANDARD, "Giao hàng tiêu chuẩn", "Dự kiến 3–5 ngày làm việc",
                        standardFee),
                new ShippingOption(ShippingMethod.EXPRESS, "Giao hàng nhanh", "Dự kiến 1–2 ngày làm việc", expressFee)),
                List.of(new PaymentOption(PaymentMethod.COD, "Thanh toán khi nhận hàng",
                        "Trả tiền cho nhân viên giao hàng", true, false),
                        payment(PaymentMethod.MOMO, "Ví điện tử MoMo"), payment(PaymentMethod.VNPAY, "VNPAY-QR"),
                        payment(PaymentMethod.BANK_TRANSFER, "Chuyển khoản VietQR"),
                        payment(PaymentMethod.CARD, "Thẻ Visa / Mastercard / JCB")),
                freeThreshold);
    }

    private PaymentOption payment(PaymentMethod method, String label) {
        String description = switch (method) {
            case MOMO -> "Xác nhận thanh toán qua ví MoMo";
            case VNPAY -> "Thanh toán bằng QR qua ứng dụng ngân hàng";
            case BANK_TRANSFER -> "Chuyển khoản ngân hàng qua VietQR";
            case CARD -> "Thanh toán bằng thẻ tín dụng hoặc thẻ ghi nợ";
            default -> "Thanh toán khi nhận hàng";
        };
        return new PaymentOption(method, label, description, demoEnabled, true);
    }

    public PaymentMethod paymentMethod(String value) {
        PaymentMethod method;
        try {
            method = PaymentMethod.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            throw bad("Phương thức thanh toán không hợp lệ");
        }
        if (method != PaymentMethod.COD && !demoEnabled)
            throw bad("Phương thức thanh toán đang tạm ngưng. Vui lòng chọn COD");
        return method;
    }

    public ShippingMethod shippingMethod(ShippingMethod method) {
        return method == null ? ShippingMethod.STANDARD : method;
    }

    public BigDecimal shippingFee(ShippingMethod method, BigDecimal merchandiseAfterDiscount) {
        // Free shipping applies to STANDARD only, using merchandise value after the coupon.
        if (merchandiseAfterDiscount.signum() < 0 || standardFee.signum() < 0 || expressFee.signum() < 0
                || freeThreshold.signum() < 0)
            throw bad("Cấu hình phí vận chuyển không hợp lệ");
        BigDecimal fee = shippingMethod(method) == ShippingMethod.EXPRESS ? expressFee
                : merchandiseAfterDiscount.compareTo(freeThreshold) >= 0 ? BigDecimal.ZERO : standardFee;
        return fee.setScale(2, RoundingMode.HALF_UP);
    }

    public BigDecimal discount(Coupon coupon, BigDecimal subtotal) {
        // Preview and order placement share the same rule; only order placement consumes usage.
        LocalDate today = LocalDate.now();
        if (!Boolean.TRUE.equals(coupon.getIsActive()))
            throw new CheckoutFailure(HttpStatus.BAD_REQUEST, "COUPON_INACTIVE", "Mã giảm giá đã ngừng áp dụng.");
        if (coupon.getStartDate() != null && today.isBefore(coupon.getStartDate()))
            throw new CheckoutFailure(HttpStatus.BAD_REQUEST, "COUPON_NOT_STARTED", "Mã giảm giá chưa đến thời gian áp dụng.");
        if (coupon.getEndDate() != null && today.isAfter(coupon.getEndDate()))
            throw new CheckoutFailure(HttpStatus.BAD_REQUEST, "COUPON_EXPIRED", "Mã giảm giá đã hết hạn.");
        if (coupon.getMinOrderValue() != null && subtotal.compareTo(coupon.getMinOrderValue()) < 0)
            throw new CheckoutFailure(HttpStatus.BAD_REQUEST, "COUPON_MINIMUM_NOT_MET", "Đơn hàng chưa đạt giá trị tối thiểu để sử dụng mã này.");
        int used = coupon.getUsedCount() == null ? 0 : coupon.getUsedCount();
        if (coupon.getUsageLimit() != null && used >= coupon.getUsageLimit())
            throw new CheckoutFailure(HttpStatus.CONFLICT, "COUPON_EXHAUSTED", "Mã giảm giá đã hết lượt sử dụng.");
        BigDecimal value = coupon.getDiscountValue();
        if (value == null || value.signum() < 0)
            throw bad("Giá trị giảm giá không hợp lệ");
        BigDecimal discount;
        if (coupon.getDiscountType() == DiscountType.PERCENTAGE) {
            if (value.compareTo(BigDecimal.valueOf(100)) > 0)
                throw bad("Phần trăm giảm giá không hợp lệ");
            discount = subtotal.multiply(value).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        } else if (coupon.getDiscountType() == DiscountType.FIXED_AMOUNT)
            discount = value;
        else
            throw bad("Loại mã giảm giá không hợp lệ");
        return discount.min(subtotal).setScale(2, RoundingMode.HALF_UP);
    }

    private ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
