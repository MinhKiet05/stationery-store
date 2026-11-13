package com.example.backend.repositories;

import com.example.backend.model.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDateTime;
import java.util.List;

public interface UserTrackingEventRepository extends JpaRepository<UserTrackingEvent, Long> {
    boolean existsByUser_UserIDAndProduct_ProductIDAndEventTypeAndCreatedAtAfter(
            Long userID, Long productID, TrackingEventType type, LocalDateTime since);
    List<UserTrackingEvent> findTop300ByUser_UserIDAndCreatedAtAfterOrderByCreatedAtDesc(
            Long userID, LocalDateTime since);
}
