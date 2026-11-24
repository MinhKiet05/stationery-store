package com.example.backend.repositories;

import com.example.backend.dto.order.*;
import com.example.backend.model.OrderStatus;
import jakarta.persistence.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.*;

@Repository
@RequiredArgsConstructor
public class AdminOrderRepository {
    private final EntityManager em;
    private static final String FROM = " from Order o join o.user u ";
    private static final String SELECT = "select new com.example.backend.dto.order.AdminOrderRow(o.orderID, u.username, u.fullName, o.orderDate, o.status, o.paymentMethod, o.isPaid, (select coalesce(sum(d.subTotal), 0) from OrderDetail d where d.order = o), o.discountAmount, o.totalAmount)";
    public record Filter(String pattern, OrderStatus status, LocalDateTime start, LocalDateTime end, Boolean paid, boolean oldest) {}
    public List<AdminOrderRow> find(Filter f, int offset, int size) {
        return query(SELECT + FROM + where(f) + (f.oldest() ? " order by o.orderDate asc, o.orderID asc" : " order by o.orderDate desc, o.orderID desc"), AdminOrderRow.class, f)
                .setFirstResult(offset).setMaxResults(size).getResultList();
    }
    public long count(Filter f) { return query("select count(o)" + FROM + where(f), Long.class, f).getSingleResult(); }
    public OrderStatisticsResponse statistics(Filter f) {
        Object[] row = query("""
            select count(o), coalesce(sum(case when o.status = PENDING then 1L else 0L end), 0L),
            coalesce(sum(case when o.status = SHIPPED then 1L else 0L end), 0L),
            coalesce(sum(case when o.status = DELIVERED then 1L else 0L end), 0L)
            """ + FROM + where(f), Object[].class, f).getSingleResult();
        return new OrderStatisticsResponse(((Number) row[0]).longValue(), ((Number) row[1]).longValue(), ((Number) row[2]).longValue(), ((Number) row[3]).longValue());
    }
    private String where(Filter f) {
        String where = " where 1=1";
        if (f.pattern() != null) where += " and (lower(u.username) like :pattern escape '!' or lower(coalesce(u.fullName, '')) like :pattern escape '!'"
                + " or lower(concat('ord-', cast(o.orderID as string))) like :pattern escape '!')";
        if (f.paid() != null) where += " and o.isPaid = :paid";
        if (f.status() != null) where += " and o.status = :status";
        if (f.start() != null) where += " and o.orderDate >= :start";
        if (f.end() != null) where += " and o.orderDate < :end";
        return where;
    }
    private <T> TypedQuery<T> query(String sql, Class<T> type, Filter f) {
        var query = em.createQuery(sql, type);
        if (f.pattern() != null) query.setParameter("pattern", f.pattern());
        if (f.paid() != null) query.setParameter("paid", f.paid());
        if (f.status() != null) query.setParameter("status", f.status());
        if (f.start() != null) query.setParameter("start", f.start());
        if (f.end() != null) query.setParameter("end", f.end());
        return query;
    }
}
