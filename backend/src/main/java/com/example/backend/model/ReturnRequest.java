package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "return_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReturnRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long returnID;

    // Đơn hàng cần trả
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    // Khách hàng gửi yêu cầu
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Lý do trả hàng
    @Column(nullable = false, length = 1000)
    private String reason;

    // Danh sách URL hình ảnh/video minh chứng
    @Column(columnDefinition = "NVARCHAR(MAX)")
    private String evidenceImages;

    // Trạng thái yêu cầu
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ReturnStatus status = ReturnStatus.PENDING;

    // Các sản phẩm yêu cầu trả
    @OneToMany(
            mappedBy = "returnRequest",
            cascade = CascadeType.ALL,
            orphanRemoval = true
    )
    @Builder.Default
    private List<ReturnRequestItem> items = new ArrayList<>();

    // Ngày tạo yêu cầu
    @Column(nullable = false)
    private LocalDateTime createdAt;

    // Ngày xử lý yêu cầu
    private LocalDateTime processedAt;

    // Ghi chú của Admin
    @Column(length = 1000)
    private String adminNote;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}