package com.example.backend.dto.productvariant;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Digits;
import java.math.BigDecimal;

public record UpdateStockRequest(@NotNull @Min(0) @Max(2147483647) @Digits(integer = 10, fraction = 0) BigDecimal stockQuantity,
        @NotNull @Min(0) Long version) {}
