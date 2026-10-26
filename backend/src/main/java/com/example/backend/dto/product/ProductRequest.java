package com.example.backend.dto.product;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

public record ProductRequest(
        String title,
        String handle,
        String description,
        BigDecimal price,
        BigDecimal priceMin,
        BigDecimal priceMax,
        BigDecimal compareAtPrice,
        Long vendorID,
        Long productTypeID,
        List<String> images,
        Set<Long> tagIDs,
        Boolean available
) {
}