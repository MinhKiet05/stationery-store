package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "product_variants")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ProductVariant {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long variantID;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 100, unique = true)
    private String sku;

    @Builder.Default
    private Boolean available = true;

    @Column(precision = 12, scale = 2)
    private BigDecimal price;

    @Column(precision = 12, scale = 2)
    private BigDecimal compareAtPrice;

    private String option1;
    private String option2;
    private String option3;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @OneToMany(mappedBy = "variant")
    @Builder.Default
    private List<OrderDetail> orderDetails = new ArrayList<>();

    @OneToMany(mappedBy = "variant")
    @Builder.Default
    private List<CartItem> cartItems = new ArrayList<>();
}
