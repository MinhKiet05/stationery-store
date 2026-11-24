package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "return_receipts")
@Getter @Setter @NoArgsConstructor
public class ReturnReceipt {
    @Id @Column(name = "return_id") private Long returnID;
    @Column(name = "received_at", nullable = false) private LocalDateTime receivedAt;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "received_by", nullable = false) private User receivedBy;
    @Column(name = "inspected_at") private LocalDateTime inspectedAt;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "inspected_by") private User inspectedBy;
    @Column(name = "inspection_note", length = 1000) private String inspectionNote;
}
