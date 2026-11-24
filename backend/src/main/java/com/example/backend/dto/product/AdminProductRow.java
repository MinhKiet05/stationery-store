package com.example.backend.dto.product;
import java.math.BigDecimal;
public record AdminProductRow(Long productID,String title,String imageUrl,String productTypeName,String vendorName,
    Boolean available,Boolean isActive,BigDecimal priceMin,BigDecimal priceMax,Long totalStock,Long variantCount,Long lowStockVariants) {}
