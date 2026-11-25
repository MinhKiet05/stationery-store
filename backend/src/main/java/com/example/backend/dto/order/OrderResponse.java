package com.example.backend.dto.order;
import com.example.backend.model.OrderStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
public record OrderResponse(Long orderID, Long userID, LocalDateTime orderDate, OrderStatus status,
                            String shippingAddress, String contactPhone, String paymentMethod,
                            Boolean isPaid, String couponCode, BigDecimal subTotal,
                            BigDecimal discountAmount, BigDecimal totalAmount,
                            LocalDateTime deliveredAt, List<OrderDetailResponse> items,
                            com.example.backend.model.ShippingMethod shippingMethod, BigDecimal shippingFee,
                            String paymentMode, LocalDateTime paidAt, String paymentReference) {
    public OrderResponse(Long id, Long user, LocalDateTime date, OrderStatus status, String address, String phone,
            String method, Boolean paid, String coupon, BigDecimal subtotal, BigDecimal discount,
            BigDecimal total, LocalDateTime delivered, List<OrderDetailResponse> items) {
        this(id, user, date, status, address, phone, method, paid, coupon, subtotal, discount, total, delivered,
                items, com.example.backend.model.ShippingMethod.STANDARD, BigDecimal.ZERO, "LIVE", null, null);
    }
}
