package com.example.backend.dto.coupon;

import com.example.backend.model.DiscountType;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/** Full create/update contract. Null dates and usageLimit mean no corresponding restriction. */
public record CouponRequest(
        @NotBlank @Size(max = 50) @Pattern(regexp = "[A-Za-z0-9_-]+") String code,
        @NotNull DiscountType discountType,
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 10, fraction = 2) BigDecimal discountValue,
        @DecimalMin("0") @Digits(integer = 10, fraction = 2) BigDecimal minOrderValue,
        LocalDate startDate,
        LocalDate endDate,
        @Positive Integer usageLimit,
        @NotNull Boolean isActive,
        @Pattern(regexp = "[a-f0-9]{64}") String expectedState) {
    public CouponRequest(String code, DiscountType discountType, BigDecimal discountValue,
                         BigDecimal minOrderValue, LocalDate startDate, LocalDate endDate,
                         Integer usageLimit, Boolean isActive) {
        this(code, discountType, discountValue, minOrderValue, startDate, endDate, usageLimit, isActive, null);
    }
}
