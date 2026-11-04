package com.example.backend.dto.coupon;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/** Preview amount only: checkout recalculates the subtotal from database prices. */
public record ValidateCouponRequest(
        @NotBlank @Size(max = 50) String code,
        @NotNull @DecimalMin(value = "0", inclusive = false)
        @Digits(integer = 10, fraction = 2) BigDecimal orderValue) {
}
