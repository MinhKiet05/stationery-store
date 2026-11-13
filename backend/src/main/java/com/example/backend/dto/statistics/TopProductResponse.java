package com.example.backend.dto.statistics;

import java.math.BigDecimal;

public record TopProductResponse(Long productID, String title, long quantitySold,
        BigDecimal revenue) {
}
