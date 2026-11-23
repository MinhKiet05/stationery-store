package com.example.backend.dto.coupon;

import com.example.backend.model.Coupon;
import com.example.backend.model.DiscountType;
import java.math.BigDecimal;
import java.time.LocalDate;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** Coupon data without order relationships or write access to the usage counter. */
public record CouponResponse(Long couponID, String code, DiscountType discountType,
                             BigDecimal discountValue, BigDecimal minOrderValue,
                             LocalDate startDate, LocalDate endDate, Integer usageLimit,
                             Integer usedCount, Boolean isActive) {
    /** Snapshot comparison under checkout's row lock; no schema or legacy request change. */
    @JsonProperty("stateToken")
    public String stateToken() {
        try {
            // NUMERIC columns are read back at scale 2; request values may have scale 0.
            // Compare numeric values canonically, so a freshly saved form never conflicts with itself.
            String snapshot = String.join("|", String.valueOf(couponID), String.valueOf(code), String.valueOf(discountType),
                    decimal(discountValue), decimal(minOrderValue), String.valueOf(startDate), String.valueOf(endDate),
                    String.valueOf(usageLimit), String.valueOf(usedCount), String.valueOf(isActive));
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(snapshot.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private static String decimal(BigDecimal value) { return value == null ? "null" : value.stripTrailingZeros().toPlainString(); }

    @JsonProperty("status")
    public CouponStatus status() { return CouponStatus.of(this, LocalDate.now()); }

    public static CouponResponse from(Coupon coupon) {
        return new CouponResponse(coupon.getCouponID(), coupon.getCode(), coupon.getDiscountType(),
                coupon.getDiscountValue(), coupon.getMinOrderValue(), coupon.getStartDate(),
                coupon.getEndDate(), coupon.getUsageLimit(), coupon.getUsedCount(), coupon.getIsActive());
    }
}
