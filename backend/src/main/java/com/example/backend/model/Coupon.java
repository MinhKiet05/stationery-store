package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "coupons")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Coupon {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long couponID;

    @Column(nullable = false, unique = true, length = 50)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DiscountType discountType;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal discountValue;

    @Column(precision = 12, scale = 2)
    private BigDecimal minOrderValue;

    private LocalDate startDate;
    private LocalDate endDate;

    private Integer usageLimit;
    @Builder.Default
    private Integer usedCount = 0;
    @Builder.Default
    private Boolean isActive = true;

    @OneToMany(mappedBy = "coupon")
    @Builder.Default
    private List<Order> orders = new ArrayList<>();
}
