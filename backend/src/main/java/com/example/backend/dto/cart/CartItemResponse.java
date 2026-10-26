package com.example.backend.dto.cart;
import java.math.BigDecimal;

public record CartItemResponse(
    Long cartItemID,
    Long variantID,
    Long productID,
    String productTitle,
    String variantTitle,
    String sku,
    Integer quantity,
    BigDecimal unitPrice,
    BigDecimal lineTotal,
    Integer stockQuantity,
    Boolean available
) {}
