package com.example.backend.dto.product;

import java.math.BigDecimal;
import java.util.List;

public record ProductResponse(
        Long productID,
        String title,
        String handle,
        String description,
        BigDecimal price,
        BigDecimal priceMin,
        BigDecimal priceMax,
        BigDecimal compareAtPrice,
        Boolean available,
        Boolean isActive,
        BigDecimal ratingAverage,
        Integer reviewCount,
        Long vendorID,
        String vendorName,
        Long productTypeID,
        String productTypeName,
        List<String> images
) {
}