package com.example.backend.repositories;

import com.example.backend.dto.review.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.*;

/** DTO queries only. Never paginate a collection fetch or retain export entities in the session. */
@Repository
@RequiredArgsConstructor
public class AdminReviewRepository {
    private final EntityManager em;
    private static final String FROM = " from Review r join r.product p join r.user u ";
    private static final String SELECT = """
            select new com.example.backend.dto.review.AdminReviewRow(
                r.reviewID, p.productID, p.title, photo, u.userID, u.username, u.fullName,
                r.rating, r.comment, r.reviewDate)
            """;

    public record Filter(String pattern, Integer rating, LocalDateTime start, LocalDateTime end, boolean oldest) {}
    public record ImageRow(Long reviewID, String url, Integer position) {}

    public List<AdminReviewRow> find(Filter filter, int offset, int size) {
        return query(SELECT + FROM + " left join p.images photo on index(photo) = 0 " + where(filter)
                + (filter.oldest() ? " order by r.reviewDate asc, r.reviewID asc" : " order by r.reviewDate desc, r.reviewID desc"),
                AdminReviewRow.class, filter).setFirstResult(offset).setMaxResults(size).getResultList();
    }

    public Optional<AdminReviewRow> detail(Long id) {
        return em.createQuery(SELECT + FROM + " left join p.images photo on index(photo) = 0 where r.reviewID = :id", AdminReviewRow.class)
                .setParameter("id", id).getResultStream().findFirst();
    }

    public long count(Filter filter) { return query("select count(r)" + FROM + where(filter), Long.class, filter).getSingleResult(); }

    public ReviewStatisticsResponse statistics(Filter filter) {
        Object[] row = query("""
                select count(r), avg(r.rating),
                    coalesce(sum(case when r.rating = 5 then 1L else 0L end), 0L),
                    coalesce(sum(case when r.rating <= 2 then 1L else 0L end), 0L)
                """ + FROM + where(filter), Object[].class, filter).getSingleResult();
        return new ReviewStatisticsResponse(((Number) row[0]).longValue(), (Double) row[1],
                ((Number) row[2]).longValue(), ((Number) row[3]).longValue());
    }

    public Map<Long, List<ReviewImageResponse>> images(List<Long> ids) {
        Map<Long, List<ReviewImageResponse>> result = new HashMap<>();
        if (ids.isEmpty()) return result;
        var rows = em.createQuery("""
                select new com.example.backend.repositories.AdminReviewRepository$ImageRow(r.reviewID, i.imageUrl, index(i))
                from Review r join r.images i where r.reviewID in :ids order by r.reviewID, index(i)
                """, ImageRow.class).setParameter("ids", ids).getResultList();
        rows.forEach(row -> result.computeIfAbsent(row.reviewID(), key -> new ArrayList<>())
                .add(new ReviewImageResponse(row.url(), row.position())));
        return result;
    }

    private String where(Filter filter) {
        String sql = " where 1 = 1";
        if (filter.pattern() != null) sql += " and (lower(p.title) like :pattern escape '!' or lower(u.username) like :pattern escape '!' or lower(coalesce(u.fullName, '')) like :pattern escape '!')";
        if (filter.rating() != null) sql += " and r.rating = :rating";
        if (filter.start() != null) sql += " and r.reviewDate >= :start";
        if (filter.end() != null) sql += " and r.reviewDate < :end";
        return sql;
    }

    private <T> TypedQuery<T> query(String sql, Class<T> type, Filter filter) {
        TypedQuery<T> query = em.createQuery(sql, type);
        if (filter.pattern() != null) query.setParameter("pattern", filter.pattern());
        if (filter.rating() != null) query.setParameter("rating", filter.rating());
        if (filter.start() != null) query.setParameter("start", filter.start());
        if (filter.end() != null) query.setParameter("end", filter.end());
        return query;
    }
}
