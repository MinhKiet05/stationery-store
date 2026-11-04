package com.example.backend.dto.statistics;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record StatisticsRevenueResponse(LocalDate startDate, LocalDate endDate,
        StatisticsGroupBy groupBy, long successfulOrders, BigDecimal totalRevenue, BigDecimal totalDiscount,
        List<RevenuePeriodResponse> periods) {
}
