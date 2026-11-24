package com.example.backend.dto.order;
import com.example.backend.model.OrderStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
public record AdminOrderRow(Long orderID, String username, String customerName, LocalDateTime orderDate,
        OrderStatus status, String paymentMethod, Boolean isPaid, BigDecimal subTotal, BigDecimal discountAmount, BigDecimal totalAmount) {}
