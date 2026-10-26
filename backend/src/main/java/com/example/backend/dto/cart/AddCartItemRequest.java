package com.example.backend.dto.cart;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record AddCartItemRequest(
    @NotNull Long variantID,
    @NotNull @Min(1) Integer quantity
) {}
