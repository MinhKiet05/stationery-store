package com.example.backend.services;

import com.example.backend.model.*;
import com.example.backend.repositories.*;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class CheckoutService {
    private final UserRepository users;
    private final CartRepository carts;
    private final CartItemRepository items;
    private final CouponRepository coupons;
    private final CheckoutPolicy policy;

    public record QuoteRequest(ShippingMethod shippingMethod, @Size(max = 50) String couponCode) {
    }

    public record Quote(BigDecimal subTotal, BigDecimal discountAmount, BigDecimal shippingFee, BigDecimal totalAmount,
            ShippingMethod shippingMethod, String couponCode) {
    }

    @Transactional(readOnly = true)
    public Quote quote(String username, QuoteRequest request) {
        // A quote is read-only: final checkout revalidates price, stock, coupon and fee under locks.
        User user = users.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!Boolean.TRUE.equals(user.getIsActive()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        Cart cart = carts.findByUser_UserID(user.getUserID()).orElseThrow(() -> bad("Giỏ hàng trống"));
        var rows = items.findByCart_CartID(cart.getCartID());
        if (rows.isEmpty())
            throw bad("Giỏ hàng trống");
        BigDecimal subtotal = BigDecimal.ZERO;
        for (CartItem row : rows) {
            var variant = row.getVariant();
            if (row.getQuantity() == null || row.getQuantity() <= 0 || variant.getPrice() == null
                    || variant.getPrice().signum() < 0)
                throw bad("Thông tin sản phẩm không hợp lệ");
            if (!Boolean.TRUE.equals(variant.getAvailable())
                    || !Boolean.TRUE.equals(variant.getProduct().getAvailable())
                    || !Boolean.TRUE.equals(variant.getProduct().getIsActive()) || variant.getStockQuantity() == null
                    || variant.getStockQuantity() < row.getQuantity())
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Sản phẩm ngừng bán hoặc không đủ tồn kho");
            subtotal = subtotal.add(variant.getPrice().multiply(BigDecimal.valueOf(row.getQuantity())));
        }
        String code = request.couponCode() == null || request.couponCode().isBlank() ? null
                : request.couponCode().trim().toUpperCase(Locale.ROOT);
        BigDecimal discount = code == null ? BigDecimal.ZERO
                : policy.discount(
                        coupons.findByCode(code).orElseThrow(() -> bad("Mã giảm giá không hợp lệ")), subtotal);
        ShippingMethod method = policy.shippingMethod(request.shippingMethod());
        BigDecimal fee = policy.shippingFee(method, subtotal.subtract(discount));
        return new Quote(subtotal, discount, fee, subtotal.subtract(discount).add(fee), method, code);
    }

    private ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
