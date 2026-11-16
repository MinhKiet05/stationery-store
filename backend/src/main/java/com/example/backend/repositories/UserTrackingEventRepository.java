package com.example.backend.repositories;

import com.example.backend.model.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;

public interface UserTrackingEventRepository extends JpaRepository<UserTrackingEvent, Long> {
    @Query("""
            select e.product.productID from UserTrackingEvent e
            where e.user.userID = :userID
            group by e.product.productID
            order by max(e.createdAt) desc, e.product.productID desc
            """)
    List<Long> findRecentProductIds(@Param("userID") Long userID);

    boolean existsByUser_UserIDAndProduct_ProductIDAndEventTypeAndCreatedAtAfter(
            Long userID, Long productID, TrackingEventType type, LocalDateTime since);
    List<UserTrackingEvent> findTop300ByUser_UserIDAndCreatedAtAfterOrderByCreatedAtDesc(
            Long userID, LocalDateTime since);
}
