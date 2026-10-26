package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "orders")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long orderID;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "coupon_id")
    private Coupon coupon;

    private LocalDateTime orderDate;

    @Column(precision = 12, scale = 2)
    private BigDecimal totalAmount;

    @Column(length = 500)
    private String shippingAddress;

    @Column(length = 30)
    private String contactPhone;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    @Builder.Default
    private OrderStatus status = OrderStatus.PENDING;

    @Column(length = 50)
    private String paymentMethod;

    @Builder.Default
    private Boolean isPaid = false;

    @Column(precision = 12, scale = 2)
    private BigDecimal discountAmount;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<OrderDetail> orderDetails = new ArrayList<>();

    @OneToOne(mappedBy = "order")
    private ReturnRequest returnRequest;

    @PrePersist
    protected void onCreate() {
        if (orderDate == null) {
            orderDate = LocalDateTime.now();
        }
    }
}
