package com.example.backend.dto.coupon;

import java.time.LocalDate;

/** Display classification only; checkout's existing inclusive date rules are unchanged. */
public enum CouponStatus {
    DISABLED, EXPIRED, NOT_STARTED, EXHAUSTED, ACTIVE;

    public static CouponStatus of(CouponResponse c, LocalDate today) {
        if (!Boolean.TRUE.equals(c.isActive())) return DISABLED;
        if (c.endDate() != null && today.isAfter(c.endDate())) return EXPIRED;
        if (c.startDate() != null && today.isBefore(c.startDate())) return NOT_STARTED;
        if (c.usageLimit() != null && (c.usedCount() == null ? 0 : c.usedCount()) >= c.usageLimit()) return EXHAUSTED;
        return ACTIVE;
    }
}
