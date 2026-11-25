package com.example.backend.dto.dashboard;

import com.example.backend.model.OrderStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Bounded dashboard summary, without loading order items or customer profiles. */
public record DashboardOrderResponse(Long orderID, LocalDateTime orderDate, String customerName,
        String username, BigDecimal totalAmount, OrderStatus status, String paymentMethod, Boolean isPaid) {}
