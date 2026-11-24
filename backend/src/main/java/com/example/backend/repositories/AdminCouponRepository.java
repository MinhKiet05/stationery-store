package com.example.backend.repositories;

import com.example.backend.dto.coupon.*;
import jakarta.persistence.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.*;

/** Scalar projections keep list/export bounded and never load historical orders. */
@Repository
@RequiredArgsConstructor
public class AdminCouponRepository {
    private final EntityManager em;
    public record Filter(String pattern, String status, com.example.backend.model.DiscountType type,
                         AdminCouponFilter.Sort sort, LocalDate today) {}
    // Priority matches CouponStatus.of. Null active flags are inactive, end dates inclusive.
    private static final String STATUS = "case when coalesce(c.isActive, false) = false then 'DISABLED' "
            + "when c.endDate < :today then 'EXPIRED' when c.startDate > :today then 'NOT_STARTED' "
            + "when c.usageLimit is not null and coalesce(c.usedCount, 0) >= c.usageLimit then 'EXHAUSTED' else 'ACTIVE' end";
    private String where(Filter f) {
        return " from Coupon c where 1=1"
                + (f.pattern() == null ? "" : " and upper(c.code) like :pattern escape '!'")
                + (f.type() == null ? "" : " and c.discountType = :type")
                + (f.status() == null ? "" : " and (" + STATUS + ") = :status");
    }
    private <T> TypedQuery<T> bind(TypedQuery<T> query, Filter f) {
        if (f.pattern() != null) query.setParameter("pattern", f.pattern());
        if (f.type() != null) query.setParameter("type", f.type());
        if (f.status() != null) query.setParameter("status", f.status());
        if (query.getParameters().stream().anyMatch(p -> "today".equals(p.getName()))) query.setParameter("today", f.today());
        return query;
    }
    public long count(Filter f) { return bind(em.createQuery("select count(c)" + where(f), Long.class), f).getSingleResult(); }
    public List<CouponResponse> find(Filter f, int offset, int size) {
        String sort = switch (f.sort()) {
            case ID_ASC -> "c.couponID asc"; case CODE_ASC -> "c.code asc, c.couponID asc";
            case CODE_DESC -> "c.code desc, c.couponID desc"; default -> "c.couponID desc";
        };
        return bind(em.createQuery("select new com.example.backend.dto.coupon.CouponResponse(c.couponID, c.code, "
                + "c.discountType, c.discountValue, c.minOrderValue, c.startDate, c.endDate, c.usageLimit, c.usedCount, c.isActive)"
                + where(f) + " order by " + sort, CouponResponse.class), f).setFirstResult(offset).setMaxResults(size).getResultList();
    }
    public record Statistics(long totalCoupons, long activeCoupons, long expiredCoupons, long totalUses) {}
    public Statistics statistics(Filter f) {
        Object[] row = bind(em.createQuery("select count(c), coalesce(sum(case when (" + STATUS + ") = 'ACTIVE' then 1 else 0 end), 0), "
                + "coalesce(sum(case when (" + STATUS + ") = 'EXPIRED' then 1 else 0 end), 0), coalesce(sum(coalesce(c.usedCount, 0)), 0)" + where(f), Object[].class), f).getSingleResult();
        return new Statistics(((Number) row[0]).longValue(), ((Number) row[1]).longValue(), ((Number) row[2]).longValue(), ((Number) row[3]).longValue());
    }
}
