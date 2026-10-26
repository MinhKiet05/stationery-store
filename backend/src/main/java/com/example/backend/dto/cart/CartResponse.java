package com.example.backend.dto.cart;
import java.math.BigDecimal;
import java.util.List;

public record CartResponse(
    Long cartID,
    List<CartItemResponse> items,
    Integer totalQuantity,
    BigDecimal subtotal
) {}
