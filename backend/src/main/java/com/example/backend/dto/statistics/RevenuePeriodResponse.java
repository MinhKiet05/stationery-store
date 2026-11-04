package com.example.backend.dto.statistics;

import java.math.BigDecimal;
import java.time.LocalDate;

public record RevenuePeriodResponse(LocalDate periodStart, long orderCount,
        BigDecimal totalRevenue, BigDecimal totalDiscount) {
}
