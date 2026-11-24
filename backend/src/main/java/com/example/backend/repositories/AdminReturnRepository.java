package com.example.backend.repositories;

import com.example.backend.dto.returns.*;
import com.example.backend.model.ReturnStatus;
import jakarta.persistence.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.*;

@Repository
@RequiredArgsConstructor
public class AdminReturnRepository {
    private final EntityManager em;
    private static final String FROM = " from ReturnRequest r join r.order o join r.user u ";
    private static final String SELECT = "select new com.example.backend.dto.returns.AdminReturnRow(r.returnID, o.orderID, u.userID, u.username, u.fullName, r.reason, r.status, r.createdAt, r.processedAt, r.adminNote)";
    public record Filter(String pattern, ReturnStatus status, LocalDateTime start, LocalDateTime end, boolean oldest) {}
    public List<AdminReturnRow> find(Filter f, int offset, int size) {
        return query(SELECT + FROM + where(f) + (f.oldest() ? " order by r.createdAt asc, r.returnID asc" : " order by r.createdAt desc, r.returnID desc"), AdminReturnRow.class, f)
                .setFirstResult(offset).setMaxResults(size).getResultList();
    }
    public Optional<AdminReturnRow> detail(Long id) {
        return em.createQuery(SELECT + FROM + " where r.returnID = :id", AdminReturnRow.class).setParameter("id", id).getResultStream().findFirst();
    }
    public long count(Filter f) { return query("select count(r)" + FROM + where(f), Long.class, f).getSingleResult(); }
    public ReturnStatisticsResponse statistics(Filter f) {
        Object[] row = query("""
            select count(r), coalesce(sum(case when r.status = PENDING then 1L else 0L end), 0L),
            coalesce(sum(case when r.status = APPROVED then 1L else 0L end), 0L),
            coalesce(sum(case when r.status = REJECTED then 1L else 0L end), 0L)
            """ + FROM + where(f), Object[].class, f).getSingleResult();
        return new ReturnStatisticsResponse(((Number) row[0]).longValue(), ((Number) row[1]).longValue(), ((Number) row[2]).longValue(), ((Number) row[3]).longValue());
    }
    public AdminReturnDetailResponse.OrderInfo order(Long id) {
        return em.createQuery("""
            select new com.example.backend.dto.returns.AdminReturnDetailResponse$OrderInfo(
                o.orderDate, o.status, o.isPaid, o.paymentMethod, o.totalAmount, o.contactPhone, o.shippingAddress, o.deliveredAt)
            from ReturnRequest r join r.order o where r.returnID = :id
            """, AdminReturnDetailResponse.OrderInfo.class).setParameter("id", id).getSingleResult();
    }
    public List<AdminReturnDetailResponse.Item> items(Long id) {
        return em.createQuery("""
            select new com.example.backend.dto.returns.AdminReturnDetailResponse$Item(
                i.returnItemID, d.orderDetailID, v.variantID, p.title, photo, v.sku, v.title, d.quantity, i.quantity, d.unitPrice)
            from ReturnRequestItem i join i.orderDetail d join d.variant v join v.product p
            left join p.images photo on index(photo) = 0 where i.returnRequest.returnID = :id order by i.returnItemID
            """, AdminReturnDetailResponse.Item.class).setParameter("id", id).getResultList();
    }
    public String evidence(Long id) { return em.createQuery("select r.evidenceImages from ReturnRequest r where r.returnID = :id", String.class).setParameter("id", id).getSingleResult(); }
    public record ReceiptHeader(LocalDateTime receivedAt, String receivedBy, LocalDateTime inspectedAt, String inspectedBy, String note) {}
    public ReturnReceiptResponse receipt(Long id) {
        var header = em.createQuery("""
            select new com.example.backend.repositories.AdminReturnRepository$ReceiptHeader(
                r.receivedAt, receiver.username, r.inspectedAt, inspector.username, r.inspectionNote)
            from ReturnReceipt r join r.receivedBy receiver left join r.inspectedBy inspector where r.returnID = :id
            """, ReceiptHeader.class).setParameter("id", id).getResultStream().findFirst();
        if (header.isEmpty()) return null;
        var h = header.get();
        var items = em.createQuery("""
            select new com.example.backend.dto.returns.ReturnReceiptResponse$Item(
                i.returnItemID, i.variant.variantID, i.receivedQuantity, i.goodQuantity, i.damagedQuantity, i.stockBefore, i.stockAfter)
            from ReturnReceiptItem i where i.receipt.returnID = :id order by i.returnItemID
            """, ReturnReceiptResponse.Item.class).setParameter("id", id).getResultList();
        return new ReturnReceiptResponse(h.receivedAt(), h.receivedBy(), h.inspectedAt(), h.inspectedBy(), h.note(), items);
    }
    private String where(Filter f) {
        String where = " where 1=1";
        if (f.pattern() != null) where += " and (lower(u.username) like :pattern escape '!' or lower(coalesce(u.fullName, '')) like :pattern escape '!'"
                + " or lower(concat('ret-', cast(r.returnID as string))) like :pattern escape '!' or lower(concat('ord-', cast(o.orderID as string))) like :pattern escape '!')";
        if (f.status() != null) where += " and r.status = :status";
        if (f.start() != null) where += " and r.createdAt >= :start";
        if (f.end() != null) where += " and r.createdAt < :end";
        return where;
    }
    private <T> TypedQuery<T> query(String sql, Class<T> type, Filter f) {
        var query = em.createQuery(sql, type);
        if (f.pattern() != null) query.setParameter("pattern", f.pattern());
        if (f.status() != null) query.setParameter("status", f.status());
        if (f.start() != null) query.setParameter("start", f.start());
        if (f.end() != null) query.setParameter("end", f.end());
        return query;
    }
}
