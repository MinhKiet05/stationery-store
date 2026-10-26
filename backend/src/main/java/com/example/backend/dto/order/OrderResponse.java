package com.example.backend.dto.order;
import com.example.backend.model.OrderStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
public record OrderResponse(Long orderID, Long userID, LocalDateTime orderDate, OrderStatus status,
                            String shippingAddress, String contactPhone, String paymentMethod,
                            Boolean isPaid, String couponCode, BigDecimal subTotal,
                            BigDecimal discountAmount, BigDecimal totalAmount,
                            LocalDateTime deliveredAt, List<OrderDetailResponse> items) {}
