package com.example.backend.dto.order;
public record OrderStatisticsResponse(long totalOrders, long pendingOrders, long shippedOrders, long deliveredOrders) {}
