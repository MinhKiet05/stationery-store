package com.example.backend.dto.statistics;

import java.math.BigDecimal;

public record TopCustomerResponse(Long userID, String username, String fullName,
        long orderCount, BigDecimal totalPaid) {
}
