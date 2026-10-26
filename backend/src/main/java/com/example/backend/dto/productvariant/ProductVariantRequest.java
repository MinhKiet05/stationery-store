package com.example.backend.dto.productvariant;

import java.math.BigDecimal;

public record ProductVariantRequest(
        Long productID,
        String title,
        String sku,
        Boolean available,
        BigDecimal price,
        BigDecimal compareAtPrice,
        String option1,
        String option2,
        String option3,
        Integer stockQuantity
) {}
