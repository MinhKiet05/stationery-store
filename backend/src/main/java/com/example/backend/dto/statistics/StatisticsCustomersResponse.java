package com.example.backend.dto.statistics;

import java.time.LocalDate;
import java.util.List;

public record StatisticsCustomersResponse(LocalDate startDate, LocalDate endDate,
        long totalCustomers, long activeCustomers, long inactiveCustomers,
        long newCustomers, long purchasingCustomers, CustomerRanking sortBy,
        List<TopCustomerResponse> customers) {
}
