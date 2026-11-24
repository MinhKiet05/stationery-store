package com.example.backend.dto.coupon;

import com.example.backend.model.DiscountType;
import jakarta.validation.constraints.Size;

public record AdminCouponFilter(@Size(max = 50) String search, CouponStatus status,
                                DiscountType discountType, Sort sort) {
    public enum Sort { ID_DESC, ID_ASC, CODE_ASC, CODE_DESC }
}
