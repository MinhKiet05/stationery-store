package com.example.backend.dto.coupon;

import com.example.backend.model.Coupon;
import com.example.backend.model.DiscountType;
import java.math.BigDecimal;
import java.time.LocalDate;

/** Coupon data without order relationships or write access to the usage counter. */
public record CouponResponse(Long couponID, String code, DiscountType discountType,
                             BigDecimal discountValue, BigDecimal minOrderValue,
                             LocalDate startDate, LocalDate endDate, Integer usageLimit,
                             Integer usedCount, Boolean isActive) {
    public static CouponResponse from(Coupon coupon) {
        return new CouponResponse(coupon.getCouponID(), coupon.getCode(), coupon.getDiscountType(),
                coupon.getDiscountValue(), coupon.getMinOrderValue(), coupon.getStartDate(),
                coupon.getEndDate(), coupon.getUsageLimit(), coupon.getUsedCount(), coupon.getIsActive());
    }
}
