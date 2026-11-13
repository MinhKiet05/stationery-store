package com.example.backend.dto.statistics;

import java.math.BigDecimal;
import java.time.LocalDate;

public record StatisticsOverviewResponse(LocalDate startDate, LocalDate endDate,
        long totalOrders, long successfulOrders, BigDecimal totalRevenue, BigDecimal totalDiscount,
        long quantitySold, long totalCustomers, long newCustomers) {
}
