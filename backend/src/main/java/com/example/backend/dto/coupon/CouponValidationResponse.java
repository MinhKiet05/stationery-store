package com.example.backend.dto.coupon;

import java.math.BigDecimal;

/** A successful preview does not reserve a redemption or increment usedCount. */
public record CouponValidationResponse(String code, BigDecimal orderValue,
                                       BigDecimal discountAmount, BigDecimal totalAmount) {
}
