package com.example.backend.dto.statistics;

import com.example.backend.model.OrderStatus;
import com.example.backend.model.ReturnStatus;

import java.time.LocalDate;
import java.util.Map;

public record StatisticsOrdersResponse(LocalDate startDate, LocalDate endDate,
        long totalOrders, Map<OrderStatus, Long> statusCounts,
        Map<ReturnStatus, Long> returnRequestCounts) {
}
