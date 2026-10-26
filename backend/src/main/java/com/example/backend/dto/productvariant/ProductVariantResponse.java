package com.example.backend.dto.productvariant;

import java.math.BigDecimal;

public record ProductVariantResponse(
        Long variantID,
        Long productID,
        String productTitle,
        String title,
        String sku,
        Boolean available,
        BigDecimal price,
        BigDecimal compareAtPrice,
        String option1,
        String option2,
        String option3,
        Integer stockQuantity,
        Long version
) {}
