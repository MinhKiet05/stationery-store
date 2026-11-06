package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_tracking_events")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UserTrackingEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long eventID;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;
    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 30)
    private TrackingEventType eventType;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
